import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { refreshVisibleMeta } from "../lib/meta-ads/realtime-refresh";
import { writeSyncPage } from "../lib/meta-ads/bulk-sync";
import { dashboard } from "../lib/meta-ads/dashboard";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
test("Meta visible: estado actual y gasto breve independientes del histórico", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    root = String(Date.now()) + "61",
    cid = "live-" + tag,
    uid = "live-user-" + tag,
    viewer = "live-view-" + tag,
    ids = [root + "1", root + "2"],
    today = localDay("America/Lima"),
    yesterday = shiftDay(today, -1),
    old = new Date(Date.now() - 86400000),
    original = globalThis.fetch,
    actor = { id: uid, role: "OWNER" };
  let mode = "ok",
    calls = 0;
  const cursor = {
    plan: "focus",
    phase: 10,
    objectAfter: "saved",
    recentDays: 7,
    until: today,
    started: old.toISOString(),
    historyProcessed: 100,
  };
  await db.user.createMany({
    data: [
      {
        id: uid,
        name: "QA live",
        email: uid + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
      {
        id: viewer,
        name: "QA view",
        email: viewer + "@example.test",
        passwordHash: "synthetic",
        role: "OBSERVER",
        status: "APPROVED",
      },
    ],
  });
  await db.metaConnection.create({
    data: {
      id: cid,
      ownerId: uid,
      name: "QA live",
      transport: "API",
      apiVersion: "v26.0",
      verifiedAt: new Date(),
      encryptedToken: encryptKey("synthetic-live-token", "meta:" + cid),
    },
  });
  await db.metaAdAccount.create({
    data: {
      id: root,
      connectionId: cid,
      name: "QA live",
      currency: "PEN",
      timezone: "America/Lima",
      metric: "MESSAGES",
      enabled: true,
      nextSyncAt: old,
      syncState: cursor,
    },
  });
  await db.metaAdObject.createMany({
    data: ids.map((id) => ({
      id,
      accountId: root,
      level: "campaign",
      name: "QA " + id,
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      seenAt: old,
      selectedAt: old,
    })),
  });
  await db.metaWorkspaceGrant.create({
    data: { userId: viewer, grantedById: uid, permission: "VIEW" },
  });
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, "graph.facebook.com");
    assert(!u.searchParams.has("access_token"));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-live-token",
    );
    calls++;
    if (mode === "changed") {
      await db.metaConnection.update({
        where: { id: cid },
        data: { revision: { increment: 1 } },
      });
      mode = "ok";
    }
    if (mode === "expired")
      return Response.json(
        {
          error: {
            code: 190,
            error_subcode: 463,
            message: "Session has expired",
          },
        },
        { status: 401 },
      );
    if (init?.method === "POST") {
      assert.equal(u.pathname, "/v26.0/");
      assert(!u.searchParams.has("ids"));
      const batch = JSON.parse(
        new URLSearchParams(String(init.body)).get("batch")!,
      );
      assert.deepEqual(
        batch.map((p: any) => {
          assert.equal(p.method, "GET");
          return p.relative_url.split("?")[0];
        }),
        ids,
      );
      if (mode === "revoke")
        await db.metaWorkspaceGrant.update({
          where: { userId: uid },
          data: { permission: "VIEW" },
        });
      return Response.json(
        ids.map((id) => ({
          code: 200,
          body: JSON.stringify({
            id,
            account_id: mode === "foreign" ? "123" : root,
            status: "PAUSED",
            effective_status: "PAUSED",
          }),
        })),
      );
    }
    assert.equal(u.pathname, "/v26.0/act_" + root + "/insights");
    assert.deepEqual(JSON.parse(u.searchParams.get("time_range")!), {
      since: yesterday,
      until: today,
    });
    if (mode === "report-error")
      return Response.json(
        { error: { code: 100, message: "Synthetic report unavailable" } },
        { status: 400 },
      );
    return Response.json({
      data: [
        {
          account_id: root,
          campaign_id: ids[0],
          date_start: today,
          date_stop: today,
          spend: "9",
          impressions: "10",
          clicks: "1",
          actions: [
            {
              action_type:
                "onsite_conversion.messaging_conversation_started_7d",
              value: "3",
            },
          ],
        },
      ],
    });
  };
  const reset = () =>
    db.metaAdAccount.update({
      where: { id: root },
      data: { realtimeState: {} },
    });
  try {
    await t.test(
      "Lectura breve cambia ACTIVE guardado a PAUSED sin tocar cursor, agenda ni completar histórico",
      async () => {
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(r.updated);
        assert.equal(calls, 2);
        const a = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: root },
        });
        assert.deepEqual(a.syncState, cursor);
        assert.equal(a.syncedAt, null);
        assert.equal(a.nextSyncAt!.valueOf(), old.valueOf());
        for (const o of await db.metaAdObject.findMany({
          where: { id: { in: ids } },
        }))
          assert.equal(o.status, "PAUSED");
        assert.equal(
          await db.metaEffectivenessEvent.count({ where: { actorId: uid } }),
          0,
        );
        const days = await db.metaAdDaily.findMany({
          where: { accountId: root },
        });
        assert.equal(days.length, 4);
        assert.equal(
          Number(
            days.find((d) => d.objectId === ids[0] && d.day === today)!.spend,
          ),
          9,
        );
        assert.equal(
          Number(
            days.find((d) => d.objectId === ids[1] && d.day === today)!.spend,
          ),
          0,
        );
      },
    );
    await t.test("Cooldown compartido evita llamadas repetidas", async () => {
      const n = calls;
      const r = await refreshVisibleMeta(actor, root, { objects: ids });
      assert(r.waiting);
      assert.equal(calls, n);
    });
    await t.test(
      "Dashboard muestra gasto recibido sin fingir histórico completo y mantiene parciales",
      async () => {
        const r = await dashboard(
          actor,
          new URLSearchParams({
            accounts: root,
            level: "campaign",
            analysisPeriod: "today",
            summary: "1",
            limit: "25",
          }),
        );
        const o = r.items.find((o) => o.id === ids[0])!;
        assert.equal(o.periods.today.spend, 9);
        assert.notEqual(o.periods.today.state, "UNAVAILABLE");
        assert.equal(o.status, "PAUSED");
        assert.equal(o.statusStale, false);
        assert.equal(o.periods["7"].state, "UNAVAILABLE");
        assert(r.summary!.partial);
      },
    );
    await t.test(
      "Página antigua no revierte estado ni gasto recién leído",
      async () => {
        await db.$transaction(async (tx) => {
          await writeSyncPage(
            tx,
            [
              {
                id: ids[0],
                accountId: root,
                level: "campaign",
                name: "QA antiguo",
                status: "ACTIVE",
                effectiveStatus: "ACTIVE",
              },
            ],
            [
              {
                id: randomUUID(),
                accountId: root,
                objectId: ids[0],
                day: today,
                scope: "7d_click,1d_view|impression",
                spend: 1,
                impressions: 1,
                clicks: 0,
                actions: {},
              },
            ],
            true,
            old,
          );
        });
        assert.equal(
          (await db.metaAdObject.findUniqueOrThrow({ where: { id: ids[0] } }))
            .status,
          "PAUSED",
        );
        assert.equal(
          Number(
            (
              await db.metaAdDaily.findFirstOrThrow({
                where: { objectId: ids[0], day: today },
              })
            ).spend,
          ),
          9,
        );
      },
    );
    await t.test(
      "VIEW y selección ajena se rechazan antes de consultar Meta",
      async () => {
        const n = calls;
        await assert.rejects(
          () =>
            refreshVisibleMeta({ id: viewer, role: "OBSERVER" }, root, {
              objects: ids,
            }),
          /permiso/i,
        );
        await assert.rejects(
          () => refreshVisibleMeta(actor, root, { objects: ["9999999"] }),
          /otra cuenta|disponibles/i,
        );
        assert.equal(calls, n);
      },
    );
    await t.test(
      "Fallo del informe conserva estado confirmado y gasto anterior",
      async () => {
        await reset();
        mode = "report-error";
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(!r.updated && r.error);
        assert.equal(
          (await db.metaAdObject.findUniqueOrThrow({ where: { id: ids[0] } }))
            .status,
          "PAUSED",
        );
        assert.equal(
          Number(
            (
              await db.metaAdDaily.findFirstOrThrow({
                where: { objectId: ids[0], day: today },
              })
            ).spend,
          ),
          9,
        );
      },
    );
    await t.test(
      "Token vencido requiere reconectar sin reiniciar histórico ni publicar ceros",
      async () => {
        await reset();
        mode = "expired";
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(r.authorizationRequired);
        assert.match(r.error!, /autorización|Reconecta/);
        const a = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: root },
        });
        assert.deepEqual(a.syncState, cursor);
        assert.equal((a.realtimeState as any).claim, undefined);
        await db.metaAdAccount.update({
          where: { id: root },
          data: {
            realtimeState: {
              ...(a.realtimeState as any),
              nextAt: "2000-01-01T00:00:00Z",
            },
          },
        });
        const n = calls;
        const blocked = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(blocked.authorizationRequired);
        assert.equal(
          calls,
          n,
          "No se reintenta el token vencido hasta renovar revisión",
        );
        assert.equal(
          Number(
            (
              await db.metaAdDaily.findFirstOrThrow({
                where: { objectId: ids[0], day: today },
              })
            ).spend,
          ),
          9,
        );
      },
    );
    await t.test(
      "Cambio de credencial durante la lectura descarta la respuesta",
      async () => {
        await reset();
        mode = "changed";
        const before = await db.metaAdObject.findUniqueOrThrow({
          where: { id: ids[0] },
        });
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(!r.updated);
        assert.match(r.error!, /conexión cambió/i);
        assert.equal(
          (
            await db.metaAdObject.findUniqueOrThrow({ where: { id: ids[0] } })
          ).seenAt.valueOf(),
          before.seenAt.valueOf(),
        );
        const recovered = await refreshVisibleMeta(actor, root, {
          objects: ids,
        });
        assert(
          recovered.updated,
          "La nueva revisión no hereda el turno de la credencial anterior",
        );
      },
    );
    await t.test(
      "Respuesta de otra cuenta no contamina estados ni informes",
      async () => {
        await reset();
        mode = "foreign";
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(!r.updated);
        assert.match(r.error!, /ajeno/i);
      },
    );
  } finally {
    globalThis.fetch = original;
    await db.metaAdAccount.delete({ where: { id: root } });
    await db.metaConnection.delete({ where: { id: cid } });
    await db.metaWorkspaceGrant.deleteMany({
      where: { userId: { in: [uid, viewer] } },
    });
    await db.user.deleteMany({ where: { id: { in: [uid, viewer] } } });
    await db.$disconnect();
  }
});
