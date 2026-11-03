import test from "node:test";
import assert from "node:assert/strict";
import {
  realtimeCoverage,
  mergeRealtimeCoverage,
  realtimeSelectionCheckedAt,
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

test("Meta pause scheduling honors a long server backoff and recent reads take precedence over history only", async () => {
  const { visibleRefreshDelay, historicalReadDeferral } =
    await import("../lib/meta-ads/realtime-policy");
  const now = Date.parse("2026-11-03T12:00:00Z");
  assert.equal(visibleRefreshDelay(now + 1800000, now), 1800000);
  assert.equal(visibleRefreshDelay(null, now), 60000);
  assert.equal(visibleRefreshDelay(now - 1, now), 1000);
  const live = { priorityUntil: new Date(now + 90000).toISOString() };
  assert.equal(
    historicalReadDeferral(
      { plan: "focus", phase: 10, recentReady: true },
      live,
      now,
    )?.getTime(),
    now + 90000,
  );
  assert.equal(
    historicalReadDeferral(
      { plan: "focus", phase: 9, recentReady: false },
      live,
      now,
    ),
    null,
  );
  assert.equal(
    historicalReadDeferral(
      { plan: "focus", phase: 10, recentReady: true, refreshOnly: true },
      live,
      now,
    ),
    null,
  );
  assert.equal(
    historicalReadDeferral(
      { plan: "focus", phase: 10, recentReady: true },
      live,
      now + 90001,
    ),
    null,
  );
});

test("Meta backoff is gradual, bounded and never shorter than a supplied provider deadline", async () => {
  const { metaQuotaPauseMs } = await import("../lib/meta-ads/realtime-policy");
  assert.equal(metaQuotaPauseMs(1, 0), 60000);
  assert.equal(metaQuotaPauseMs(2, 0), 120000);
  assert.equal(metaQuotaPauseMs(5, 0), 900000);
  assert.equal(metaQuotaPauseMs(1, 1800000), 1800000);
  assert.equal(metaQuotaPauseMs(1, 864000000), 86400000);
});

test("Meta conserva cobertura por fila al cambiar página sin rejuvenecer las anteriores", () => {
  const one = "2026-11-03T15:00:00Z",
    two = "2026-11-03T15:01:00Z",
    since = "2026-11-02",
    until = "2026-11-03";
  const first = { since, until, revision: 2, checkedAt: one, objects: ["11"] };
  const coverage = mergeRealtimeCoverage(
    first,
    ["22"],
    ["22"],
    since,
    until,
    2,
    two,
  );
  const second = {
    since,
    until,
    revision: 2,
    checkedAt: two,
    objects: ["22"],
    coverage,
  };
  assert(realtimeCoverage(second, "11", until, until));
  assert(realtimeCoverage(second, "22", until, until));
  assert.equal(realtimeSelectionCheckedAt(second, ["11"], since, until), one);
  assert.equal(
    realtimeSelectionCheckedAt(second, ["11", "22"], since, until),
    one,
  );
  assert.equal(realtimeSelectionCheckedAt(second, ["33"], since, until), null);
  assert(!realtimeCoverage(second, "11", "2026-11-01", until));
  assert.deepEqual(
    mergeRealtimeCoverage(
      second,
      ["33"],
      ["33"],
      "2026-11-03",
      "2026-11-04",
      2,
      two,
    ),
    { "33": two },
  );
  assert.deepEqual(
    mergeRealtimeCoverage(second, ["33"], ["33"], since, until, 3, two),
    { "33": two },
  );
  assert.deepEqual(
    mergeRealtimeCoverage(second, ["11"], [], since, until, 2, two),
    { "22": two },
  );
  const large = {
    ...second,
    coverage: Object.fromEntries(
      Array.from({ length: 700 }, (_, i) => [String(i + 1), one]),
    ),
  };
  const bounded = mergeRealtimeCoverage(
    large,
    ["9999"],
    ["9999"],
    since,
    until,
    2,
    two,
  );
  assert.equal(Object.keys(bounded).length, 500);
  assert.equal(bounded["9999"], two);
});
