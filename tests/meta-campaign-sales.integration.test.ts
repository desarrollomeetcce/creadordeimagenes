import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { dashboard } from "../lib/meta-ads/dashboard";
import {
  metaCampaignSalesData,
  metaRegisteredSales,
} from "../lib/meta-ads/effectiveness";
import { metaRoutes } from "../lib/meta-ads/routes";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
test("Campañas: períodos de ventas locales, fuentes canónicas acotadas y anuncios sin atribución", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    base = String(Date.now()) + String(Math.floor(Math.random() * 1000)),
    today = localDay("America/Lima"),
    since7 = shiftDay(today, -6),
    users = await Promise.all(
      ["OWNER", "OBSERVER"].map((role, i) =>
        db.user.create({
          data: {
            name: "QA campañas " + tag,
            email: `campaign-${i}-${tag}@example.test`,
            role: role as any,
            status: "APPROVED",
            passwordHash: "synthetic",
          },
        }),
      ),
    ),
    [owner, viewer] = users;
  const conn = await db.metaConnection.create({
      data: {
        ownerId: owner.id,
        name: "QA campañas " + tag,
        transport: "API",
        encryptedToken: encryptKey("synthetic-campaign-token", "meta:pending"),
        verifiedAt: new Date(),
      },
    }),
    accountId = base + "1",
    foreignId = base + "2";
  await db.metaAdAccount.createMany({
    data: [accountId, foreignId].map((id) => ({
      id,
      connectionId: conn.id,
      name: "QA " + tag,
      currency: "PEN",
      timezone: "America/Lima",
      metric: "MESSAGES",
      syncedAt: new Date(),
      historyFrom: "2026-10-01",
    })),
  });
  await db.metaAccountGrant.create({ data: { accountId, userId: viewer.id } });
  const inventory = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "QA ventas " + tag },
    }),
    tables = await Promise.all(
      ["destino", "origen"].map((n) =>
        db.metaAliasTable.create({
          data: {
            name: "QA " + n + " " + tag,
            defaultCountry: "PE",
            defaultCurrency: "PEN",
          },
        }),
      ),
    ),
    tableIds = tables.map((t) => t.id),
    aliases = await Promise.all(
      tables.map((t) =>
        db.metaAlias.create({
          data: {
            tableId: t.id,
            name: "Curso " + tag,
            inventorySheetId: inventory.id,
          },
        }),
      ),
    ),
    [alias, source] = aliases;
  const other = await db.metaAlias.create({
    data: {
      tableId: tables[1].id,
      name: "Ajeno " + tag,
      inventorySheetId: inventory.id,
    },
  });
  await db.metaEffectivenessRow.create({
    data: {
      aliasId: other.id,
      country: "PE",
      currency: "",
      days: {
        create: [{ day: "1980-01-01", sales: 999, salesOverridden: true }],
      },
    },
  });
  await db.metaEffectivenessLink.create({
    data: {
      tableId: tables[0].id,
      sourceTableId: tables[1].id,
      columns: ["sales"],
      since: "2026-10-01",
      until: today,
    },
  });
  await db.metaEffectivenessRow.create({
    data: {
      aliasId: alias.id,
      country: "PE",
      currency: "",
      displayCurrency: "PEN",
    },
  });
  const sourceRow = await db.metaEffectivenessRow.create({
    data: {
      aliasId: source.id,
      country: "PE",
      currency: "",
      displayCurrency: "PEN",
      hidden: true,
      days: {
        create: [
          { day: "2026-10-01", sales: 3, salesOverridden: true },
          {
            day: "2026-10-15",
            sales: null,
            annotations: { sales: { value: 4 } },
          },
          { day: "2026-10-20", sales: 0, salesOverridden: true },
          ...Array.from({ length: 7 }, (_, i) => ({
            day: shiftDay(since7, i),
            sales: 2,
            salesOverridden: true,
          })),
        ],
      },
    },
  });
  await db.metaEffectivenessRow.create({
    data: {
      aliasId: source.id,
      country: "PE",
      currency: "USD",
      legacy: true,
      presentationRowId: sourceRow.id,
      days: { create: [{ day: "2026-10-14", sales: 5 }] },
    },
  });
  const ids = {
    campaign: base + "11",
    shared: base + "12",
    ad: base + "13",
    unlinked: base + "14",
    foreign: base + "15",
  };
  await db.metaAdObject.createMany({
    data: [
      {
        id: ids.campaign,
        accountId,
        level: "campaign",
        name: "Única " + tag,
        aliasId: alias.id,
        aliasCountry: "PE",
        createdTime: new Date("2026-10-01T15:00:00Z"),
      },
      {
        id: ids.shared,
        accountId,
        level: "campaign",
        name: "Compartida " + tag,
      },
      {
        id: ids.ad,
        accountId,
        level: "ad",
        campaignId: ids.campaign,
        name: "Anuncio " + tag,
      },
      {
        id: ids.unlinked,
        accountId,
        level: "campaign",
        name: "Sin vincular " + tag,
      },
      {
        id: ids.foreign,
        accountId: foreignId,
        level: "campaign",
        name: "Ajena " + tag,
        aliasId: alias.id,
        aliasCountry: "EC",
      },
    ].map((x) => ({ ...x, status: "ACTIVE", effectiveStatus: "ACTIVE" })),
  });
  await db.metaAdDaily.createMany({
    data: [ids.campaign, ids.ad].flatMap((objectId) =>
      Array.from({ length: 7 }, (_, i) => ({
        objectId,
        accountId,
        day: shiftDay(since7, i),
        scope: "7d_click,1d_view|impression",
        spend: 10,
        impressions: 100,
        actions: { "onsite_conversion.messaging_conversation_started_7d": 20 },
      })),
    ),
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("No external provider traffic");
  };
  try {
    await t.test(
      "V canónica sin FX/asesores/Graph ni hojas ajenas; una lectura por tabla, no por campaña",
      async () => {
        const models = [
            "metaFxDay",
            "metaAdvisorAssignment",
            "metaAdvisorSalesApproval",
          ] as const,
          originals = models.map((m) => (db[m] as any).findMany),
          originalRows = db.metaEffectivenessRow.findMany;
        let reads = 0;
        try {
          models.forEach((m) => {
            (db[m] as any).findMany = async () => {
              throw Error("Unrelated financial read " + m);
            };
          });
          (db.metaEffectivenessRow as any).findMany = async (args: any) => {
            reads++;
            assert(args.where.OR?.length === 1);
            return originalRows.call(db.metaEffectivenessRow, args);
          };
          const data = await metaCampaignSalesData(
              viewer,
              [ids.campaign, ids.campaign],
              undefined,
              today,
            ),
            entries = [...data.entries.values()].flat();
          assert.equal(reads, 2);
          assert.equal(entries.find((e) => e.day === "2026-10-15")?.sales, 4);
          assert.equal(entries.find((e) => e.day === "2026-10-14")?.sales, 5);
          assert(!entries.some((e) => e.sales === 999));
          assert.equal(
            (
              await metaCampaignSalesData(
                viewer,
                [ids.foreign],
                undefined,
                today,
              )
            ).campaigns.length,
            0,
          );
        } finally {
          models.forEach((m, i) => {
            (db[m] as any).findMany = originals[i];
          });
          db.metaEffectivenessRow.findMany = originalRows;
        }
      },
    );
    await t.test(
      "Hoy/7/15/30/fecha y CAC alineados; cero no se confunde con ausencia",
      async () => {
        const q = new URLSearchParams({
            accounts: accountId,
            level: "campaign",
            since: "2026-10-15",
            until: "2026-10-15",
            analysisPeriod: "custom",
            summary: "1",
          }),
          r = await dashboard(viewer, q),
          o = r.items.find((o) => o.id === ids.campaign)! as any;
        assert.equal(o.periods.today.sales.sales, 2);
        assert.equal(o.periods["7"].sales.sales, 14);
        assert.equal(o.periods["7"].sales.cac, 5);
        assert.equal(o.periods["7"].sales.effectiveness, 10);
        assert.equal(o.periods.custom.sales.sales, 4);
        assert.equal(o.periods.custom.sales.cac, null);
        assert.equal(o.periods["15"].sales.partial, true);
        assert.equal(
          (r.items.find((o) => o.id === ids.unlinked)! as any).periods.today
            .sales.linked,
          false,
        );
        assert(!JSON.stringify(r).includes("999"));
        q.set("since", "2026-10-20");
        q.set("until", "2026-10-20");
        const z = await dashboard(viewer, q);
        assert.equal(
          (z.items.find((o) => o.id === ids.campaign)! as any).periods.custom
            .sales.sales,
          0,
        );
      },
    );
    await t.test(
      "CAC provisional visible y reglas actuales del inventario compartidas entre panel y detalle",
      async () => {
        const q = new URLSearchParams({
          accounts: accountId,
          level: "campaign",
        });
        const r = await dashboard(viewer, q),
          o = r.items.find((o) => o.id === ids.campaign)! as any;
        assert(o.periods["15"].sales.provisional);
        assert.equal(
          o.periods["15"].sales.cac,
          o.periods["15"].spend / o.periods["15"].sales.sales,
        );
        assert.equal(o.periods["7"].sales.status, "WITHIN");
        const old = await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: inventory.id },
        });
        await db.metaEffectivenessSheet.update({
          where: { id: inventory.id },
          data: {
            config: {
              inventoryActivation: {
                cacRules: { review: 3, severe: 4, critical: 6, zero: 25 },
              },
              unrelatedSecret: "not-for-response",
            },
          },
        });
        try {
          const updated = await dashboard(viewer, q),
            v = updated.items.find((o) => o.id === ids.campaign)! as any;
          assert.equal(v.periods["7"].sales.cac, 5);
          assert.equal(v.periods["7"].sales.status, "SEVERE");
          const response = await metaRoutes(
            new NextRequest(
              `http://localhost/api/meta-ads/objects/${ids.campaign}/daily?since=${since7}&until=${today}&sales=1`,
            ),
            ["meta-ads", "objects", ids.campaign, "daily"],
            viewer,
            async () => ({}),
          );
          const d = await response!.json();
          assert.deepEqual(d.sales.rules, {
            review: 3,
            severe: 4,
            critical: 6,
            zero: 25,
          });
          assert(!JSON.stringify(updated).includes("not-for-response"));
          assert(!JSON.stringify(d).includes("not-for-response"));
        } finally {
          await db.metaEffectivenessSheet.update({
            where: { id: inventory.id },
            data: { config: old.config as any },
          });
        }
      },
    );
    await t.test(
      "Vínculos compartidos proyectan V una vez por resumen y no inventan CAC individual",
      async () => {
        await db.metaAdObject.update({
          where: { id: ids.shared },
          data: { aliasId: alias.id, aliasCountry: "PE" },
        });
        const r = await dashboard(
          viewer,
          new URLSearchParams({
            accounts: accountId,
            level: "campaign",
            summary: "1",
          }),
        );
        const a = r.items.find((o) => o.id === ids.campaign)! as any,
          b = r.items.find((o) => o.id === ids.shared)! as any;
        assert.equal(a.periods["7"].sales.sales, 14);
        assert.equal(b.periods["7"].sales.sales, 14);
        assert.equal(a.periods["7"].sales.sharedCampaigns, 2);
        assert.equal(a.periods["7"].sales.cac, null);
        assert.equal(r.summary?.sales?.total, 26);
        assert.equal(
          (await metaRegisteredSales(viewer, [ids.campaign, ids.shared])).total,
          26,
        );
      },
    );
    await t.test(
      "Anuncios no consultan/atribuyen V; diario campaña incluye ventas y fechas sin informe Meta",
      async () => {
        const r = await dashboard(
          viewer,
          new URLSearchParams({ accounts: accountId, level: "ad" }),
        );
        assert(r.items.every((o: any) => !o.periods["7"].sales));
        const route = async (id: string) => {
          const req = new NextRequest(
            `https://example.test/api/meta-ads/objects/${id}/daily?since=2026-10-14&until=2026-10-15&sales=1`,
          );
          const response = await metaRoutes(
            req,
            ["meta-ads", "objects", id, "daily"],
            viewer,
            async () => ({}),
          );
          return response!.json();
        };
        const c = await route(ids.campaign);
        assert.deepEqual(c.rows, []);
        assert.equal(
          c.sales.days.find((d: any) => d.day === "2026-10-14").sales,
          5,
        );
        assert.equal(c.sales.sharedCampaigns, 2);
        assert.equal((await route(ids.ad)).sales, null);
        await assert.rejects(route(ids.foreign));
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    await db.metaAdAccount.deleteMany({
      where: { id: { in: [accountId, foreignId] } },
    });
    await db.metaConnection.delete({ where: { id: conn.id } });
    await db.metaEffectivenessLink.deleteMany({
      where: { tableId: { in: tableIds } },
    });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { tableId: { in: tableIds } } },
    });
    await db.metaAlias.deleteMany({ where: { tableId: { in: tableIds } } });
    await db.metaAliasTable.deleteMany({ where: { id: { in: tableIds } } });
    await db.metaEffectivenessSheet.delete({ where: { id: inventory.id } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
});
