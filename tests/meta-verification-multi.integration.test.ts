import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { refreshVisibleMeta } from "../lib/meta-ads/realtime-refresh";
import { localDay } from "../lib/meta-ads/analytics";
test("Verificación pendiente compartida: recuperación de todas las principales", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    uid = "verify-user-" + tag,
    cid = "verify-conn-" + tag,
    baseId = Date.now() + "92",
    ids = [baseId + "1", baseId + "2"],
    objects = ids.map((id) => id + "1"),
    today = localDay("America/Lima"),
    original = globalThis.fetch,
    previous = await db.metaWorkspaceSharing.findUnique({
      where: { id: "global" },
    }),
    actor = { id: uid, role: "OWNER" };
  let calls = 0,
    rejected = false;
  await db.user.create({
    data: {
      id: uid,
      name: "QA verify",
      email: uid + "@example.test",
      role: "OWNER",
      status: "APPROVED",
      passwordHash: "synthetic",
    },
  });
  await db.metaConnection.create({
    data: {
      id: cid,
      ownerId: uid,
      name: "QA verify shared",
      transport: "API",
      apiVersion: "v26.0",
      verifiedAt: null,
      encryptedToken: encryptKey("synthetic-verify-shared", "meta:" + cid),
    },
  });
  await db.metaAdAccount.createMany({
    data: ids.map((id) => ({
      id,
      connectionId: cid,
      name: "QA " + id,
      currency: "PEN",
      timezone: "America/Lima",
      enabled: true,
      syncState: { phase: 9, after: "saved-" + id },
      realtimeState: {
        revision: 1,
        authorizationRequired: true,
        error: "La autorización de Meta venció o fue rechazada.",
        nextAt: "2000-01-01T00:00:00Z",
      },
    })),
  });
  await db.metaAdObject.createMany({
    data: objects.map((id, i) => ({
      id,
      accountId: ids[i],
      level: "campaign",
      name: "QA " + id,
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      seenAt: new Date("2026-01-01"),
    })),
  });
  await db.metaWorkspaceSharing.upsert({
    where: { id: "global" },
    create: { id: "global", primaryAccountIds: ids },
    update: { primaryAccountIds: ids },
  });
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, "graph.facebook.com");
    calls++;
    assert(!u.pathname.includes("/me/adaccounts"));
    if (rejected)
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
      const batch = JSON.parse(
        new URLSearchParams(String(init.body)).get("batch")!,
      );
      return Response.json(
        batch.map((r: any) => {
          assert.equal(r.method, "GET");
          const oid = r.relative_url.split("?")[0],
            i = objects.indexOf(oid);
          assert(i >= 0);
          return {
            code: 200,
            body: JSON.stringify({
              id: oid,
              account_id: ids[i],
              status: "ACTIVE",
              effective_status: "ACTIVE",
            }),
          };
        }),
      );
    }
    const aid = u.pathname.match(/act_(\d+)\/insights/)?.[1],
      i = ids.indexOf(aid!);
    assert(i >= 0);
    return Response.json({
      data: [
        {
          account_id: aid,
          campaign_id: objects[i],
          date_start: today,
          date_stop: today,
          spend: i === 0 ? "17.5" : "26.75",
          impressions: "10",
          clicks: "1",
          actions: [
            {
              action_type:
                "onsite_conversion.messaging_conversation_started_7d",
              value: "4",
            },
          ],
        },
      ],
    });
  };
  try {
    await t.test(
      "Primera cuenta verifica conexión con estados e informe; no importa todo el catálogo",
      async () => {
        const r = await refreshVisibleMeta(actor, ids[0], {
          objects: [objects[0]],
        });
        assert(r.updated);
        assert.equal(calls, 2);
        assert(
          (await db.metaConnection.findUniqueOrThrow({ where: { id: cid } }))
            .verifiedAt,
        );
      },
    );
    await t.test(
      "Segunda cuenta elimina aviso heredado aunque la primera ya verificó la conexión",
      async () => {
        const r = await refreshVisibleMeta(actor, ids[1], {
          objects: [objects[1]],
        });
        assert(r.updated);
        assert.equal(calls, 4);
        for (let i = 0; i < ids.length; i++) {
          const a = await db.metaAdAccount.findUniqueOrThrow({
            where: { id: ids[i] },
          });
          assert.deepEqual(a.syncState, { phase: 9, after: "saved-" + ids[i] });
          assert(!(a.realtimeState as any).authorizationRequired);
          assert.equal(
            Number(
              (
                await db.metaAdDaily.findFirstOrThrow({
                  where: { objectId: objects[i], day: today },
                })
              ).spend,
            ),
            i === 0 ? 17.5 : 26.75,
          );
        }
      },
    );
    await t.test(
      "Rechazo real de la credencial queda identificado en ambas cuentas y preserva gasto",
      async () => {
        rejected = true;
        await db.metaAdAccount.updateMany({
          where: { id: { in: ids } },
          data: { realtimeState: {} },
        });
        for (let i = 0; i < ids.length; i++) {
          const r = await refreshVisibleMeta(actor, ids[i], {
            objects: [objects[i]],
          });
          assert(r.authorizationRequired);
          assert.match(r.error!, /código 190/);
          const a = await db.metaAdAccount.findUniqueOrThrow({
            where: { id: ids[i] },
          });
          assert.equal((a.realtimeState as any).authorizationSource, "META");
          assert.equal(
            Number(
              (
                await db.metaAdDaily.findFirstOrThrow({
                  where: { objectId: objects[i], day: today },
                })
              ).spend,
            ),
            i === 0 ? 17.5 : 26.75,
          );
        }
      },
    );
    await t.test(
      "Una vez confirmado rechazo no se repite hasta renovar autorización",
      async () => {
        const n = calls;
        for (let i = 0; i < ids.length; i++)
          assert(
            (await refreshVisibleMeta(actor, ids[i], { objects: [objects[i]] }))
              .authorizationRequired,
          );
        assert.equal(calls, n);
      },
    );
  } finally {
    globalThis.fetch = original;
    if (previous)
      await db.metaWorkspaceSharing.update({
        where: { id: "global" },
        data: {
          primaryAccountIds: previous.primaryAccountIds ?? Prisma.DbNull,
        },
      });
    else await db.metaWorkspaceSharing.delete({ where: { id: "global" } });
    await db.metaAdAccount.deleteMany({ where: { connectionId: cid } });
    await db.metaConnection.delete({ where: { id: cid } });
    await db.user.delete({ where: { id: uid } });
    await db.$disconnect();
  }
});
