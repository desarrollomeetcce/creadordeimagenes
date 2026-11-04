import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  previewInventoryCountryCorrection as preview,
  correctInventoryCountries as correct,
} from "../lib/meta-ads/inventory-country-correction";
import { inventoryActivationDirectory } from "../lib/meta-ads/inventory-sheet-activation";
import { metaCampaignSalesData } from "../lib/meta-ads/effectiveness";
import { inventorySheetCountryLabel } from "../lib/meta-ads/inventory-sheet-column-policy";

test("Corrección de asociaciones conserva identidades, datos y permisos sin Graph", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = "country-correction-" + randomUUID(),
    uid = tag + "-owner",
    other = tag + "-other",
    listId = tag + "-list",
    actor = { id: uid, role: "OWNER" },
    countryCodes = ["AR", "PE", "EC", "AO", "GT"],
    tables = countryCodes.map((country) => ({
      id: tag + "-" + country,
      name: "QA " + tag + " " + country,
      defaultCountry: country,
      defaultCurrency: "PEN",
    })),
    cid = tag + "-connection",
    aid = Date.now() + "83",
    objectId = aid + "11",
    originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("No providers allowed");
  };
  const input = (aliasId: string, country = "PE") => ({
    listId,
    items: [{ aliasId, country }],
  });
  const alias = (suffix: string, table = 0, name = "QA " + suffix) =>
    db.metaAlias.create({
      data: {
        name: tag + name,
        tableId: tables[table].id,
        inventorySheetId: listId,
      },
    });
  try {
    await db.user.createMany({
      data: [uid, other].map((id, i) => ({
        id,
        name: tag,
        email: id + "@example.test",
        passwordHash: "synthetic",
        role: i ? "USER" : "OWNER",
        status: "APPROVED",
      })),
    });
    await db.metaAliasTable.createMany({ data: tables });
    await db.metaEffectivenessSheet.create({
      data: {
        id: listId,
        name: tag,
        kind: "INVENTORY",
        config: {
          inventoryActivation: {
            sheets: tables.map((t) => t.id),
            renamedTableCountries: Object.fromEntries(
              tables.map((t, i) => [t.id, countryCodes[i]]),
            ),
          },
        },
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
        enabled: false,
        currency: "PEN",
        timezone: "America/Lima",
      },
    });
    const src = await alias("move"),
      destination = await alias("move", 1),
      srcRow = await db.metaEffectivenessRow.create({
        data: {
          aliasId: src.id,
          country: "PE",
          currency: "PEN",
          days: {
            create: [
              {
                day: "2026-10-30",
                sales: 3,
                salesOverridden: true,
                fixedCost: 2,
                annotations: { note: "original" },
              },
            ],
          },
        },
      });
    const stay = await db.metaEffectivenessRow.create({
      data: {
        aliasId: src.id,
        country: "AR",
        currency: "PEN",
        days: { create: [{ day: "2026-10-30", sales: 9 }] },
      },
    });
    await db.metaEffectivenessRow.create({
      data: { aliasId: destination.id, country: "PE", currency: "PEN" },
    });
    await db.metaAdvisorSalesApproval.create({
      data: {
        rowId: srcRow.id,
        day: "2026-10-30",
        salesTotal: 3,
        allocations: [],
        basis: { original: true },
        actorId: uid,
      },
    });
    const state = await db.metaEffectivenessState.create({
      data: {
        aliasId: src.id,
        country: "PE",
        active: false,
        events: {
          create: { active: false, actorId: uid, snapshot: { original: true } },
        },
      },
      include: { events: true },
    });
    await db.metaEffectivenessState.create({
      data: { aliasId: destination.id, country: "PE", active: false },
    });
    await db.metaAdObject.create({
      data: {
        id: objectId,
        accountId: aid,
        level: "campaign",
        name: tag,
        aliasId: src.id,
        aliasCountry: "PE",
        status: "PAUSED",
        effectiveStatus: "PAUSED",
      },
    });
    await db.metaAdDaily.create({
      data: {
        objectId,
        accountId: aid,
        day: "2026-10-30",
        scope: "7d_click,1d_view|impression",
        spend: 14.45,
        impressions: 50,
      },
    });
    await db.metaEffectivenessTotalDay.create({
      data: {
        tableId: tables[0].id,
        country: "PE",
        currency: "PEN",
        day: "2026-10-30",
        values: { sales: 44 },
      },
    });
    const dayBefore = await db.metaEffectivenessDay.findMany({
        where: { rowId: srcRow.id },
      }),
      factsBefore = await db.metaAdDaily.findMany({ where: { objectId } });
    let token = "";
    await t.test(
      "Vista previa no escribe y usa país físico, no el nombre",
      async () => {
        const before = await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: listId },
        });
        const p = await preview(actor, input(src.id));
        token = p.token;
        assert(p.items[0].ready);
        assert.equal(p.items[0].targetTable, tables[1].name);
        assert.deepEqual(
          await db.metaEffectivenessSheet.findUniqueOrThrow({
            where: { id: listId },
          }),
          before,
        );
        assert.equal(
          (
            await db.metaEffectivenessRow.findUniqueOrThrow({
              where: { id: srcRow.id },
            })
          ).aliasId,
          src.id,
        );
        assert.equal((await preview(actor, input(src.id))).token, token);
      },
    );
    await t.test(
      "Traslado conserva filas, V, aprobaciones, eventos y gasto Meta sin tocar otro país",
      async () => {
        const result = await correct(actor, { ...input(src.id), token });
        assert.equal(result.corrected?.length, 1);
        assert.equal(
          (
            await db.metaEffectivenessRow.findUniqueOrThrow({
              where: { id: srcRow.id },
            })
          ).aliasId,
          destination.id,
        );
        assert.equal(
          (
            await db.metaEffectivenessRow.findUniqueOrThrow({
              where: { id: stay.id },
            })
          ).aliasId,
          src.id,
        );
        assert.deepEqual(
          await db.metaEffectivenessDay.findMany({
            where: { rowId: srcRow.id },
          }),
          dayBefore,
        );
        assert.equal(
          (
            await db.metaAdvisorSalesApproval.findUniqueOrThrow({
              where: { rowId_day: { rowId: srcRow.id, day: "2026-10-30" } },
            })
          ).salesTotal,
          3,
        );
        assert.equal(
          (
            await db.metaEffectivenessState.findUniqueOrThrow({
              where: { id: state.id },
            })
          ).aliasId,
          destination.id,
        );
        assert.equal(
          (
            await db.metaEffectivenessState.findUniqueOrThrow({
              where: { id: state.id },
            })
          ).active,
          false,
        );
        assert.deepEqual(
          await db.metaEffectivenessEvent.findMany({
            where: { stateId: state.id },
          }),
          state.events,
        );
        const obj = await db.metaAdObject.findUniqueOrThrow({
          where: { id: objectId },
        });
        assert.equal(obj.aliasId, destination.id);
        assert.equal(obj.status, "PAUSED");
        assert.deepEqual(
          await db.metaAdDaily.findMany({ where: { objectId } }),
          factsBefore,
        );
        assert.deepEqual(
          (
            await db.metaEffectivenessTotalDay.findFirstOrThrow({
              where: { tableId: tables[0].id, country: "PE" },
            })
          ).values,
          { sales: 44 },
        );
        const sales = await metaCampaignSalesData(
          actor,
          [objectId],
          "2026-10-30",
          "2026-10-30",
        );
        assert.equal(
          sales.entries.get(JSON.stringify([destination.id, "PE"]))?.[0].sales,
          3,
        );
        const directory = await inventoryActivationDirectory(actor, { listId });
        assert(
          !directory.countryIssues?.some(
            (i) => i.aliasId === src.id && i.country === "PE",
          ),
        );
      },
    );
    await t.test(
      "Reintento recupera recibo sin duplicar ni incrementar revisión",
      async () => {
        const rev = (
          await db.metaEffectivenessSheet.findUniqueOrThrow({
            where: { id: listId },
          })
        ).revision;
        await correct(actor, { ...input(src.id), token });
        assert.equal(
          (
            await db.metaEffectivenessSheet.findUniqueOrThrow({
              where: { id: listId },
            })
          ).revision,
          rev,
        );
        assert.equal(
          await db.auditEvent.count({
            where: {
              resourceId: listId,
              action: "META_INVENTORY_COUNTRY_CORRECTED",
            },
          }),
          1,
        );
      },
    );
    await t.test(
      "Asociaciones sin días ni Meta no prueban el país y no se trasladan",
      async () => {
        const a = await alias("empty-country");
        const row = await db.metaEffectivenessRow.create({
          data: { aliasId: a.id, country: "PE", currency: "PEN" },
        });
        const p = await preview(actor, input(a.id));
        assert(!p.items[0].ready);
        assert.match(p.items[0].reason, /país guardado no está confirmado/);
        assert.equal(p.items[0].origins[0].id, row.id);
        assert.equal(p.items[0].origins[0].country, "PE");
        const directory = await inventoryActivationDirectory(actor, { listId });
        assert.equal(
          directory.countryIssues?.find(
            (i) => i.aliasId === a.id && i.country === "PE",
          )?.origins[0].id,
          row.id,
        );
        await assert.rejects(
          correct(actor, { ...input(a.id), token: p.token }),
        );
        assert.equal(
          (
            await db.metaEffectivenessRow.findUniqueOrThrow({
              where: { id: row.id },
            })
          ).aliasId,
          a.id,
        );
      },
    );
    await t.test(
      "Conflicto material preserva ambos históricos y bloquea traslado",
      async () => {
        const a = await alias("conflict"),
          b = await alias("conflict", 1);
        for (const [aliasId, sales] of [
          [a.id, 4],
          [b.id, 8],
        ] as const)
          await db.metaEffectivenessRow.create({
            data: {
              aliasId,
              country: "PE",
              currency: "PEN",
              days: { create: { day: "2026-10-31", sales } },
            },
          });
        const p = await preview(actor, input(a.id));
        assert(!p.items[0].ready);
        assert.match(p.items[0].reason, /conciliación/);
        await assert.rejects(
          correct(actor, { ...input(a.id), token: p.token }),
        );
        assert.deepEqual(
          (
            await db.metaEffectivenessDay.findMany({
              where: { row: { aliasId: { in: [a.id, b.id] } } },
              orderBy: { sales: "asc" },
            })
          ).map((x) => x.sales),
          [4, 8],
        );
      },
    );
    await t.test(
      "Cambios posteriores a vista previa se rechazan con CAS",
      async () => {
        const a = await alias("stale"),
          r = await db.metaEffectivenessRow.create({
            data: {
              aliasId: a.id,
              country: "EC",
              currency: "PEN",
              days: { create: { day: "2026-10-31", sales: 2 } },
            },
          });
        const p = await preview(actor, input(a.id, "EC"));
        assert(p.items[0].ready);
        await db.metaEffectivenessDay.update({
          where: { rowId_day: { rowId: r.id, day: "2026-10-31" } },
          data: { sales: 5, revision: { increment: 1 } },
        });
        await assert.rejects(
          correct(actor, { ...input(a.id, "EC"), token: p.token }),
          /cambiaron/,
        );
        assert.equal(
          (
            await db.metaEffectivenessRow.findUniqueOrThrow({
              where: { id: r.id },
            })
          ).aliasId,
          a.id,
        );
      },
    );
    await t.test(
      "País guardado sin hoja verificada queda en revisión sin crear destinos",
      async () => {
        const a = await alias("new-country");
        const row = await db.metaEffectivenessRow.create({
          data: {
            aliasId: a.id,
            country: "AX",
            currency: "PEN",
            days: {
              create: { day: "2026-10-31", sales: 7, salesOverridden: true },
            },
          },
        });
        const p = await preview(actor, input(a.id, "AX"));
        assert(!p.items[0].ready);
        assert.match(p.items[0].reason, /No existe una hoja verificada/);
        await assert.rejects(
          correct(actor, { ...input(a.id, "AX"), token: p.token }),
        );
        assert.equal(
          (
            await db.metaEffectivenessRow.findUniqueOrThrow({
              where: { id: row.id },
            })
          ).aliasId,
          a.id,
        );
      },
    );
    await t.test(
      "Permisos actuales y pertenencia a inventario se validan",
      async () => {
        await assert.rejects(
          preview({ id: other, role: "OWNER" }, input(src.id)),
          /propietario|permiso de Efectividad/,
        );
        await assert.rejects(
          preview(actor, { ...input(src.id), listId: "other-" + listId }),
        );
        await assert.rejects(
          preview(actor, {
            listId,
            items: [...input(src.id).items, ...input(src.id).items],
          }),
          /repetidas/,
        );
      },
    );
    await t.test(
      "Selección mixta traslada solo casos compatibles y no reactiva",
      async () => {
        const a = await alias("batch"),
          r = await db.metaEffectivenessRow.create({
            data: {
              aliasId: a.id,
              country: "EC",
              currency: "PEN",
              hidden: true,
              days: { create: { day: "2026-10-31", sales: 6 } },
            },
          });
        await db.metaEffectivenessState.create({
          data: { aliasId: a.id, country: "EC", active: false },
        });
        const p = await preview(actor, {
          listId,
          items: [...input(a.id, "EC").items, ...input(src.id).items],
        });
        assert.equal(p.items.filter((i) => i.ready).length, 1);
        const result = await correct(actor, {
          listId,
          items: [...input(a.id, "EC").items, ...input(src.id).items],
          token: p.token,
        });
        assert.equal(result.corrected?.length, 1);
        assert.equal(result.blocked?.length, 1);
        const moved = await db.metaEffectivenessRow.findUniqueOrThrow({
          where: { id: r.id },
          include: { alias: true },
        });
        assert(moved.hidden);
        assert.equal(moved.alias.tableId, tables[2].id);
        assert.equal(
          (
            await db.metaEffectivenessState.findFirstOrThrow({
              where: { aliasId: moved.aliasId, country: "EC" },
            })
          ).active,
          false,
        );
      },
    );
    await t.test(
      "Etiquetas únicas de país sin tildes/case y sin ocultar hojas genéricas",
      () => {
        for (const [name, country] of [
          ["PERU", "PE"],
          ["Perú", "PE"],
          ["MEXICO", "MX"],
          ["BOLIVIA", "BO"],
          ["Bolivia", "BO"],
        ])
          assert.equal(inventorySheetCountryLabel({ name }, country), name);
        assert.equal(
          inventorySheetCountryLabel({ name: "BOLVIA" }, "BO"),
          "BOLIVIA",
        );
        assert.equal(
          inventorySheetCountryLabel({ name: "Lista comercial" }, "PE"),
          "Lista comercial · Perú",
        );
        assert.equal(
          inventorySheetCountryLabel({ name: "ECUADOR" }, "GT"),
          "ECUADOR · Guatemala",
        );
        assert.equal(calls, 0);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    const aliases = await db.metaAlias.findMany({
        where: { inventorySheetId: listId },
        select: { id: true },
      }),
      ids = aliases.map((a) => a.id);
    await db.metaAdAccount.deleteMany({ where: { id: aid } });
    await db.metaConnection.deleteMany({ where: { id: cid } });
    await db.metaEffectivenessRow.deleteMany({
      where: { aliasId: { in: ids } },
    });
    await db.metaAlias.deleteMany({ where: { id: { in: ids } } });
    await db.metaEffectivenessTotalDay.deleteMany({
      where: { tableId: { in: tables.map((t) => t.id) } },
    });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((t) => t.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({ where: { id: listId } });
    await db.auditEvent.deleteMany({ where: { resourceId: listId } });
    await db.user.deleteMany({ where: { id: { in: [uid, other] } } });
    await db.$disconnect();
  }
});
