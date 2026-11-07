import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { db } from "../lib/db";
import { dashboard } from "../lib/meta-ads/dashboard";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";

test(
  "Delivery is filtered before the catalogue cap, and empty pages retain bounded authorized refresh targets",
  { skip: !process.env.DATABASE_URL?.endsWith("/delivery_qa") },
  async () => {
    const tag = randomUUID(),
      base = String(Date.now()),
      account = base + "01",
      other = base + "02";
    const owner = await db.user.create({
      data: {
        email: tag + "@example.test",
        name: "Delivery OWNER QA",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    });
    const viewer = await db.user.create({
      data: {
        email: "viewer" + tag + "@example.test",
        name: "Delivery VIEW QA",
        passwordHash: "synthetic",
        role: "OBSERVER",
        status: "APPROVED",
      },
    });
    const conn = await db.metaConnection.create({
      data: {
        ownerId: owner.id,
        name: "Delivery QA",
        transport: "API",
        verifiedAt: new Date(),
      },
    });
    await db.metaAdAccount.createMany({
      data: [
        {
          id: account,
          connectionId: conn.id,
          name: "Delivery QA",
          currency: "PEN",
          timezone: "America/Lima",
          enabled: true,
          syncedAt: new Date(),
          metric: "MESSAGES",
        },
        {
          id: other,
          connectionId: conn.id,
          name: "Other timezone QA",
          currency: "USD",
          timezone: "Pacific/Auckland",
          enabled: true,
          syncedAt: new Date(),
          metric: "MESSAGES",
        },
      ],
    });
    await db.metaAccountGrant.create({
      data: { userId: viewer.id, accountId: account },
    });
    const object = (
      n: number,
      name = "Sin actividad",
      status = "ACTIVE",
      a = account,
    ) => ({
      id: base + String(n).padStart(6, "0"),
      accountId: a,
      level: "campaign",
      name,
      status,
      effectiveStatus: status,
      seenAt: new Date(1000 + n),
    });
    for (let n = 0; n < 10005; n += 1000)
      await db.metaAdObject.createMany({
        data: Array.from({ length: Math.min(1000, 10005 - n) }, (_, i) =>
          object(n + i),
        ),
      });
    const delivered = object(99990, "Con impresiones"),
      paused = object(99991, "Pausada con gasto", "PAUSED"),
      wrongScope = object(99992, "Otro scope"),
      yesterday = object(99993, "Solo ayer"),
      foreign = object(99994, "Otra cuenta", "ACTIVE", other);
    await db.metaAdObject.createMany({
      data: [
        delivered,
        paused,
        wrongScope,
        yesterday,
        foreign,
        ...Array.from({ length: 40 }, (_, i) =>
          object(20000 + i, "Vacía objetivo"),
        ),
      ],
    });
    const today = localDay("America/Lima");
    await db.metaAdDaily.createMany({
      data: [
        {
          objectId: delivered.id,
          accountId: account,
          day: today,
          scope: "7d_click,1d_view|impression",
          spend: 0,
          impressions: 1,
        },
        {
          objectId: paused.id,
          accountId: account,
          day: today,
          scope: "7d_click,1d_view|impression",
          spend: 2,
          impressions: 0,
        },
        {
          objectId: wrongScope.id,
          accountId: account,
          day: today,
          scope: "account-default",
          spend: 999,
          impressions: 10,
        },
        {
          objectId: yesterday.id,
          accountId: account,
          day: shiftDay(today, -1),
          scope: "7d_click,1d_view|impression",
          spend: 999,
          impressions: 10,
        },
        {
          objectId: foreign.id,
          accountId: other,
          day: localDay("Pacific/Auckland"),
          scope: "7d_click,1d_view|impression",
          spend: 3,
          impressions: 1,
        },
      ],
    });
    const fetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw Error("No external requests in delivery QA");
    };
    try {
      const query = (args: Record<string, string> = {}) =>
        new URLSearchParams({
          level: "campaign",
          accounts: account,
          state: "delivery",
          metric: "MESSAGES",
          analysisPeriod: "today",
          ...args,
        });
      const started = performance.now();
      const found = await dashboard(owner, query({ summary: "1" }));
      assert.equal(found.total, 2);
      assert.equal(found.limited, false);
      assert.deepEqual(
        new Set(found.items.map((o) => o.id)),
        new Set([delivered.id, paused.id]),
      );
      assert.equal(found.summary?.currencies[0].spend, 2);
      assert.equal(
        await db.metaInsightCache.count({
          where: { object: { accountId: account } },
        }),
        2,
        "Only two delivered campaigns should load/cache their history, not 10,000 unrelated rows",
      );
      console.log(
        `PASS delivery outside old10k cap found; only2 histories aggregated in ${Math.round(performance.now() - started)}ms (synthetic local DB)`,
      );
      assert.equal(
        (await dashboard(owner, query({ state: "active,delivery" }))).total,
        1,
      );
      assert.equal(
        (await dashboard(owner, query({ state: "paused,delivery" }))).items[0]
          .id,
        paused.id,
      );
      assert.equal(
        (await dashboard(owner, query({ accounts: other }))).items[0].id,
        foreign.id,
      );
      await assert.rejects(
        dashboard(viewer, query({ accounts: other })),
        /no autorizadas/,
      );
      assert.equal((await dashboard(viewer, query())).total, 2);
      const empty = await dashboard(owner, query({ q: "Vacía objetivo" }));
      assert.equal(empty.total, 0);
      assert("refreshTargets" in empty);
      assert.equal(empty.refreshTargets.length, 25);
      assert(empty.refreshTargets.every((o) => o.accountId === account));
      assert.deepEqual(Object.keys(empty.refreshTargets[0]).sort(), [
        "accountId",
        "id",
      ]);
      assert.equal(
        await db.metaInsightCache.count({
          where: { object: { name: "Vacía objetivo" } },
        }),
        0,
        "Empty delivery must skip historical aggregates entirely",
      );
      const picked = empty.refreshTargets[0];
      await db.metaAdDaily.create({
        data: {
          objectId: picked.id,
          accountId: account,
          day: today,
          scope: "7d_click,1d_view|impression",
          spend: "0.5",
          impressions: 1,
        },
      });
      assert.equal(
        (await dashboard(owner, query({ q: "Vacía objetivo" }))).total,
        1,
        "After the bounded recent refresh stores facts the page can recover",
      );
      assert.equal(
        (await dashboard(owner, query({ q: "Nothing matches" }))).total,
        0,
      );
      assert.equal(
        (await dashboard(owner, query({ q: "Vacía objetivo", state: "all" })))
          .total,
        40,
      );
      assert.equal(
        (await dashboard(owner, query({ objectSelection: wrongScope.id })))
          .total,
        0,
        "Delivery must not turn an authorized object selection into a409",
      );
      const raw = randomUUID();
      await db.session.create({
        data: {
          id: createHash("sha256").update(raw).digest("hex"),
          userId: owner.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await writeFile(
        "/workspace/work/delivery-fixture.json",
        JSON.stringify({
          userId: owner.id,
          accountId: account,
          session: raw,
          objectId: picked.id,
        }),
      );
      console.log(
        "PASS date/scope/status/timezone, authorization, empty-page25IDs/no history, recovery, filter removal, selected objects and no provider calls",
      );
    } finally {
      globalThis.fetch = fetch;
      await db.$disconnect();
    }
  },
);
