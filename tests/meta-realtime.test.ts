import test from "node:test";
import assert from "node:assert/strict";
import {
  realtimeCoverage,
  statusIsStale,
} from "../lib/meta-ads/realtime-policy";
import { MetaReader } from "../lib/meta-ads/provider";
test("Meta: cobertura breve no declara listo el histórico ni otros objetos/fechas", () => {
  const s = {
    checkedAt: "2026-10-31T15:00:00Z",
    since: "2026-10-30",
    until: "2026-10-31",
    objects: ["12"],
  };
  assert(realtimeCoverage(s, "12", "2026-10-31", "2026-10-31"));
  assert(!realtimeCoverage(s, "13", "2026-10-31", "2026-10-31"));
  assert(!realtimeCoverage(s, "12", "2026-10-29", "2026-10-31"));
  assert(!realtimeCoverage({}, "12", "2026-10-31", "2026-10-31"));
  assert(statusIsStale(new Date(1000), null, 122000));
  assert(!statusIsStale(new Date(1000), null, 100000));
  assert(statusIsStale(new Date(1000), "credencial vencida", 1000));
});
test("Meta: estados visibles usan un lote de lecturas GET compatible con v26, sin ids ni cambios publicitarios", async () => {
  const base = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const u = new URL(String(input));
    assert.equal(u.pathname, "/v26.0/");
    assert(!u.searchParams.has("ids"));
    assert(!u.searchParams.has("access_token"));
    assert.equal(init?.method, "POST");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-hidden-token",
    );
    const body = new URLSearchParams(String(init?.body));
    assert(!body.has("access_token"));
    const batch = JSON.parse(body.get("batch")!);
    assert.deepEqual(
      batch.map((r: any) => {
        assert.equal(r.method, "GET");
        assert.equal(r.omit_response_on_success, false);
        const url = new URL(r.relative_url, "https://graph.facebook.com/");
        assert(!url.searchParams.has("ids"));
        assert.equal(
          url.searchParams.get("fields"),
          "id,name,account_id,status,effective_status",
        );
        return url.pathname;
      }),
      ["/12", "/13"],
    );
    return Response.json(
      calls === 1
        ? ["12", "13"].map((id) => ({
            code: 200,
            body: JSON.stringify({
              id,
              account_id: "1",
              status: "ACTIVE",
              effective_status: "ACTIVE",
            }),
          }))
        : [
            {
              code: 400,
              body: JSON.stringify({
                error: {
                  code: 190,
                  message: "Session expired synthetic-hidden-token",
                },
              }),
            },
            { code: 200, body: JSON.stringify({ id: "13" }) },
          ],
    );
  };
  try {
    const r = new MetaReader("synthetic-hidden-token", "API", "v26.0");
    const p = await r.get("campaigns", {
      accountId: "1",
      ids: ["12", "13"],
      statusOnly: true,
    });
    assert.equal(p.data.length, 2);
    assert.equal(calls, 1);
    await assert.rejects(
      () =>
        r.get("campaigns", {
          accountId: "1",
          ids: ["12", "13"],
          statusOnly: true,
        }),
      (e) =>
        e instanceof Error &&
        e.message.includes("190") &&
        !e.message.includes("synthetic-hidden-token"),
    );
    await assert.rejects(
      () =>
        r.get("insights", { accountId: "1", ids: ["12"], statusOnly: true }),
      /inválida/,
    );
    await assert.rejects(
      () => r.get("campaigns", { ids: ["12", "12"], statusOnly: true }),
      /inválida/,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = base;
  }
});
test("Meta: el progreso incremental termina antes del histórico y describe su alcance", async () => {
  const { syncProgress } = await import("../lib/meta-ads/sync-progress");
  const base = {
    enabled: true,
    syncedAt: new Date(),
    nextSyncAt: null,
    syncError: null,
  };
  const p = syncProgress({
    ...base,
    syncState: {
      plan: "focus",
      refreshOnly: true,
      inventory: "all",
      phase: 9,
      recentDays: 7,
    },
  });
  assert.equal(p.totalPhases, 10);
  assert.match(p.scope!, /7 días/);
  const done = syncProgress({
    ...base,
    syncState: { lastRun: { plan: "focus", refreshOnly: true, recentDays: 7 } },
  });
  assert.equal(done.phase, 10);
  assert.match(done.label, /reciente/);
});

test("Meta: lote incompleto, objeto ajeno y límite por subconsulta no reintentan ni ocultan autorización", async () => {
  const original = globalThis.fetch;
  let mode = "quota",
    calls = 0,
    limited = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    const p = new URLSearchParams(String(init?.body));
    assert.equal(p.get("appsecret_proof")?.length, 64);
    assert(!String(init?.body).includes("test-app-secret"));
    const request = JSON.parse(p.get("batch")!)[0];
    assert.equal(request.method, "GET");
    assert(
      new URL(
        request.relative_url,
        "https://graph.facebook.com/",
      ).searchParams.has("appsecret_proof"),
    );
    return mode === "quota"
      ? Response.json([
          {
            code: 429,
            body: JSON.stringify({ error: { code: 4, message: "Rate limit" } }),
          },
        ])
      : mode === "incomplete"
        ? Response.json([])
        : mode === "foreign"
          ? Response.json([{ code: 200, body: JSON.stringify({ id: "999" }) }])
          : new Response("Unauthorized", { status: 401 });
  };
  try {
    const r = new MetaReader(
      "synthetic-batch-token",
      "API",
      "v26.0",
      "test-app-secret",
      {
        beforeRead: async () => {},
        limited: async () => {
          limited++;
        },
      },
    );
    await assert.rejects(
      () => r.get("ads", { ids: ["12"], statusOnly: true }),
      /4|429/,
    );
    assert.equal(calls, 1);
    assert.equal(limited, 1);
    mode = "incomplete";
    await assert.rejects(
      () => r.get("ads", { ids: ["12"], statusOnly: true }),
      /todos los estados/,
    );
    mode = "foreign";
    await assert.rejects(
      () => r.get("ads", { ids: ["12"], statusOnly: true }),
      /otro objeto/,
    );
    mode = "unauthorized";
    await assert.rejects(
      () => r.get("ads", { ids: ["12"], statusOnly: true }),
      /401/,
    );
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = original;
  }
});
