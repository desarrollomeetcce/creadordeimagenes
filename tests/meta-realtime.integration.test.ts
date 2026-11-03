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
  const sharedBefore = await db.metaWorkspaceSharing.findUnique({
    where: { id: "global" },
  });
  const changedPrimary = Array.isArray(sharedBefore?.primaryAccountIds);
  if (changedPrimary)
    await db.metaWorkspaceSharing.update({
      where: { id: "global" },
      data: {
        primaryAccountIds: [
          ...(sharedBefore!.primaryAccountIds as string[]),
          root,
        ],
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
    db.$transaction(async (tx) => {
      await tx.metaAdObject.updateMany({
        where: { accountId: root },
        data: { seenAt: old },
      });
      return tx.metaAdAccount.update({
        where: { id: root },
        data: { realtimeState: {} },
      });
    });
  try {
    await t.test(
      "Lectura breve cambia ACTIVE guardado a PAUSED sin tocar cursor, agenda ni completar histórico",
      async () => {
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(r.updated);
        assert.equal(r.statusUpdated, true);
        assert.equal(r.covered, true);
        assert(r.nextAt);
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
      assert.equal(r.covered, true);
      assert(r.checkedAt);
      assert(r.nextAt);
      assert.equal(calls, n);
    });
    await t.test(
      "Estados recientes se reutilizan sin repetir GETs; gasto sigue consultándose",
      async () => {
        const before = await db.metaAdObject.findMany({
          where: { accountId: root },
          orderBy: { id: "asc" },
        });
        await db.metaAdAccount.update({
          where: { id: root },
          data: { realtimeState: {} },
        });
        const n = calls,
          r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(r.updated);
        assert.equal(r.statusUpdated, false);
        assert.equal(calls, n + 1);
        const after = await db.metaAdObject.findMany({
          where: { accountId: root },
          orderBy: { id: "asc" },
        });
        assert.deepEqual(
          after.map((o) => o.seenAt),
          before.map((o) => o.seenAt),
        );
        const saved = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: root },
        });
        assert.equal(
          (saved.realtimeState as any).statusAt,
          before[0].seenAt.toISOString(),
        );
      },
    );
    await t.test(
      "Estado que supera120s se vuelve a comprobar además del gasto",
      async () => {
        await reset();
        const n = calls;
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(r.updated);
        assert(r.statusUpdated);
        assert.equal(calls, n + 2);
      },
    );
    await t.test(
      "Visible reads postpone only the saved history tail without Graph or losing its cursor",
      async () => {
        const { syncStep } = await import("../lib/meta-ads/service");
        const count = calls;
        const state = {
          ...cursor,
          recentReady: true,
          phase: 10,
          after: "saved-history-cursor",
        };
        await db.metaAdAccount.update({
          where: { id: root },
          data: { syncState: state, nextSyncAt: old },
        });
        assert.equal(await syncStep(root), false);
        assert.equal(calls, count);
        const saved = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: root },
        });
        assert.deepEqual(saved.syncState, state);
        assert(saved.nextSyncAt! > new Date());
        assert.equal(saved.syncToken, null);
        await db.metaAdAccount.update({
          where: { id: root },
          data: { syncState: cursor, nextSyncAt: old },
        });
      },
    );
    await t.test(
      "A visible read reserves the shared credential budget ahead of another account's history",
      async () => {
        const { syncStep } = await import("../lib/meta-ads/service");
        const other = root + "99";
        const count = calls;
        const state = {
          ...cursor,
          recentReady: true,
          phase: 10,
          objectAfter: "history-shared-credential",
        };
        await db.metaAdAccount.create({
          data: {
            id: other,
            connectionId: cid,
            name: "QA other history",
            currency: "PEN",
            timezone: "America/Lima",
            metric: "MESSAGES",
            enabled: true,
            nextSyncAt: old,
            syncState: state,
          },
        });
        try {
          assert.equal(await syncStep(other), false);
          assert.equal(calls, count);
          const saved = await db.metaAdAccount.findUniqueOrThrow({
            where: { id: other },
          });
          assert.deepEqual(saved.syncState, state);
          assert(saved.nextSyncAt! > new Date());
          assert.equal(saved.syncToken, null);
        } finally {
          await db.metaAdAccount.delete({ where: { id: other } });
        }
      },
    );
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
      "Incomplete selected date range exposes stored Meta amount as partial without claiming complete coverage",
      async () => {
        const result = await dashboard(
          actor,
          new URLSearchParams({
            accounts: root,
            level: "campaign",
            objectSelection: ids.join(","),
            since: shiftDay(today, -6),
            until: today,
            analysisPeriod: "custom",
            summary: "0",
          }),
        );
        const period = result.items.find((o) => o.id === ids[0])!.periods
          .custom;
        assert.equal(period.state, "UNAVAILABLE");
        assert.equal(period.metaAvailable, false);
        assert.equal(period.reportedMeta, true);
        assert.equal(period.metaPartial, true);
        assert.equal(period.spend, 9);
        assert(result.items[0].alias === null);
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
              recover: true,
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
        assert.equal(r.statusUpdated, true);
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
      "Conexión pendiente y aviso heredado se verifican con informe acotado, sin descubrir cuentas",
      async () => {
        mode = "ok";
        await reset();
        await db.metaConnection.update({
          where: { id: cid },
          data: { verifiedAt: null, lastError: "Verificación pendiente" },
        });
        const c = await db.metaConnection.findUniqueOrThrow({
          where: { id: cid },
        });
        await db.metaAdAccount.update({
          where: { id: root },
          data: {
            realtimeState: {
              revision: c.revision,
              authorizationRequired: true,
              error: "La autorización de Meta venció o fue rechazada.",
              nextAt: new Date(Date.now() + 30000).toISOString(),
            },
          },
        });
        const n = calls;
        const waiting = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(waiting.waiting);
        assert.equal(waiting.authorizationRequired, false);
        assert.match(waiting.error!, /pendiente de comprobar/);
        assert.equal(calls, n);
        const pending = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: root },
        });
        await db.metaAdAccount.update({
          where: { id: root },
          data: {
            realtimeState: {
              ...(pending.realtimeState as any),
              nextAt: "2000-01-01T00:00:00Z",
            },
          },
        });
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(r.updated);
        assert.equal(calls, n + 2);
        assert(
          (await db.metaConnection.findUniqueOrThrow({ where: { id: cid } }))
            .verifiedAt,
        );
        const saved = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: root },
        });
        assert.deepEqual(saved.syncState, cursor);
        assert(!(saved.realtimeState as any).authorizationRequired);
      },
    );
    await t.test(
      "Token vencido requiere reconectar sin reiniciar histórico ni publicar ceros",
      async () => {
        await reset();
        mode = "expired";
        await db.metaConnection.update({
          where: { id: cid },
          data: { verifiedAt: null },
        });
        const r = await refreshVisibleMeta(actor, root, { objects: ids });
        assert(r.authorizationRequired);
        assert.match(r.error!, /código 190/);
        assert.equal(
          (await db.metaConnection.findUniqueOrThrow({ where: { id: cid } }))
            .verifiedAt,
          null,
        );
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
        assert.equal((a.realtimeState as any).authorizationSource, "META");
        await db.metaConnection.update({
          where: { id: cid },
          data: { verifiedAt: new Date() },
        });
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
      "Recupera informe visible desde pausa antigua sin tocar agenda ni histórico",
      async () => {
        const { metaQuotaScope } = await import("../lib/meta-ads/quota");
        const c = await db.metaConnection.findUniqueOrThrow({
            where: { id: cid },
          }),
          q = metaQuotaScope(c, "synthetic-live-token");
        const keys = [q, "provider:" + q, "recovery:" + q];
        try {
          mode = "ok";
          await reset();
          const pause = new Date(Date.now() + 8 * 3600000).toISOString();
          const saved = await db.metaAdAccount.findUniqueOrThrow({
            where: { id: root },
          });
          await db.metaApiQuota.upsert({
            where: { scope: q },
            create: {
              scope: q,
              blockedUntil: new Date(pause),
              lastLimitedAt: old,
              failures: 5,
            },
            update: {
              blockedUntil: new Date(pause),
              lastLimitedAt: old,
              failures: 5,
            },
          });
          await db.metaAdAccount.update({
            where: { id: root },
            data: {
              realtimeState: {
                revision: c.revision,
                nextAt: pause,
                error:
                  "Meta limitó las consultas. El avance está guardado; se volverá a intentar después de la pausa.",
              },
            },
          });
          const n = calls;
          const waiting = await refreshVisibleMeta(actor, root, {
            objects: ids,
          });
          assert(waiting.waiting);
          assert.equal(calls, n);
          const r = await refreshVisibleMeta(actor, root, {
            objects: ids,
            recover: true,
          });
          assert(r.updated);
          assert.equal(calls, n + 2);
          const after = await db.metaAdAccount.findUniqueOrThrow({
            where: { id: root },
          });
          assert.deepEqual(after.syncState, saved.syncState);
          assert.equal(
            after.nextSyncAt?.valueOf(),
            saved.nextSyncAt?.valueOf(),
          );
          const repeat = await refreshVisibleMeta(actor, root, {
            objects: ids,
            recover: true,
          });
          assert(repeat.waiting);
          assert.equal(calls, n + 2);
          // Other pages with the old local error resume normally once the shared pause is gone.
          await db.metaAdAccount.update({
            where: { id: root },
            data: {
              realtimeState: {
                revision: c.revision,
                nextAt: pause,
                error: "Meta limitó las consultas.",
              },
            },
          });
          assert(
            (await refreshVisibleMeta(actor, root, { objects: ids })).updated,
          );
        } finally {
          await db.metaApiQuota.deleteMany({ where: { scope: { in: keys } } });
        }
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
        assert.equal(r.statusUpdated, false);
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
    if (changedPrimary)
      await db.metaWorkspaceSharing.update({
        where: { id: "global" },
        data: { primaryAccountIds: sharedBefore!.primaryAccountIds! },
      });
    await db.$disconnect();
  }
});
