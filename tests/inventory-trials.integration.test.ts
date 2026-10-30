import test from "node:test";
import { Prisma } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryTrials,
  saveInventoryTrial,
  inventoryTrialReport,
} from "../lib/meta-ads/inventory-trials";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import {
  diverseTrialItems,
  trialAssessment,
  trialDays,
} from "../lib/meta-ads/inventory-trial-policy";
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
          b = { ...base, name: "Idempotente", requestId, reserve: true };
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
        await saveInventoryTrial(editActor, { ...base, name: "Editor" });
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
        await fail(saveInventoryTrial(readActor, base), 403);
        await db.effectivenessGrant.deleteMany({
          where: { userId: editor.id },
        });
        await fail(saveInventoryTrial(editActor, base), 403);
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
