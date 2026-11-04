import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { db } from "../lib/db";
import {
  inventoryActivationDirectory,
  inventoryActivationReport,
  financialCatalogStatus,
  saveInventoryFactorLimits,
} from "../lib/meta-ads/inventory-sheet-activation";
import { previewInventoryCountryCorrection } from "../lib/meta-ads/inventory-country-correction";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
import { shiftDay } from "../lib/meta-ads/analytics";

test("Lecturas financieras no toman el bloqueo de escritura y CAC acotado conserva resultados", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = "speed-" + randomUUID(),
    uid = tag + "-owner",
    listId = tag + "-list",
    tableId = tag + "-table",
    cid = tag + "-connection",
    aid = Date.now() + "82",
    objectId = aid + "11",
    actor = { id: uid, role: "OWNER" },
    today = limaDay(),
    client = new Client({ connectionString: process.env.DATABASE_URL }),
    original = globalThis.fetch;
  let calls = 0,
    holding = false;
  globalThis.fetch = async () => {
    calls++;
    throw Error("Providers forbidden");
  };
  try {
    await client.connect();
    await db.user.create({
      data: {
        id: uid,
        email: uid + "@example.test",
        name: tag,
        role: "OWNER",
        status: "APPROVED",
        passwordHash: "synthetic",
      },
    });
    await db.metaEffectivenessSheet.create({
      data: { id: listId, kind: "INVENTORY", name: tag },
    });
    await db.metaAliasTable.create({
      data: {
        id: tableId,
        name: tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    });
    const alias = await db.metaAlias.create({
        data: { tableId, inventorySheetId: listId, name: tag },
      }),
      row = await db.metaEffectivenessRow.create({
        data: {
          aliasId: alias.id,
          country: "PE",
          currency: "",
          displayCurrency: "PEN",
        },
      });
    await db.metaConnection.create({
      data: { id: cid, name: tag, ownerId: uid, transport: "API" },
    });
    await db.metaAdAccount.create({
      data: {
        id: aid,
        connectionId: cid,
        name: tag,
        currency: "PEN",
        timezone: "America/Lima",
        enabled: false,
        syncedAt: new Date(),
      },
    });
    await db.metaAdObject.create({
      data: {
        id: objectId,
        accountId: aid,
        level: "campaign",
        name: tag,
        aliasId: alias.id,
        aliasCountry: "PE",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
      },
    });
    const days = Array.from({ length: 14 }, (_, i) => shiftDay(today, -i));
    await db.metaEffectivenessDay.createMany({
      data: [
        ...days.map((day) => ({
          rowId: row.id,
          day,
          sales: 2,
          salesOverridden: true,
        })),
        {
          rowId: row.id,
          day: shiftDay(today, -120),
          sales: 77,
          salesOverridden: true,
        },
      ],
    });
    await db.metaAdDaily.createMany({
      data: [
        ...days.map((day) => ({
          objectId,
          accountId: aid,
          day,
          scope: "7d_click,1d_view|impression",
          spend: 4,
          impressions: 20,
          actions: {
            "onsite_conversion.messaging_conversation_started_7d": 10,
          },
        })),
        {
          objectId,
          accountId: aid,
          day: shiftDay(today, -120),
          scope: "7d_click,1d_view|impression",
          spend: 999,
          impressions: 100,
        },
      ],
    });
    await t.test(
      "CAC reciente coincide con informe completo aunque existan ventas y gasto antiguos",
      async () => {
        const full = await inventoryActivationReport(actor, {
            listId,
            tableIds: tableId,
            byCountry: "true",
          }),
          compact = await financialCatalogStatus(actor, { tableId });
        const a = full.rows.find((r) => r.name === tag)!.cac,
          b = compact.rows.find((r) => r.aliasId === alias.id)!.cac;
        assert.deepEqual(b, a);
        assert.equal(b!.sales, 28);
        assert.equal(b!.meta.amount, 56);
        assert.equal(b!.meta.cac, 2);
      },
    );
    await t.test(
      "Directorio, evaluación, CAC y revisión responden mientras otro cliente mantiene884411",
      async () => {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(884411)");
        holding = true;
        const reads = Promise.all([
          inventoryActivationDirectory(actor, { listId }),
          inventoryActivationReport(actor, {
            listId,
            tableIds: tableId,
            byCountry: "true",
          }),
          financialCatalogStatus(actor, { tableId }),
          previewInventoryCountryCorrection(actor, {
            listId,
            items: [{ aliasId: alias.id, country: "PE" }],
          }),
        ]);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let completed = false;
        try {
          completed = await Promise.race([
            reads.then(() => true),
            new Promise<boolean>((resolve) => {
              timer = setTimeout(() => resolve(false), 2500);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
          await client.query("ROLLBACK");
          holding = false;
          await reads;
        }
        assert(
          completed,
          "Una lectura sigue esperando al bloqueo global de los guardados",
        );
      },
    );
    await t.test(
      "Las escrituras conservan bloqueo y revisión optimista",
      async () => {
        const list = await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: listId },
        });
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(884411)");
        holding = true;
        let finished = false;
        const write = saveInventoryFactorLimits(actor, {
          listId,
          revision: list.revision,
          cacRules: { review: 36, severe: 51, critical: 66, zero: 26 },
        }).then((r) => {
          finished = true;
          return r;
        });
        await new Promise((r) => setTimeout(r, 150));
        assert(!finished);
        await client.query("ROLLBACK");
        holding = false;
        await write;
        assert.equal(
          (
            await db.metaEffectivenessSheet.findUniqueOrThrow({
              where: { id: listId },
            })
          ).revision,
          list.revision + 1,
        );
        await assert.rejects(
          saveInventoryFactorLimits(actor, {
            listId,
            revision: list.revision,
            cacRules: { review: 36, severe: 51, critical: 66, zero: 26 },
          }),
          /cambió/,
        );
      },
    );
    await t.test(
      "Permisos actuales, hechos y ventas permanecen intactos, sin Graph",
      async () => {
        await db.user.update({ where: { id: uid }, data: { role: "USER" } });
        await assert.rejects(inventoryActivationDirectory(actor, { listId }));
        await db.user.update({ where: { id: uid }, data: { role: "OWNER" } });
        assert.equal(
          (
            await db.metaEffectivenessDay.findUniqueOrThrow({
              where: {
                rowId_day: { rowId: row.id, day: shiftDay(today, -120) },
              },
            })
          ).sales,
          77,
        );
        assert.equal(
          Number(
            (
              await db.metaAdDaily.findFirstOrThrow({
                where: { objectId, day: shiftDay(today, -120) },
              })
            ).spend,
          ),
          999,
        );
        assert.equal(calls, 0);
      },
    );
  } finally {
    globalThis.fetch = original;
    if (holding) await client.query("ROLLBACK");
    await client.end();
    await db.metaAdAccount.deleteMany({ where: { id: aid } });
    await db.metaConnection.deleteMany({ where: { id: cid } });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: listId } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: listId } });
    await db.metaAliasTable.deleteMany({ where: { id: tableId } });
    await db.metaEffectivenessSheet.deleteMany({ where: { id: listId } });
    await db.auditEvent.deleteMany({ where: { actorId: uid } });
    await db.user.deleteMany({ where: { id: uid } });
    await db.$disconnect();
  }
});
