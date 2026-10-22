import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import { metaRoutes } from "../lib/meta-ads/routes";
import { NextRequest } from "next/server";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
const exclusive = process.env.DATABASE_URL?.includes(
  "/library_organization_test?host=/workspace/work/pgdata",
);
test(
  "Meta detalle: rango diario local, histórico guardado, atribución y permisos revocados",
  { skip: !exclusive },
  async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { role: "OWNER", status: "APPROVED" },
    });
    const viewer = await db.user.create({
      data: {
        email: `daily-${Date.now()}@example.test`,
        name: "Daily synthetic",
        role: "USER",
        status: "APPROVED",
        passwordHash: "synthetic-no-login",
      },
    });
    const c = await db.metaConnection.create({
      data: { name: "Daily synthetic", ownerId: owner.id, transport: "API" },
    });
    const id = String(Date.now()),
      other = id + "9",
      objectId = id + "1",
      today = localDay("America/Lima");
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      throw Error("External requests forbidden in daily detail test");
    };
    const get = async (query = "", actor = { id: owner.id, role: "OWNER" }) => {
      const response = await metaRoutes(
        new NextRequest(
          `http://localhost:3074/api/meta-ads/objects/${objectId}/daily${query ? "?" + query : ""}`,
        ),
        ["meta-ads", "objects", objectId, "daily"],
        actor,
        async () => ({}),
      );
      return response!.json();
    };
    try {
      for (const aid of [id, other])
        await db.metaAdAccount.create({
          data: {
            id: aid,
            connectionId: c.id,
            name: "Daily " + aid,
            currency: "PEN",
            timezone: "America/Lima",
          },
        });
      await db.metaAdObject.create({
        data: {
          id: objectId,
          accountId: id,
          level: "ad",
          name: "Daily",
          status: "PAUSED",
        },
      });
      for (const offset of [-45, -3, 0, 1])
        await db.metaAdDaily.create({
          data: {
            objectId,
            accountId: id,
            day: shiftDay(today, offset),
            scope: "7d_click,1d_view|impression",
            spend: 4,
            actions: {
              "onsite_conversion.messaging_conversation_started_7d": 8,
            },
          },
        });
      await db.metaAdDaily.create({
        data: {
          objectId,
          accountId: id,
          day: today,
          scope: "other-attribution",
          spend: 99,
          actions: {},
        },
      });
      await db.metaAdDaily.create({
        data: {
          objectId,
          accountId: other,
          day: shiftDay(today, -2),
          scope: "7d_click,1d_view|impression",
          spend: 999,
          actions: {},
        },
      });
      assert.deepEqual(
        (await get()).map((r: any) => r.day),
        [shiftDay(today, -3), today],
      );
      assert.deepEqual(
        (await get("all=1")).map((r: any) => r.day),
        [shiftDay(today, -45), shiftDay(today, -3), today],
      );
      assert.deepEqual(
        (
          await get(
            `since=${shiftDay(today, -45)}&until=${shiftDay(today, -3)}`,
          )
        ).map((r: any) => r.day),
        [shiftDay(today, -45), shiftDay(today, -3)],
      );
      assert.equal((await get(`since=${today}&until=${today}`))[0].spend, "4");
      assert.deepEqual(
        await get(
          `since=${shiftDay(today, -15)}&until=${shiftDay(today, -10)}`,
        ),
        [],
      );
      for (const query of [
        "since=2026-02-30&until=2026-03-01",
        "all=1&since=2026-01-01&until=2026-02-01",
        `since=${today}&until=${shiftDay(today, 1)}`,
      ])
        await assert.rejects(() => get(query), /fechas|rango/);
      const actor = { id: viewer.id, role: "USER" };
      await assert.rejects(() => get("all=1", actor), /no disponible/);
      await db.metaAccountGrant.create({
        data: { accountId: id, userId: viewer.id },
      });
      assert.equal((await get("all=1", actor)).length, 3);
      await db.metaAccountGrant.deleteMany({
        where: { accountId: id, userId: viewer.id },
      });
      await assert.rejects(() => get("all=1", actor), /no disponible/);
      assert.equal(
        (await db.metaAdAccount.findUniqueOrThrow({ where: { id } }))
          .nextSyncAt,
        null,
      );
    } finally {
      globalThis.fetch = original;
      await db.metaAdAccount.deleteMany({ where: { id: { in: [id, other] } } });
      await db.metaConnection.delete({ where: { id: c.id } });
      await db.user.delete({ where: { id: viewer.id } });
      await db.$disconnect();
    }
  },
);
