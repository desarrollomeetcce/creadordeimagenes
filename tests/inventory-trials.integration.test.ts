import test from "node:test";
import type { TrialCycle } from "../lib/meta-ads/inventory-trial-policy";
import { Prisma } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryTrials,
  saveInventoryTrial as changeInventoryTrial,
  inventoryTrialReport,
  inventoryCatalogTrialReport,
} from "../lib/meta-ads/inventory-trials";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import {
  diverseTrialItems,
  trialAssessment,
  trialDays,
} from "../lib/meta-ads/inventory-trial-policy";
async function saveInventoryTrial(
  actor: Parameters<typeof changeInventoryTrial>[0],
  input: unknown,
) {
  const result = await changeInventoryTrial(actor, input);
  assert(!("removed" in result));
  return result;
}
test("Grupos de inventario: reglas, países, propuestas, reemplazos e aislamiento", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo DB exclusiva",
  );
  const tag = randomUUID(),
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    yesterday = new Date(Date.parse(today) - 86400000)
      .toISOString()
      .slice(0, 10);
  const users = await Promise.all(
      ["OWNER", "USER", "OBSERVER"].map((role: any) =>
        db.user.create({
          data: {
            name: "Grupos " + role,
            email: role + tag + "@example.test",
            role,
            status: "APPROVED",
            passwordHash: "synthetic",
          },
        }),
      ),
    ),
    [owner, editor, viewer] = users,
    actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
      data: { name: "Grupos " + tag, kind: "INVENTORY" },
    }),
    foreign = await db.metaEffectivenessSheet.create({
      data: { name: "Ajeno " + tag, kind: "INVENTORY" },
    }),
    categories = await Promise.all(
      ["A", "B", "C"].map((name) =>
        db.metaInventoryCategory.create({
          data: {
            sheetId: list.id,
            kind: "PRIMARY",
            name: name + tag,
            key: name + tag,
          },
        }),
      ),
    ),
    table = await db.metaAliasTable.create({
      data: {
        name: "Fuente " + tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    }),
    copy = await db.metaAliasTable.create({
      data: {
        name: "Copia " + tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    }),
    items = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        db.metaInventoryItem.create({
          data: {
            sheetId: list.id,
            name: "Diplomado " + i + tag,
            categories: { create: { categoryId: categories[i % 3].id } },
          },
        }),
      ),
    ),
    alias = await db.metaAlias.create({
      data: {
        tableId: table.id,
        inventorySheetId: list.id,
        name: items[0].name,
      },
    }),
    legacy = await db.metaAlias.create({
      data: {
        tableId: table.id,
        inventorySheetId: list.id,
        name: "Legacy " + tag,
        categoryAssignments: { create: { categoryId: categories[2].id } },
      },
    }),
    ownOther = await db.metaInventoryItem.create({
      data: { sheetId: foreign.id, name: "Secreto " + tag },
    });
  const rowPE = await db.metaEffectivenessRow.create({
      data: {
        aliasId: alias.id,
        country: "PE",
        currency: "",
        displayCurrency: "PEN",
        days: {
          create: [
            {
              day: yesterday,
              sales: 0,
              salesOverridden: true,
              annotations: { budget: { value: 10, currency: "PEN" } },
            },
            {
              day: today,
              sales: 0,
              salesOverridden: true,
              annotations: { budget: { value: 20, currency: "PEN" } },
            },
          ],
        },
      },
    }),
    rowEC = await db.metaEffectivenessRow.create({
      data: {
        aliasId: alias.id,
        country: "EC",
        currency: "",
        displayCurrency: "PEN",
        days: {
          create: [
            {
              day: yesterday,
              sales: 1,
              salesOverridden: true,
              annotations: { budget: { value: 20, currency: "PEN" } },
            },
            {
              day: today,
              sales: 1,
              salesOverridden: true,
              annotations: { budget: { value: 20, currency: "PEN" } },
            },
          ],
        },
      },
    });
  const fail = (p: Promise<unknown>, code: number) =>
    assert.rejects(p, (e: any) => e.status === code);
  let group: any;
  const base = {
    action: "CREATE",
    listId: list.id,
    name: "Grupo 1",
    itemIds: [items[0].id],
    countries: ["PE", "EC"],
    since: yesterday,
    reserve: false,
    diverse: false,
    rules: { zero: 25, perSale: 50 },
  };
  try {
    await t.test(
      "Propuesta aleatoria respeta principales, exclusiones y límites",
      async () => {
        const d = await inventoryTrials(actor, { listId: list.id });
        assert(!d.catalog.some((i) => i.id === ownOther.id));
        const proposal = diverseTrialItems(d.catalog, 10, [], () => 0.5);
        assert.equal(proposal.length, 3);
        assert.equal(new Set(proposal.flatMap((i) => i.primaryIds)).size, 3);
        assert(
          !diverseTrialItems(d.catalog, 10, [items[0].id], () => 0.5).some(
            (i) => i.id === items[0].id,
          ),
        );
        assert.equal(
          trialAssessment(0, 25, true, { zero: 25, perSale: 50 }).status,
          "CRITICAL",
        );
        assert.equal(
          trialAssessment(2, 99, true, { zero: 25, perSale: 50 }).status,
          "WITHIN",
        );
        assert.equal(
          trialAssessment(2, 100, true, { zero: 25, perSale: 50 }).status,
          "ALERT",
        );
        assert.equal(
          trialAssessment(null, 100, true, { zero: 25, perSale: 50 }).status,
          "PENDING",
        );
        assert.equal(
          trialAssessment(0, 100, false, { zero: 25, perSale: 50 }).status,
          "PENDING",
        );
      },
    );
    await t.test(
      "Alta persistente, canoniza legacy y rechaza área repetida o ítem ajeno",
      async () => {
        group = await saveInventoryTrial(actor, base);
        assert.equal(group.cycles.length, 2);
        assert.equal(
          (await inventoryTrials(actor, { listId: list.id })).groups.length,
          1,
        );
        await fail(
          saveInventoryTrial(actor, { ...base, itemIds: [ownOther.id] }),
          409,
        );
        await fail(
          saveInventoryTrial(actor, {
            ...base,
            diverse: true,
            itemIds: [items[0].id, items[3].id],
          }),
          409,
        );
        const reserve = await saveInventoryTrial(actor, {
          ...base,
          name: "Reserva",
          reserve: true,
          itemIds: [legacy.id],
        });
        assert.equal(reserve.cycles.length, 0);
        assert(reserve.members[0].itemId !== legacy.id);
        assert(
          await db.metaInventoryItem.findUnique({
            where: { id: reserve.members[0].itemId },
          }),
        );
      },
    );
    await t.test(
      "Reintentar el alta no duplica grupos ni cambia la selección guardada",
      async () => {
        const requestId = randomUUID(),
          b = {
            ...base,
            itemIds: [items[2].id],
            name: "Idempotente",
            requestId,
            reserve: true,
          };
        const a = await saveInventoryTrial(actor, b),
          again = await saveInventoryTrial(actor, b);
        assert.equal(a.id, again.id);
        assert.equal(
          await db.metaInventoryTrialGroup.count({ where: { id: requestId } }),
          1,
        );
        await fail(
          saveInventoryTrial(actor, { ...b, name: "Otra selección" }),
          409,
        );
        await saveInventoryTrial(actor, {
          action: "ARCHIVE",
          listId: list.id,
          groupId: a.id,
          revision: a.revision,
        });
      },
    );
    await t.test(
      "Metadatos de grupos reutilizan categorías y hojas del inventario sin exigir vínculos",
      async () => {
        const secondary = await db.metaInventoryCategory.create({
          data: {
            sheetId: list.id,
            kind: "SECONDARY",
            name: "Secundaria " + tag,
            key: "secondary" + tag,
          },
        });
        await db.metaInventoryItemCategory.create({
          data: { itemId: items[0].id, categoryId: secondary.id },
        });
        const directory = await inventoryTrials(actor, { listId: list.id }),
          item = directory.catalog.find((i) => i.id === items[0].id)!,
          unlinked = directory.catalog.find((i) => i.id === items[1].id)!;
        assert.deepEqual(item.primaryNames, [categories[0].name]);
        assert.deepEqual(item.secondaryNames, [secondary.name]);
        assert.deepEqual(item.sheets, [{ id: table.id, name: table.name }]);
        assert.deepEqual(unlinked.sheets, []);
        const legacyItem = directory.catalog.find(
          (i) => i.name === legacy.name,
        )!;
        assert(legacyItem.sheets?.some((t) => t.id === table.id));
      },
    );
    await t.test(
      "Cifras reales por país, cero explícito y sincronización incompleta pendientes",
      async () => {
        const report = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: group.id,
          }),
          pe = report.rows.find((r) => r.country === "PE")!,
          ec = report.rows.find((r) => r.country === "EC")!;
        assert.equal(pe.sales, 0);
        assert.equal(pe.budget, 30);
        assert.equal(pe.activeDays, 2);
        assert.equal(pe.budgetEvaluation.status, "CRITICAL");
        assert.equal(pe.budgetEvaluation.usage, 1.2);
        assert.equal(ec.sales, 2);
        assert.equal(ec.budget, 40);
        assert.equal(ec.budgetEvaluation.status, "WITHIN");
        assert.equal(ec.budgetEvaluation.usage, 0.4);
        assert.equal(ec.metaEvaluation.status, "PENDING");
        assert.equal(pe.spend, null);
      },
    );
    await t.test(
      "Hojas vinculadas no duplican ventas ni presupuesto",
      async () => {
        const ca = await db.metaAlias.create({
          data: {
            tableId: copy.id,
            inventorySheetId: list.id,
            name: items[0].name,
          },
        });
        for (const country of ["PE", "EC"])
          await db.metaEffectivenessRow.create({
            data: {
              aliasId: ca.id,
              country,
              currency: "",
              displayCurrency: "PEN",
            },
          });
        await db.metaEffectivenessLink.create({
          data: {
            tableId: copy.id,
            sourceTableId: table.id,
            columns: ["sales", "budget", "spend"],
          },
        });
        const r = await inventoryTrialReport(actor, {
          listId: list.id,
          groupId: group.id,
        });
        assert.equal(r.rows.find((r) => r.country === "PE")!.budget, 30);
        assert.equal(r.rows.find((r) => r.country === "EC")!.sales, 2);
        assert.equal(r.rows.find((r) => r.country === "EC")!.budget, 40);
      },
    );

    await t.test(
      "Gasto Meta fresco, errores y campañas sin cobertura no generan falsos positivos",
      async () => {
        const connection = await db.metaConnection.create({
          data: {
            ownerId: owner.id,
            name: "QA " + tag,
            transport: "API",
            verifiedAt: new Date(),
          },
        });
        const account = await db.metaAdAccount.create({
          data: {
            id: "991" + Date.now(),
            connectionId: connection.id,
            name: "QA " + tag,
            currency: "PEN",
            timezone: "America/Lima",
            metric: "MESSAGES",
            syncedAt: new Date(),
            enabled: false,
          },
        });
        const campaign = await db.metaAdObject.create({
          data: {
            id: "992" + Date.now(),
            accountId: account.id,
            aliasId: alias.id,
            aliasCountry: "PE",
            name: "QA campaña",
            level: "campaign",
            status: "ACTIVE",
            effectiveStatus: "ACTIVE",
          },
        });
        try {
          for (const [day, spend] of [
            [yesterday, 10],
            [today, 20],
          ] as const)
            await db.metaAdDaily.create({
              data: {
                accountId: account.id,
                objectId: campaign.id,
                day,
                scope: "7d_click,1d_view|impression",
                spend,
              },
            });
          let r = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: group.id,
          });
          assert.equal(r.rows.find((x) => x.country === "PE")!.spend, 30);
          assert.equal(
            r.rows.find((x) => x.country === "PE")!.metaEvaluation.status,
            "CRITICAL",
          );
          await db.metaAdAccount.update({
            where: { id: account.id },
            data: { syncError: "Sincronización pendiente" },
          });
          r = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: group.id,
          });
          assert.equal(r.rows.find((x) => x.country === "PE")!.spend, 30);
          assert.equal(
            r.rows.find((x) => x.country === "PE")!.metaEvaluation.status,
            "PENDING",
          );
          await db.metaAdAccount.update({
            where: { id: account.id },
            data: { syncError: null },
          });
          await db.metaAdObject.create({
            data: {
              id: "993" + Date.now(),
              accountId: account.id,
              aliasId: alias.id,
              aliasCountry: "PE",
              name: "Sin cobertura",
              level: "campaign",
              status: "ACTIVE",
              effectiveStatus: "ACTIVE",
            },
          });
          r = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: group.id,
          });
          assert.equal(
            r.rows.find((x) => x.country === "PE")!.metaEvaluation.status,
            "PENDING",
          );
        } finally {
          await db.metaAdAccount.delete({ where: { id: account.id } });
          await db.metaConnection.delete({ where: { id: connection.id } });
        }
      },
    );
    await t.test(
      "Monedas por país usan tasa de la misma fecha; sin tasa quedan pendientes",
      async () => {
        const day = new Date(Date.parse(today) - 100 * 86400000)
            .toISOString()
            .slice(0, 10),
          prior = await db.metaFxDay.findUnique({ where: { day } });
        const a = await db.metaAlias.create({
          data: {
            tableId: table.id,
            inventorySheetId: list.id,
            name: items[2].name,
          },
        });
        await db.metaEffectivenessRow.create({
          data: {
            aliasId: a.id,
            country: "EC",
            currency: "",
            displayCurrency: "USD",
            days: {
              create: {
                day,
                sales: 2,
                salesOverridden: true,
                annotations: { budget: { value: 10, currency: "USD" } },
              },
            },
          },
        });
        try {
          await db.metaFxDay.upsert({
            where: { day },
            create: {
              day,
              rates: { PEN: 4, USD: 1 },
              source: "test",
              sourceUrl: "https://example.test",
            },
            update: { rates: { PEN: 4, USD: 1 } },
          });
          const moneyGroup = await saveInventoryTrial(actor, {
            ...base,
            name: "Moneda",
            itemIds: [items[2].id],
            countries: ["EC"],
            since: day,
          });
          let r = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: moneyGroup.id,
            until: day,
          });
          assert.equal(r.rows[0].budget, 40);
          assert.equal(r.rows[0].budgetEvaluation.usage, 0.4);
          await db.metaFxDay.delete({ where: { day } });
          r = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: moneyGroup.id,
            until: day,
          });
          assert.equal(r.rows[0].budget, null);
          assert.equal(r.rows[0].budgetEvaluation.status, "PENDING");
        } finally {
          if (prior)
            await db.metaFxDay.upsert({
              where: { day },
              create: {
                ...prior,
                rates:
                  prior.rates === null
                    ? Prisma.JsonNull
                    : (prior.rates as Prisma.InputJsonValue),
              },
              update: {
                ...prior,
                rates:
                  prior.rates === null
                    ? Prisma.JsonNull
                    : (prior.rates as Prisma.InputJsonValue),
              },
            });
          else await db.metaFxDay.deleteMany({ where: { day } });
        }
      },
    );
    await t.test(
      "Inicio real por país modifica el período solo en ese país",
      async () => {
        const b = {
          action: "START_DATE",
          listId: list.id,
          groupId: group.id,
          country: "EC",
          slotIds: group.members.map((m: any) => m.slotId),
          date: today,
        };
        group = await saveInventoryTrial(actor, {
          ...b,
          revision: group.revision,
        });
        let r = await inventoryTrialReport(actor, {
          listId: list.id,
          groupId: group.id,
        });
        assert.equal(r.rows.find((x) => x.country === "EC")!.activeDays, 1);
        assert.equal(r.rows.find((x) => x.country === "EC")!.sales, 1);
        assert.equal(r.rows.find((x) => x.country === "PE")!.activeDays, 2);
        group = await saveInventoryTrial(actor, {
          ...b,
          revision: group.revision,
          date: yesterday,
        });
      },
    );
    await t.test(
      "Pausas se excluyen y reanudar conserva cifras; revisiones previenen sobrescritura",
      async () => {
        const change = {
          listId: list.id,
          groupId: group.id,
          country: "PE",
          slotIds: [group.members[0].slotId],
        };
        const old = group.revision;
        group = await saveInventoryTrial(actor, {
          ...change,
          revision: old,
          action: "PAUSE",
          date: today,
        });
        await fail(
          saveInventoryTrial(actor, {
            ...change,
            revision: old,
            action: "DECISION",
            decision: "KEEP",
          }),
          409,
        );
        let r = await inventoryTrialReport(actor, {
          listId: list.id,
          groupId: group.id,
        });
        assert.equal(r.rows.find((r) => r.country === "PE")!.activeDays, 1);
        assert.equal(r.rows.find((r) => r.country === "PE")!.budget, 10);
        assert.equal(r.rows.find((r) => r.country === "EC")!.budget, 40);
        group = await saveInventoryTrial(actor, {
          ...change,
          revision: group.revision,
          action: "RESUME",
          date: today,
        });
        r = await inventoryTrialReport(actor, {
          listId: list.id,
          groupId: group.id,
        });
        assert.equal(r.rows.find((r) => r.country === "PE")!.budget, 30);
        assert.equal(
          trialDays(yesterday, today, [{ since: today, until: null }]).length,
          1,
        );
      },
    );
    await t.test(
      "Reemplazo aislado por país conserva historial, lote fallido no cambia nada",
      async () => {
        const replace = {
          action: "REPLACE",
          listId: list.id,
          groupId: group.id,
          country: "PE",
          date: today,
          revision: group.revision,
        };
        await fail(
          saveInventoryTrial(actor, {
            ...replace,
            replacements: [
              { slotId: group.members[0].slotId, itemId: items[1].id },
              { slotId: "no-existe", itemId: items[2].id },
            ],
          }),
          409,
        );
        assert.equal(
          (await inventoryTrials(actor, { listId: list.id })).groups.find(
            (g) => g.id === group.id,
          )!.revision,
          group.revision,
        );
        group = await saveInventoryTrial(actor, {
          ...replace,
          replacements: [
            { slotId: group.members[0].slotId, itemId: items[1].id },
          ],
        });
        assert.equal(
          group.cycles.find((c: any) => c.country === "EC" && !c.until)!.itemId,
          items[0].id,
        );
        assert.equal(
          group.cycles.find((c: any) => c.country === "PE" && !c.until)!.itemId,
          items[1].id,
        );
        assert(
          group.cycles.some(
            (c: any) =>
              c.country === "PE" && c.itemId === items[0].id && c.until,
          ),
        );
        const report = await inventoryTrialReport(actor, {
          listId: list.id,
          groupId: group.id,
        });
        assert.equal(report.rows.find((r) => r.country === "PE")!.sales, null);
        assert.equal(
          report.rows.find((r) => r.country === "PE")!.budgetEvaluation.status,
          "PENDING",
        );
      },
    );
    await t.test(
      "Pertenencia exclusiva y edición atómica conservan ciclos, otros países y revisión",
      async () => {
        const editItem = await db.metaInventoryItem.create({
          data: { sheetId: list.id, name: "Edición " + tag },
        });
        await fail(
          saveInventoryTrial(actor, { ...base, name: "Duplicado" }),
          409,
        );
        const another = await saveInventoryTrial(actor, {
          ...base,
          name: "Otro",
          itemIds: [items[3].id],
        });
        const before = structuredClone(group);
        await fail(
          saveInventoryTrial(actor, {
            action: "MEMBERS",
            listId: list.id,
            groupId: group.id,
            revision: group.revision,
            itemIds: [items[0].id, items[3].id],
            since: today,
          }),
          409,
        );
        assert.equal(
          (await inventoryTrials(actor, { listId: list.id })).groups.find(
            (g) => g.id === group.id,
          )!.revision,
          group.revision,
        );
        await fail(
          saveInventoryTrial(actor, {
            action: "MEMBERS",
            listId: list.id,
            groupId: group.id,
            revision: group.revision,
            itemIds: [ownOther.id],
            since: today,
          }),
          409,
        );
        group = await saveInventoryTrial(actor, {
          action: "MEMBERS",
          listId: list.id,
          groupId: group.id,
          revision: group.revision,
          itemIds: [items[0].id, editItem.id],
          since: today,
        });
        assert.deepEqual(
          group.cycles.filter(
            (c: TrialCycle) => c.slotId === before.members[0].slotId,
          ),
          before.cycles,
        );
        assert.equal(group.members.length, 2);
        assert.equal(
          group.cycles.filter(
            (c: TrialCycle) => c.itemId === editItem.id && !c.until,
          ).length,
          2,
        );
        await fail(
          saveInventoryTrial(actor, {
            action: "MEMBERS",
            listId: list.id,
            groupId: group.id,
            revision: before.revision,
            itemIds: [],
            since: today,
          }),
          409,
        );
        group = await saveInventoryTrial(actor, {
          action: "MEMBERS",
          listId: list.id,
          groupId: group.id,
          revision: group.revision,
          itemIds: [items[0].id],
          since: today,
        });
        assert(
          group.cycles
            .filter((c: TrialCycle) => c.itemId === editItem.id)
            .every((c: TrialCycle) => c.until),
        );
        const report = await inventoryTrialReport(actor, {
          listId: list.id,
          groupId: group.id,
        });
        assert(report.rows.every((r) => r.slotId === group.members[0].slotId));
        await saveInventoryTrial(actor, {
          action: "ARCHIVE",
          listId: list.id,
          groupId: another.id,
          revision: another.revision,
        });
      },
    );
    await t.test(
      "Países nuevos, reglas y archivo se guardan sin tocar datos financieros",
      async () => {
        group = await saveInventoryTrial(actor, {
          action: "COUNTRIES",
          listId: list.id,
          groupId: group.id,
          revision: group.revision,
          countries: ["PE", "EC", "BO"],
          since: today,
        });
        assert(group.cycles.some((c: any) => c.country === "BO"));
        group = await saveInventoryTrial(actor, {
          action: "RULES",
          listId: list.id,
          groupId: group.id,
          revision: group.revision,
          rules: { zero: 30, perSale: 60 },
        });
        assert.equal(group.rules.zero, 30);
        assert.equal(
          ((
            await db.metaEffectivenessDay.findUniqueOrThrow({
              where: { rowId_day: { rowId: rowPE.id, day: today } },
            })
          ).annotations as any) !== null,
          true,
        );
        assert.equal(
          await db.metaEffectivenessDay.count({
            where: { rowId: { in: [rowPE.id, rowEC.id] } },
          }),
          4,
        );
      },
    );
    await t.test(
      "Editor compartido solo gestiona su inventario, visor solo lee; revocación efectiva",
      async () => {
        await db.effectivenessGrant.createMany({
          data: [
            {
              scope: "TAB:" + list.id,
              userId: editor.id,
              grantedById: owner.id,
              permission: "EDIT",
            },
            {
              scope: "TAB:" + list.id,
              userId: viewer.id,
              grantedById: owner.id,
              permission: "VIEW",
            },
          ],
        });
        const editActor = await authorizeFinancialRequest(
          editor,
          "inventory/trials",
          "POST",
          new URLSearchParams(),
          base,
          "TAB:" + list.id,
        );
        await saveInventoryTrial(editActor, {
          ...base,
          itemIds: [items[3].id],
          name: "Editor",
        });
        await fail(
          saveInventoryTrial(editActor, {
            ...base,
            listId: foreign.id,
            itemIds: [ownOther.id],
          }),
          403,
        );
        const readActor = await authorizeFinancialRequest(
          viewer,
          "inventory/trials",
          "GET",
          new URLSearchParams({ listId: list.id }),
          {},
          "TAB:" + list.id,
        );
        assert.equal(
          (await inventoryTrials(readActor, { listId: list.id })).canEdit,
          false,
        );
        const viewReport = await inventoryTrialReport(readActor, {
          listId: list.id,
          groupId: group.id,
        });
        assert(viewReport.rows.length > 0);
        const batchViewer = await inventoryCatalogTrialReport(readActor, {
          listId: list.id,
          groupIds: group.id,
        });
        assert.deepEqual(batchViewer.reports[0].rows, viewReport.rows);
        await fail(
          inventoryCatalogTrialReport(readActor, {
            listId: foreign.id,
            groupIds: group.id,
          }),
          403,
        );

        assert(
          viewReport.rows.every(
            (row) =>
              Array.isArray(row.sheets) &&
              ["ACTIVE", "INACTIVE", "MIXED", "UNKNOWN"].includes(
                row.activation,
              ),
          ),
        );
        await fail(saveInventoryTrial(readActor, base), 403);
        await fail(
          changeInventoryTrial(readActor, {
            action: "REMOVE_MEMBERS",
            listId: list.id,
            groups: [
              {
                groupId: group.id,
                revision: group.revision,
                itemIds: [items[0].id],
              },
            ],
          }),
          403,
        );
        await db.effectivenessGrant.deleteMany({
          where: { userId: editor.id },
        });
        await fail(saveInventoryTrial(editActor, base), 403);
      },
    );
    await t.test(
      "Fuentes y activación por país: Ecuador, Bolivia y factor independiente",
      async () => {
        const item = await db.metaInventoryItem.create({
          data: { sheetId: list.id, name: "Fuentes " + tag },
        });
        const sources = await Promise.all(
          ["Perú", "Ecuador", "Ecuador adicional", "Bolivia"].map((name) =>
            db.metaAliasTable.create({
              data: { name: name + tag, defaultCurrency: "PEN" },
            }),
          ),
        );
        const aliases = [];
        const countries = ["PE", "EC", "EC", "BO"];
        for (let i = 0; i < sources.length; i++) {
          const alias = await db.metaAlias.create({
            data: {
              name: item.name,
              inventorySheetId: list.id,
              tableId: sources[i].id,
            },
          });
          aliases.push(alias);
          await db.metaEffectivenessRow.create({
            data: {
              aliasId: alias.id,
              country: countries[i],
              currency: "PEN",
              displayCurrency: "PEN",
              days: {
                create: [
                  {
                    day: yesterday,
                    sales: 0,
                    salesOverridden: true,
                    annotations: { budget: { value: 0, currency: "PEN" } },
                  },
                  {
                    day: today,
                    sales: [1, 2, 1, 0][i],
                    salesOverridden: true,
                    annotations: {
                      budget: { value: [10, 20, 10, 25][i], currency: "PEN" },
                    },
                  },
                ],
              },
            },
          });
        }
        const group = await saveInventoryTrial(actor, {
          ...base,
          name: "Países fuente",
          itemIds: [item.id],
          countries: ["PE", "EC", "BO"],
        });
        try {
          let report = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: group.id,
          });
          const ec = report.rows.find((r) => r.country === "EC")!,
            bo = report.rows.find((r) => r.country === "BO")!;
          assert.equal(ec.sales, 3);
          assert.equal(ec.budget, 30);
          assert.equal(ec.budgetEvaluation.usage, 0.2);
          assert.equal(ec.activation, "ACTIVE");
          assert.deepEqual(
            ec.sheets.map((s) => s.name).sort(),
            sources
              .slice(1, 3)
              .map((s) => s.name)
              .sort(),
          );
          assert.equal(bo.budgetEvaluation.usage, 1);
          assert.equal(bo.budgetEvaluation.status, "CRITICAL");
          await db.metaEffectivenessState.createMany({
            data: [
              { aliasId: aliases[2].id, country: "EC", active: false },
              { aliasId: aliases[3].id, country: "BO", active: false },
            ],
          });
          report = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: group.id,
          });
          assert.equal(
            report.rows.find((r) => r.country === "PE")!.activation,
            "ACTIVE",
          );
          assert.equal(
            report.rows.find((r) => r.country === "EC")!.activation,
            "MIXED",
          );
          assert.equal(
            report.rows.find((r) => r.country === "BO")!.activation,
            "INACTIVE",
          );
          const detail = await inventoryTrialReport(actor, {
            listId: list.id,
            groupId: group.id,
            slotId: group.members[0].slotId,
            country: "EC",
          });
          assert.equal(detail.rows.length, 1);
          assert.equal(detail.rows[0].sheets.length, 2);
          assert.equal(detail.rows[0].sheets.filter((s) => s.active).length, 1);
          const otherItem = await db.metaInventoryItem.create({
            data: { sheetId: list.id, name: "Fuente adicional " + tag },
          });
          const otherAlias = await db.metaAlias.create({
            data: {
              tableId: sources[0].id,
              inventorySheetId: list.id,
              name: otherItem.name,
            },
          });
          aliases.push(otherAlias);
          await db.metaEffectivenessRow.create({
            data: {
              aliasId: otherAlias.id,
              country: "PE",
              currency: "PEN",
              displayCurrency: "PEN",
              days: {
                create: [
                  {
                    day: yesterday,
                    sales: 50,
                    salesOverridden: true,
                    annotations: { budget: { value: 500, currency: "PEN" } },
                  },
                  {
                    day: today,
                    sales: 2,
                    salesOverridden: true,
                    annotations: { budget: { value: 10, currency: "PEN" } },
                  },
                ],
              },
            },
          });
          const otherGroup = await saveInventoryTrial(actor, {
            ...base,
            since: today,
            name: "Otro inicio",
            itemIds: [otherItem.id],
            countries: ["PE"],
          });
          try {
            const batch = await inventoryCatalogTrialReport(actor, {
              listId: list.id,
              groupIds: [group.id, otherGroup.id].join(","),
            });
            assert.equal(batch.reports.length, 2);
            assert.equal(batch.errors.length, 0);
            for (const id of [group.id, otherGroup.id]) {
              const individual = await inventoryTrialReport(actor, {
                listId: list.id,
                groupId: id,
              });
              assert.deepEqual(
                batch.reports.find((r) => r.groupId === id)!.rows,
                individual.rows,
              );
            }
            const otherRow = batch.reports.find(
              (r) => r.groupId === otherGroup.id,
            )!.rows[0];
            assert.equal(otherRow.sales, 2);
            assert.equal(otherRow.budget, 10);
            assert.equal(otherRow.budgetEvaluation.usage, 0.1);
            await fail(
              inventoryCatalogTrialReport(actor, {
                listId: foreign.id,
                groupIds: group.id,
              }),
              409,
            );
            await fail(
              inventoryCatalogTrialReport(actor, {
                listId: list.id,
                groupIds: group.id + "," + group.id,
              }),
              400,
            );
            await fail(
              inventoryCatalogTrialReport(actor, {
                listId: list.id,
                groupIds: group.id + ",missing",
              }),
              409,
            );
          } finally {
            await db.metaInventoryTrialGroup.delete({
              where: { id: otherGroup.id },
            });
          }
        } finally {
          await db.metaInventoryTrialGroup.delete({ where: { id: group.id } });
          await db.metaEffectivenessRow.deleteMany({
            where: { aliasId: { in: aliases.map((a) => a.id) } },
          });
          await db.metaAlias.deleteMany({
            where: { id: { in: aliases.map((a) => a.id) } },
          });
          await db.metaAliasTable.deleteMany({
            where: { id: { in: sources.map((t) => t.id) } },
          });
        }
      },
    );
    await t.test(
      "Asignación directa agrega solo elegidos y conserva miembros/ciclos existentes",
      async () => {
        const fresh = await Promise.all(
          [0, 1, 2, 3].map((i) =>
            db.metaInventoryItem.create({
              data: { sheetId: list.id, name: "Directo " + i + tag },
            }),
          ),
        );
        let direct = await saveInventoryTrial(actor, {
          ...base,
          name: "Directo",
          itemIds: [fresh[0].id],
        });
        const occupied = await saveInventoryTrial(actor, {
          ...base,
          name: "Ocupado",
          itemIds: [fresh[3].id],
        });
        const old = structuredClone(direct);
        await fail(
          changeInventoryTrial(actor, {
            action: "ADD_MEMBERS",
            listId: list.id,
            groupId: direct.id,
            revision: direct.revision,
            itemIds: [fresh[1].id, ownOther.id],
            since: today,
          }),
          409,
        );
        assert.equal(
          (await inventoryTrials(actor, { listId: list.id })).groups.find(
            (g) => g.id === direct.id,
          )!.members.length,
          1,
        );
        direct = await saveInventoryTrial(actor, {
          action: "ADD_MEMBERS",
          listId: list.id,
          groupId: direct.id,
          revision: direct.revision,
          itemIds: [fresh[1].id, fresh[2].id],
          since: today,
        });
        assert.deepEqual(
          direct.members.map((m) => m.itemId),
          fresh.slice(0, 3).map((i) => i.id),
        );
        assert.deepEqual(
          direct.cycles.filter((c) => c.slotId === old.members[0].slotId),
          old.cycles,
        );
        await fail(
          changeInventoryTrial(actor, {
            action: "ADD_MEMBERS",
            listId: list.id,
            groupId: direct.id,
            revision: old.revision,
            itemIds: [fresh[3].id],
            since: today,
          }),
          409,
        );
        await fail(
          changeInventoryTrial(actor, {
            action: "ADD_MEMBERS",
            listId: list.id,
            groupId: direct.id,
            revision: direct.revision,
            itemIds: [fresh[3].id],
            since: today,
          }),
          409,
        );
        const again = await saveInventoryTrial(actor, {
          action: "ADD_MEMBERS",
          listId: list.id,
          groupId: direct.id,
          revision: direct.revision,
          itemIds: [fresh[1].id],
          since: today,
        });
        assert.equal(again.members.length, 3);
        assert.equal(again.cycles.length, 6);
        const more = Array.from({ length: 101 }, (_, i) => ({
          id: randomUUID(),
          sheetId: list.id,
          name: "Lote directo " + i + tag,
        }));
        await db.metaInventoryItem.createMany({ data: more });
        const large = await saveInventoryTrial(actor, {
          action: "ADD_MEMBERS",
          listId: list.id,
          groupId: direct.id,
          revision: again.revision,
          itemIds: more.map((i) => i.id),
          since: today,
        });
        assert.equal(large.members.length, 104);
        assert.equal(large.cycles.length, 208);

        assert.equal(
          (await inventoryTrials(actor, { listId: list.id })).groups.find(
            (g) => g.id === occupied.id,
          )!.members.length,
          1,
        );
      },
    );
    await t.test(
      "Retirada individual y masiva atómica conserva grupos, inventario y ciclos",
      async () => {
        const fresh = await Promise.all(
          [0, 1, 2].map((i) =>
            db.metaInventoryItem.create({
              data: { sheetId: list.id, name: "Retirar " + i + tag },
            }),
          ),
        );
        const a = await saveInventoryTrial(actor, {
          ...base,
          name: "Retirar A",
          itemIds: fresh.slice(0, 2).map((i) => i.id),
        });
        const b = await saveInventoryTrial(actor, {
          ...base,
          name: "Retirar B",
          itemIds: [fresh[2].id],
        });
        const groups = [
          { groupId: a.id, revision: a.revision, itemIds: [fresh[0].id] },
          { groupId: b.id, revision: b.revision + 1, itemIds: [fresh[2].id] },
        ];
        await fail(
          changeInventoryTrial(actor, {
            action: "REMOVE_MEMBERS",
            listId: list.id,
            groups,
          }),
          409,
        );
        let current = (
          await inventoryTrials(actor, { listId: list.id })
        ).groups.find((g) => g.id === a.id)!;
        assert.equal(current.members.length, 2);
        assert.equal(current.revision, a.revision);
        await fail(
          changeInventoryTrial(actor, {
            action: "REMOVE_MEMBERS",
            listId: list.id,
            groups: [{ ...groups[0], itemIds: [ownOther.id] }],
          }),
          409,
        );
        groups[1].revision = b.revision;
        const result = await changeInventoryTrial(actor, {
          action: "REMOVE_MEMBERS",
          listId: list.id,
          groups,
        });
        assert.equal("removed" in result && result.removed, 2);
        const directory = await inventoryTrials(actor, { listId: list.id });
        current = directory.groups.find((g) => g.id === a.id)!;
        assert.deepEqual(
          current.members.map((m) => m.itemId),
          [fresh[1].id],
        );
        assert(
          current.cycles
            .filter((c) => c.itemId === fresh[0].id)
            .every((c) => c.until),
        );
        assert(
          current.cycles
            .filter((c) => c.itemId === fresh[1].id)
            .every((c) => !c.until),
        );
        assert.equal(
          directory.groups.find((g) => g.id === b.id)!.members.length,
          0,
        );
        assert.equal(
          await db.metaInventoryItem.count({
            where: { id: { in: fresh.map((i) => i.id) } },
          }),
          3,
        );
        const empty = await inventoryTrialReport(actor, {
          listId: list.id,
          groupId: b.id,
        });
        assert.equal(empty.rows.length, 0);
        await changeInventoryTrial(actor, {
          action: "REMOVE_MEMBERS",
          listId: list.id,
          groups: [
            {
              groupId: a.id,
              revision: current.revision,
              itemIds: [fresh[1].id],
            },
          ],
        });
      },
    );
    await t.test(
      "Archivar conserva el registro y retira el grupo de la vista activa",
      async () => {
        const current = (
          await inventoryTrials(actor, { listId: list.id })
        ).groups.find((g) => g.id === group.id)!;
        await saveInventoryTrial(actor, {
          action: "ARCHIVE",
          listId: list.id,
          groupId: group.id,
          revision: current.revision,
        });
        assert(
          !(await inventoryTrials(actor, { listId: list.id })).groups.some(
            (g) => g.id === group.id,
          ),
        );
        assert(
          await db.metaInventoryTrialGroup.findUnique({
            where: { id: group.id },
          }),
        );
        await fail(
          inventoryTrialReport(actor, { listId: list.id, groupId: group.id }),
          404,
        );
      },
    );
  } finally {
    await db.metaInventoryTrialGroup.deleteMany({
      where: { sheetId: { in: [list.id, foreign.id] } },
    });
    await db.effectivenessGrant.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.metaEffectivenessLink.deleteMany({ where: { tableId: copy.id } });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: list.id } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: [table.id, copy.id] } },
    });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: [list.id, foreign.id] } },
    });
    await db.metaInventoryCategory.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [list.id, foreign.id] } },
    });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: users.map((u) => u.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
});
