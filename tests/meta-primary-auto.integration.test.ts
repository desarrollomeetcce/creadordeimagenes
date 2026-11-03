import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import {
  automaticSyncAllowed,
  automaticSyncWhere,
} from "../lib/meta-ads/automatic-sync";
import { syncStep, runDueSync } from "../lib/meta-ads/service";
import { refreshVisibleMeta } from "../lib/meta-ads/realtime-refresh";
import { advance } from "../workflows/meta-sync";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
test("Solo principales automáticas; secundarias conservadas a petición", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    uid = "primary-user-" + tag,
    cid = "primary-c-" + tag,
    primary = Date.now() + "71",
    secondary = primary + "2",
    oid = secondary + "1",
    base = globalThis.fetch,
    today = localDay("America/Lima"),
    old = shiftDay(today, -60),
    previous = await db.metaWorkspaceSharing.findUnique({
      where: { id: "global" },
    });
  let calls = 0;
  const actor = { id: uid, role: "OWNER" },
    state = {
      plan: "focus",
      refreshOnly: true,
      phase: 0,
      recentDays: 7,
      started: new Date().toISOString(),
      until: today,
    };
  await db.user.create({
    data: {
      id: uid,
      name: "QA primary",
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
      name: "QA primary",
      transport: "API",
      apiVersion: "v26.0",
      verifiedAt: new Date(),
      encryptedToken: encryptKey("synthetic-primary-key", "meta:" + cid),
    },
  });
  await db.metaAdAccount.createMany({
    data: [primary, secondary].map((id) => ({
      id,
      connectionId: cid,
      name: "QA " + id,
      currency: "PEN",
      timezone: "America/Lima",
      enabled: true,
      nextSyncAt: new Date(0),
      syncState: state,
    })),
  });
  await db.metaAdObject.create({
    data: {
      id: oid,
      accountId: secondary,
      level: "campaign",
      name: "QA saved",
      status: "PAUSED",
      effectiveStatus: "PAUSED",
      seenAt: new Date(),
    },
  });
  await db.metaAdDaily.create({
    data: {
      objectId: oid,
      accountId: secondary,
      day: old,
      scope: "7d_click,1d_view|impression",
      spend: 77,
    },
  });
  await db.metaWorkspaceSharing.upsert({
    where: { id: "global" },
    create: { id: "global", primaryAccountIds: [primary] },
    update: { primaryAccountIds: [primary] },
  });
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, "graph.facebook.com");
    assert(!init?.method || init.method === "GET");
    calls++;
    return Response.json({ data: [] });
  };
  try {
    await t.test(
      "Worker avanza principal y no consulta secundaria habilitada",
      async () => {
        const n = calls;
        assert.equal(await runDueSync(1), 1);
        assert.equal(calls, n + 1);
        const a = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: secondary },
        });
        assert.deepEqual(a.syncState, state);
        assert.equal(a.enabled, true);
        assert.equal(await syncStep(secondary, undefined, true), false);
        assert.equal(calls, n + 1);
      },
    );
    await t.test(
      "Workflow secundario anterior termina sin Graph, sin perder datos ni cursor",
      async () => {
        const token = randomUUID();
        await db.metaAdAccount.update({
          where: { id: secondary },
          data: { schedulerToken: token, schedulerRunId: "synthetic-old" },
        });
        const n = calls;
        assert.deepEqual(await advance(secondary, token), {
          active: false,
          delay: 0,
        });
        assert.equal(calls, n);
        const a = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: secondary },
        });
        assert.equal(a.schedulerToken, null);
        assert.equal(a.enabled, true);
        assert.deepEqual(a.syncState, state);
        assert.equal(
          Number(
            (
              await db.metaAdDaily.findFirstOrThrow({
                where: { objectId: oid, day: old },
              })
            ).spend,
          ),
          77,
        );
      },
    );
    await t.test(
      "Refresco visible automático secundario no consulta Graph",
      async () => {
        const n = calls,
          r = await refreshVisibleMeta(actor, secondary, { objects: [oid] });
        assert("automaticDisabled" in r && r.automaticDisabled);
        assert.equal(calls, n);
      },
    );
    await t.test(
      "Actualizar vista manual secundario consulta informe y conserva histórico",
      async () => {
        const n = calls,
          r = await refreshVisibleMeta(actor, secondary, {
            objects: [oid],
            manual: true,
          });
        assert(r.updated);
        assert.equal(calls, n + 1);
        assert.equal(
          Number(
            (
              await db.metaAdDaily.findFirstOrThrow({
                where: { objectId: oid, day: old },
              })
            ).spend,
          ),
          77,
        );
      },
    );
    await t.test(
      "Importación secundaria explícita avanza y termina al completar su solicitud",
      async () => {
        const start = Date.now(),
          token = "manual:" + start + ":" + randomUUID();
        await db.metaAdAccount.update({
          where: { id: secondary },
          data: {
            schedulerToken: token,
            nextSyncAt: new Date(0),
            syncState: state,
          },
        });
        let a = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: secondary },
        });
        assert(await automaticSyncAllowed(a));
        const n = calls;
        assert(await syncStep(secondary, token, true));
        assert.equal(calls, n + 1);
        await db.metaAdAccount.update({
          where: { id: secondary },
          data: {
            syncState: {
              lastRun: { finishedAt: new Date(start + 1).toISOString() },
            },
          },
        });
        const n2 = calls;
        assert.deepEqual(await advance(secondary, token), {
          active: false,
          delay: 0,
        });
        assert.equal(calls, n2);
        assert.equal(
          (
            await db.metaAdAccount.findUniqueOrThrow({
              where: { id: secondary },
            })
          ).schedulerToken,
          null,
        );
      },
    );
    await t.test(
      "Cambiar la lista principal cambia el ámbito; lista sin inicializar conserva compatibilidad",
      async () => {
        await db.metaWorkspaceSharing.update({
          where: { id: "global" },
          data: { primaryAccountIds: [primary, secondary] },
        });
        assert(
          await automaticSyncAllowed(
            await db.metaAdAccount.findUniqueOrThrow({
              where: { id: secondary },
            }),
          ),
        );
        await db.metaWorkspaceSharing.update({
          where: { id: "global" },
          data: { primaryAccountIds: [] },
        });
        assert(
          !(await automaticSyncAllowed(
            await db.metaAdAccount.findUniqueOrThrow({
              where: { id: primary },
            }),
          )),
        );
        await db.metaWorkspaceSharing.update({
          where: { id: "global" },
          data: { primaryAccountIds: Prisma.DbNull },
        });
        assert.deepEqual(await automaticSyncWhere(), {});
      },
    );
  } finally {
    globalThis.fetch = base;
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
    await db.auditEvent.deleteMany({ where: { actorId: uid } });
    await db.user.delete({ where: { id: uid } });
    await db.$disconnect();
  }
});
