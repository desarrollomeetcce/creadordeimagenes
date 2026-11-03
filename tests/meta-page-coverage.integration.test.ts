import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { refreshVisibleMeta } from "../lib/meta-ads/realtime-refresh";
import { dashboard } from "../lib/meta-ads/dashboard";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
test("Páginas Meta: no desaparecen informes de hoy al consultar otras filas", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    uid = "page-user-" + tag,
    cid = "page-c-" + tag,
    aid = Date.now() + "93",
    ids = [aid + "1", aid + "2"],
    today = localDay("America/Lima"),
    yesterday = shiftDay(today, -1),
    old = new Date(yesterday + "T00:00:00Z"),
    original = globalThis.fetch,
    previous = await db.metaWorkspaceSharing.findUnique({
      where: { id: "global" },
    }),
    actor = { id: uid, role: "OWNER" };
  let calls = 0,
    error = false;
  const sourceState = {
    lastRun: {
      plan: "focus",
      recentReady: true,
      until: yesterday,
      finishedAt: old.toISOString(),
    },
  };
  await db.user.create({
    data: {
      id: uid,
      name: "QA pages",
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
      name: "QA pages",
      transport: "API",
      apiVersion: "v26.0",
      verifiedAt: new Date(),
      encryptedToken: encryptKey("synthetic-pages", "meta:" + cid),
    },
  });
  await db.metaAdAccount.create({
    data: {
      id: aid,
      connectionId: cid,
      name: "QA pages",
      currency: "PEN",
      timezone: "America/Lima",
      metric: "MESSAGES",
      enabled: true,
      syncedAt: old,
      selectionSince: old,
      syncState: sourceState,
    },
  });
  await db.metaAdObject.createMany({
    data: ids.map((id) => ({
      id,
      accountId: aid,
      level: "campaign",
      name: "QA " + id,
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      seenAt: old,
      selectedAt: old,
    })),
  });
  await db.metaWorkspaceSharing.upsert({
    where: { id: "global" },
    create: { id: "global", primaryAccountIds: [aid] },
    update: { primaryAccountIds: [aid] },
  });
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, "graph.facebook.com");
    calls++;
    if (init?.method === "POST") {
      const batch = JSON.parse(
        new URLSearchParams(String(init.body)).get("batch")!,
      );
      return Response.json(
        batch.map((r: any) => {
          const id = r.relative_url.split("?")[0];
          assert(ids.includes(id));
          assert.equal(r.method, "GET");
          return {
            code: 200,
            body: JSON.stringify({
              id,
              account_id: aid,
              status: "ACTIVE",
              effective_status: "ACTIVE",
            }),
          };
        }),
      );
    }
    assert.equal(u.pathname, "/v26.0/act_" + aid + "/insights");
    if (error)
      return Response.json(
        { error: { code: 100, message: "Synthetic report failed" } },
        { status: 400 },
      );
    const selected = JSON.parse(u.searchParams.get("filtering")!)[0].value;
    return Response.json({
      data: selected.map((id: string) => ({
        account_id: aid,
        campaign_id: id,
        date_start: today,
        date_stop: today,
        spend: String((ids.indexOf(id) + 1) * 11),
        impressions: "10",
        actions: [
          {
            action_type: "onsite_conversion.messaging_conversation_started_7d",
            value: "2",
          },
        ],
      })),
    });
  };
  const read = () =>
    dashboard(
      actor,
      new URLSearchParams({
        accounts: aid,
        level: "campaign",
        since: today,
        until: today,
        analysisPeriod: "custom",
        summary: "1",
      }),
    );
  const release = async () => {
    const a = await db.metaAdAccount.findUniqueOrThrow({ where: { id: aid } });
    await db.metaAdAccount.update({
      where: { id: aid },
      data: {
        realtimeState: {
          ...(a.realtimeState as any),
          nextAt: "2000-01-01T00:00:00Z",
        },
      },
    });
  };
  let firstCheck = "";
  try {
    await t.test(
      "Primera fila obtiene informe aunque el sincronizado general sea de ayer",
      async () => {
        assert(
          (await read()).items.every(
            (i) => i.periods.today.state === "UNAVAILABLE",
          ),
        );
        assert(
          (await refreshVisibleMeta(actor, aid, { objects: [ids[0]] })).updated,
        );
        const r = await read();
        assert.equal(
          r.items.find((i) => i.id === ids[0])!.periods.today.spend,
          11,
        );
        assert(
          r.items.find((i) => i.id === ids[0])!.periods.today.metaAvailable,
        );
        assert.equal(
          r.items.find((i) => i.id === ids[1])!.periods.today.state,
          "UNAVAILABLE",
        );
        firstCheck = (
          (await db.metaAdAccount.findUniqueOrThrow({ where: { id: aid } }))
            .realtimeState as any
        ).checkedAt;
      },
    );
    await t.test(
      "Segunda tanda y varias recargas conservan ambas filas y sus cifras",
      async () => {
        await release();
        assert(
          (await refreshVisibleMeta(actor, aid, { objects: [ids[1]] })).updated,
        );
        const n = calls;
        for (let refresh = 0; refresh < 3; refresh++) {
          const r = await read();
          for (let i = 0; i < ids.length; i++) {
            const item = r.items.find((o) => o.id === ids[i])!;
            assert(item.periods.today.metaAvailable);
            assert(item.periods.custom.metaAvailable);
            assert.equal(item.periods.today.spend, (i + 1) * 11);
          }
        }
        assert.equal(calls, n);
        const a = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: aid },
        });
        assert.equal(a.syncedAt?.valueOf(), old.valueOf());
        assert.deepEqual(a.syncState, sourceState);
      },
    );
    await t.test(
      "Reproduce el estado anterior: perder recibos oculta cifras guardadas, restaurarlos las recupera",
      async () => {
        const a = await db.metaAdAccount.findUniqueOrThrow({
            where: { id: aid },
          }),
          full = a.realtimeState as any;
        const { coverage: _, ...legacy } = full;
        const n = calls;
        try {
          await db.metaAdAccount.update({
            where: { id: aid },
            data: { realtimeState: legacy },
          });
          const r = await read(),
            first = r.items.find((o) => o.id === ids[0])!;
          assert.equal(first.periods.today.state, "UNAVAILABLE");
          assert.equal(first.periods.today.spend, 11);
          assert(first.periods.today.reportedMeta);
        } finally {
          await db.metaAdAccount.update({
            where: { id: aid },
            data: { realtimeState: full },
          });
        }
        assert(
          (await read()).items.every((o) => o.periods.today.metaAvailable),
        );
        assert.equal(calls, n);
      },
    );
    await t.test(
      "Volver a primera tanda en cooldown usa su fecha real sin nuevas consultas",
      async () => {
        const n = calls,
          r = await refreshVisibleMeta(actor, aid, { objects: [ids[0]] });
        assert(r.waiting);
        assert(r.covered);
        assert.equal(r.checkedAt, firstCheck);
        assert.equal(calls, n);
      },
    );
    await t.test(
      "Fallo posterior conserva confirmaciones y gastos de otras filas",
      async () => {
        await release();
        error = true;
        const r = await refreshVisibleMeta(actor, aid, { objects: [ids[0]] });
        assert(!r.updated);
        const d = await read();
        assert(d.items.every((i) => i.periods.today.metaAvailable));
        assert.equal(
          d.items.find((i) => i.id === ids[1])!.periods.today.spend,
          22,
        );
      },
    );
    await t.test(
      "Revisión nueva con informe fallido no hereda confirmaciones anteriores",
      async () => {
        await db.metaConnection.update({
          where: { id: cid },
          data: { revision: { increment: 1 } },
        });
        const r = await refreshVisibleMeta(actor, aid, { objects: [ids[0]] });
        assert(!r.updated);
        const d = await read();
        assert(d.items.every((i) => i.periods.today.state === "UNAVAILABLE"));
        const days = await db.metaAdDaily.findMany({
          where: { accountId: aid, day: today },
          orderBy: { objectId: "asc" },
        });
        assert.deepEqual(
          days.map((v) => Number(v.spend)),
          [11, 22],
        );
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
    await db.metaAdAccount.delete({ where: { id: aid } });
    await db.metaConnection.delete({ where: { id: cid } });
    await db.user.delete({ where: { id: uid } });
    await db.$disconnect();
  }
});
