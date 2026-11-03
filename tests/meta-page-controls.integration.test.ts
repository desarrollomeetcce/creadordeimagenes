import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { dashboard } from "../lib/meta-ads/dashboard";
import { metaRoutes } from "../lib/meta-ads/routes";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
test("Paginación manual y señal de datos guardados sin Graph", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    uid = "pages-control-" + tag,
    other = uid + "-other",
    cid = "pages-control-c-" + tag,
    aid = Date.now() + "94",
    today = localDay("America/Lima"),
    ids = Array.from(
      { length: 123 },
      (_, i) => aid + String(i).padStart(4, "0"),
    ),
    original = globalThis.fetch,
    actor = { id: uid, role: "OWNER" };
  let calls = 0;
  await db.user.createMany({
    data: [uid, other].map((id, i) => ({
      id,
      name: "QA page control",
      email: id + "@example.test",
      passwordHash: "synthetic",
      role: i === 0 ? "OWNER" : "USER",
      status: "APPROVED",
    })),
  });
  await db.metaConnection.create({
    data: {
      id: cid,
      ownerId: uid,
      name: "QA page control",
      transport: "API",
      verifiedAt: new Date(),
    },
  });
  await db.metaAdAccount.create({
    data: {
      id: aid,
      connectionId: cid,
      name: "QA page control",
      currency: "PEN",
      timezone: "America/Lima",
      metric: "MESSAGES",
      syncedAt: new Date(),
      enabled: true,
    },
  });
  await db.metaAdObject.createMany({
    data: [
      ...ids.map((id) => ({
        id,
        accountId: aid,
        level: "campaign",
        name: "QA " + id,
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        id: aid + "81" + i,
        accountId: aid,
        level: "adset",
        name: "QA conjunto " + i,
        campaignId: ids[0],
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        id: aid + "91" + i,
        accountId: aid,
        level: "ad",
        name: "QA anuncio " + i,
        campaignId: ids[0],
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
      })),
    ],
  });
  await db.metaAdDaily.createMany({
    data: ids.map((objectId, i) => ({
      objectId,
      accountId: aid,
      day: today,
      scope: "7d_click,1d_view|impression",
      spend: i + 1,
      actions: { "onsite_conversion.messaging_conversation_started_7d": 2 },
    })),
  });
  globalThis.fetch = async () => {
    calls++;
    throw Error("Provider must not be queried");
  };
  const read = (extra: Record<string, string>) =>
    dashboard(
      actor,
      new URLSearchParams({
        accounts: aid,
        level: "campaign",
        analysisPeriod: "today",
        sort: "custom",
        direction: "asc",
        ...extra,
      }),
    );
  const status = (user = actor, withData = true) =>
    metaRoutes(
      new NextRequest(
        "http://localhost/api/meta-ads/sync-status?" +
          new URLSearchParams({
            accounts: aid,
            ...(withData ? { dataRevision: "1" } : {}),
          }),
      ),
      ["meta-ads", "sync-status"],
      user,
      async () => ({}),
    );
  try {
    await t.test(
      "Admite1,5,35,65,100 filas y calcula última página sin cambiar total",
      async () => {
        for (const n of [1, 5, 35, 65, 100]) {
          const r = await read({ limit: String(n) });
          assert.equal(r.items.length, n);
          assert.equal(r.total, 123);
        }
        const last = await read({ limit: "100", page: "2" });
        assert.equal(last.items.length, 23);
        assert.equal(last.total, 123);
        assert.equal((await read({ limit: "1000" })).items.length, 100);
      },
    );
    await t.test(
      "Cada nivel mantiene su cantidad y tamaño solicitado",
      async () => {
        assert.equal((await read({ level: "adset", limit: "5" })).total, 7);
        assert.equal(
          (await read({ level: "adset", limit: "5" })).items.length,
          5,
        );
        assert.equal((await read({ level: "ad", limit: "5" })).total, 9);
        assert.equal((await read({ level: "ad", limit: "5" })).items.length, 5);
      },
    );
    await t.test(
      "Progreso normal no agrega señales; señal solicitada detecta cambios guardados",
      async () => {
        const normal = await (await status(actor, false)).json();
        assert(!("dataUpdatedAt" in normal[0]));
        const before = (await (await status()).json())[0].dataUpdatedAt;
        assert(before);
        await db.metaAdDaily.update({
          where: {
            objectId_day_scope: {
              objectId: ids[0],
              day: today,
              scope: "7d_click,1d_view|impression",
            },
          },
          data: { spend: 999, updatedAt: new Date(Date.now() + 2000) },
        });
        const after = (await (await status()).json())[0].dataUpdatedAt;
        assert(after > before);
        const r = await read({ objectSelection: ids[0], limit: "1" });
        assert.equal(r.items[0].periods.today.spend, 999);
      },
    );
    await t.test(
      "Metadatos de cambio no exponen cuentas fuera del permiso",
      async () => {
        await assert.rejects(
          () => status({ id: other, role: "USER" }),
          /no autorizadas/,
        );
        assert.equal(calls, 0);
      },
    );
  } finally {
    globalThis.fetch = original;
    await db.metaAdAccount.delete({ where: { id: aid } });
    await db.metaConnection.delete({ where: { id: cid } });
    await db.user.deleteMany({ where: { id: { in: [uid, other] } } });
    await db.$disconnect();
  }
});
