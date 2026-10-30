import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAliasTable } from "../lib/meta-ads/aliases";
import { db } from "../lib/db";
import {
  inventoryActivationDirectory,
  inventoryActivationAddSheet,
  inventoryActivationChange,
  inventoryActivationReplace,
  inventoryActivationReport,
  saveInventoryFactorLimits,
  financialCatalogStatus,
} from "../lib/meta-ads/inventory-sheet-activation";
import {
  effectiveness,
  inventoryEffectivenessSource,
  importEffectiveness,
} from "../lib/meta-ads/effectiveness";
import { setEffectivenessState } from "../lib/meta-ads/effectiveness-controls";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
import { updateWorkbookSheet } from "../lib/meta-ads/workbook-sheets";
test("Activación por hoja: selección, pin, historial y permisos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID(),
    today = limaDay(),
    yesterday = new Date(Date.parse(today) - 86400000)
      .toISOString()
      .slice(0, 10),
    actor = await db.user.create({
      data: {
        name: "QA hojas",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    viewer = await db.user.create({
      data: {
        name: "QA visor hojas",
        email: "view-" + tag + "@example.test",
        passwordHash: "synthetic",
        role: "OBSERVER",
        status: "APPROVED",
      },
    }),
    owner = { id: actor.id, role: "OWNER" },
    list = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "QA " + tag },
    }),
    other = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "Otro " + tag },
    });
  const names = ["A", "B", "C"].map((n) => n + " " + tag);
  let pe: any, ec: any;
  const autoTables: string[] = [];
  const report = () =>
    inventoryActivationReport(owner, { listId: list.id, tableIds: pe.id });
  const change = async (
    name: string,
    data: { active?: boolean; pinned?: boolean },
  ) => {
    const r = (await report()).rows.find((r) => r.name === name);
    return inventoryActivationChange(owner, {
      listId: list.id,
      tableId: pe.id,
      items: [{ name, targets: r?.targets ?? [] }],
      ...data,
    });
  };
  try {
    await db.metaInventoryItem.createMany({
      data: names.map((name) => ({ sheetId: list.id, name })),
    });
    await db.effectivenessGrant.create({
      data: {
        userId: viewer.id,
        scope: "TAB:" + list.id,
        permission: "VIEW",
        grantedById: actor.id,
      },
    });
    await t.test(
      "Tabla inmediata elige nombres automáticos únicos incluso en paralelo",
      async () => {
        const created = await Promise.all([
          createAliasTable(owner),
          createAliasTable(owner),
        ]);
        autoTables.push(...created.map((t) => t.id));
        assert(created.every((t) => /^Hoja [1-9][0-9]*$/.test(t.name)));
        assert.equal(new Set(created.map((t) => t.name)).size, 2);
      },
    );
    await t.test(
      "Crear y elegir hojas reales no duplica el catálogo ni inventa estados",
      async () => {
        pe = await inventoryActivationAddSheet(owner, {
          listId: list.id,
          name: "Perú " + tag,
          country: "PE",
        });
        ec = await inventoryActivationAddSheet(owner, {
          listId: list.id,
          name: "Ecuador " + tag,
          country: "EC",
        });
        const d = await inventoryActivationDirectory(owner, {
          listId: list.id,
        });
        assert(d.selected.includes(pe.id) && d.selected.includes(ec.id));
        assert.equal((await report()).rows.length, 0);
        assert.equal(
          await db.metaAlias.count({ where: { inventorySheetId: list.id } }),
          0,
        );
      },
    );
    await t.test(
      "Activación masiva solo crea y activa los elegidos; hoja sincronizada",
      async () => {
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: pe.id,
          items: names.slice(0, 2).map((name) => ({ name, targets: [] })),
          active: true,
        });
        const r = await report();
        assert.equal(r.rows.length, 2);
        assert(r.rows.every((r) => r.activation === "ACTIVE"));
        assert(!r.rows.some((r) => r.name === names[2]));
        assert.equal(
          (await effectiveness(owner, pe.id, today, today)).rows.length,
          2,
        );
        assert.equal(
          await db.metaAlias.count({ where: { tableId: ec.id } }),
          0,
        );
      },
    );
    await t.test(
      "Desactivar y fijar se guarda atómicamente y mantiene visible la fila",
      async () => {
        const row = (await report()).rows.find((r) => r.name === names[0])!;
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: pe.id,
          items: [{ name: names[0], targets: row.targets }],
          active: false,
          pinned: true,
        });
        const current = (await report()).rows.find((r) => r.name === names[0])!;
        assert.equal(current.activation, "INACTIVE");
        assert.equal(current.pinned, true);
        assert(
          (await effectiveness(owner, pe.id, today, today)).rows.some(
            (r) => r.aliasId === current.targets[0].aliasId && !r.active,
          ),
        );
        await change(names[0], { active: true });
        await change(names[0], { pinned: false });
      },
    );
    await t.test(
      "Revisión caducada o selección ajena revierte todo el lote",
      async () => {
        const before = await report(),
          a = before.rows.find((r) => r.name === names[0])!;
        await change(names[0], { pinned: true });
        await assert.rejects(
          () =>
            inventoryActivationChange(owner, {
              listId: list.id,
              tableId: pe.id,
              active: false,
              items: [
                {
                  name: names[1],
                  targets: before.rows.find((r) => r.name === names[1])!
                    .targets,
                },
                { name: names[0], targets: a.targets },
              ],
            }),
          /cambió/i,
        );
        assert((await report()).rows.every((r) => r.activation === "ACTIVE"));
        await assert.rejects(
          () =>
            inventoryActivationChange(owner, {
              listId: list.id,
              tableId: pe.id,
              active: false,
              items: [{ name: "Ajeno", targets: [] }],
            }),
          /cambió/i,
        );
      },
    );
    await t.test(
      "Pin conserva apagado en la hoja; desfijar oculta sin borrar registros; reactivar recupera",
      async () => {
        await change(names[0], { active: false });
        const pinned = (await report()).rows.find((r) => r.name === names[0])!;
        assert(
          (await effectiveness(owner, pe.id, today, today)).rows.some(
            (r) => r.aliasId === pinned.targets[0].aliasId,
          ),
        );
        await change(names[0], { pinned: false });
        const a = (await report()).rows.find((r) => r.name === names[0])!;
        assert(
          !(await effectiveness(owner, pe.id, today, today)).rows.some(
            (r) => r.aliasId === a.targets[0].aliasId,
          ),
        );
        assert.equal(a.activation, "INACTIVE");
        await change(names[0], { active: true });
        assert(
          (await effectiveness(owner, pe.id, today, today)).rows.some(
            (r) => r.aliasId === a.targets[0].aliasId,
          ),
        );
      },
    );
    await t.test(
      "Historial usa fechas reales, P acumulado y ventas; pin no divide períodos",
      async () => {
        const a = (await report()).rows.find((r) => r.name === names[0])!,
          target = a.targets[0],
          state = await db.metaEffectivenessState.findUniqueOrThrow({
            where: {
              aliasId_country: { aliasId: target.aliasId, country: "PE" },
            },
          });
        await db.metaEffectivenessEvent.deleteMany({
          where: { stateId: state.id },
        });
        await db.metaEffectivenessEvent.create({
          data: {
            stateId: state.id,
            actorId: actor.id,
            active: true,
            createdAt: new Date(yesterday + "T05:00:00Z"),
            snapshot: { priorActive: false },
          },
        });
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId: target.aliasId, country: "PE", legacy: false },
        });
        await db.metaEffectivenessDay.createMany({
          data: [yesterday, today].map((day, i) => ({
            rowId: row.id,
            day,
            sales: 0,
            salesOverridden: true,
            annotations: { budget: { value: i ? 20 : 10, currency: "PEN" } },
          })),
        });
        let r = (await report()).rows.find((r) => r.name === names[0])!;
        assert.equal(r.budget, 30);
        assert.equal(r.sales, 0);
        assert.equal(r.usage, "USED");
        assert(r.activationHours !== null && r.activationHours >= 12);
        assert.equal(r.assessment.usage, 1.2);
        assert.equal(r.assessment.status, "CRITICAL");
        await change(names[0], { pinned: true });
        const history = await inventoryActivationReport(owner, {
          listId: list.id,
          tableIds: pe.id,
          historyName: names[0],
        });
        assert.equal(history.rows[0].history!.length, 1);
        assert.equal(history.rows[0].history![0].days, 2);
        assert.equal(history.rows[0].history![0].until, null);
      },
    );
    await t.test(
      "Desactivar desde la hoja respeta pin y conserva días financieros",
      async () => {
        const a = (await report()).rows.find((r) => r.name === names[0])!,
          target = a.targets[0];
        await setEffectivenessState(owner, {
          tableId: pe.id,
          aliasId: target.aliasId,
          country: "PE",
          active: false,
          revision: target.revision,
          since: today,
          until: today,
          metrics: ["sales", "budget"],
        });
        assert(
          (await effectiveness(owner, pe.id, today, today)).rows.some(
            (r) => r.aliasId === target.aliasId && !r.active,
          ),
        );
        assert.equal(
          (await report()).rows.find((r) => r.name === names[0])!.budget,
          30,
        );
        assert.equal(
          await db.metaEffectivenessDay.count({
            where: { row: { aliasId: target.aliasId } },
          }),
          2,
        );
      },
    );
    await t.test(
      "Fuente histórica no fabrica 366 días N.A.; conserva datos reales y ausencias",
      async () => {
        const floor = new Date(Date.parse(today) - 365 * 86400000)
          .toISOString()
          .slice(0, 10);
        const source = await db.$transaction((tx) =>
          inventoryEffectivenessSource(owner, pe.id, floor, today, tx),
        );
        const a = source.rows.find(
          (r) =>
            r.aliasId ===
            source.table.aliases.find((a) => a.name === names[0])?.id,
        )!;
        assert.equal(Object.keys(a.days).length, 2);
        assert.equal(a.days[yesterday].sales, 0);
        const b = source.rows.find(
          (r) =>
            r.aliasId ===
            source.table.aliases.find((a) => a.name === names[1])?.id,
        )!;
        assert.equal(Object.keys(b.days).length, 0);
      },
    );
    await t.test(
      "Visor autorizado consulta agregados e historial; no cambia estados ni otras listas",
      async () => {
        const v = { id: viewer.id, role: "OBSERVER" },
          cap = await authorizeFinancialRequest(
            v,
            "inventory/sheet-activation/report",
            "GET",
            new URLSearchParams({
              listId: list.id,
              tableIds: pe.id + "," + ec.id,
            }),
            null,
            "TAB:" + list.id,
          );
        const r = await inventoryActivationReport(cap, {
          listId: list.id,
          tableIds: pe.id + "," + ec.id,
        });
        assert.equal(r.canEdit, false);
        assert.equal(r.rows.length, 2);
        await assert.rejects(
          () =>
            inventoryActivationChange(cap, {
              listId: list.id,
              tableId: pe.id,
              items: [{ name: names[0], targets: r.rows[0].targets }],
              active: true,
            }),
          /permiso/i,
        );
        await assert.rejects(
          () => inventoryActivationDirectory(cap, { listId: other.id }),
          /documento/i,
        );
        await assert.rejects(
          () =>
            inventoryActivationReport(cap, {
              listId: list.id,
              tableIds: "missing",
            }),
          /pertenece/i,
        );
      },
    );
    await t.test(
      "Límites personalizados cambian FX/estado e historial y sobreviven a cambios de pin",
      async () => {
        const before = await inventoryActivationDirectory(owner, {
          listId: list.id,
        });
        assert.equal(before.limits[0], 25);
        assert.equal(before.limits[2], 100);
        const limits = [...before.limits];
        limits[0] = 60;
        limits[1] = 70;
        limits[2] = 90;
        await saveInventoryFactorLimits(owner, {
          listId: list.id,
          revision: before.revision,
          limits,
        });
        let r = (await report()).rows.find((r) => r.name === names[0])!;
        assert.equal(r.assessment.limit, 60);
        assert.equal(r.assessment.usage, 0.5);
        assert.equal(r.assessment.status, "TESTING");
        await change(names[1], { pinned: true });
        assert.deepEqual(
          (await inventoryActivationDirectory(owner, { listId: list.id }))
            .limits,
          limits,
        );
        const aliasId = r.targets[0].aliasId;
        await db.metaEffectivenessDay.updateMany({
          where: { row: { aliasId }, day: today },
          data: { sales: 2 },
        });
        r = (await report()).rows.find((r) => r.name === names[0])!;
        assert.equal(r.assessment.limit, 90);
        assert.equal(r.assessment.usage, 30 / 90);
        assert.equal(r.assessment.status, "WITHIN");
        const history = await inventoryActivationReport(owner, {
          listId: list.id,
          tableIds: pe.id,
          historyName: names[0],
        });
        assert.equal(history.rows[0].history![0].assessment.limit, 90);
      },
    );
    await t.test(
      "Límites rechazan revisión caducada, importes inválidos y escritura de visor",
      async () => {
        const before = await inventoryActivationDirectory(owner, {
          listId: list.id,
        });
        await assert.rejects(
          () =>
            saveInventoryFactorLimits(owner, {
              listId: list.id,
              revision: before.revision - 1,
              limits: [1],
            }),
          /cambió/i,
        );
        for (const limits of [[], [0], [-2], [Infinity]])
          await assert.rejects(() =>
            saveInventoryFactorLimits(owner, {
              listId: list.id,
              revision: before.revision,
              limits,
            }),
          );
        const cap = await authorizeFinancialRequest(
          { id: viewer.id, role: "OBSERVER" },
          "inventory/sheet-activation/directory",
          "GET",
          new URLSearchParams({ listId: list.id }),
          null,
          "TAB:" + list.id,
        );
        await assert.rejects(
          () =>
            saveInventoryFactorLimits(cap, {
              listId: list.id,
              revision: before.revision,
              limits: [1],
            }),
          /permiso/i,
        );
        assert.deepEqual(
          await inventoryActivationDirectory(owner, { listId: list.id }),
          before,
        );
      },
    );
    await t.test(
      "Agregar varios desde el catálogo conserva existentes, estados, ventas y categorías",
      async () => {
        const extra = await db.metaInventoryItem.create({
          data: { sheetId: list.id, name: "Extra " + tag },
        });
        const category = await db.metaInventoryCategory.create({
          data: {
            sheetId: list.id,
            name: "Añadir " + tag,
            key: "add-" + tag,
            kind: "PRIMARY",
          },
        });
        await db.metaInventoryItemCategory.create({
          data: { itemId: extra.id, categoryId: category.id },
        });
        const existing = (await report()).rows.find(
          (r) => r.name === names[1],
        )!;
        const beforeDays = await db.metaEffectivenessDay.findMany({
          where: { row: { alias: { inventorySheetId: list.id } } },
          orderBy: [{ rowId: "asc" }, { day: "asc" }],
        });
        const rows = [names[1], names[2], extra.name].map((name) => ({
          name,
          country: "PE",
          currency: "PEN",
        }));
        const revision = (
          await db.metaEffectivenessSheet.findUniqueOrThrow({
            where: { id: list.id },
          })
        ).categoryRevision;
        await importEffectiveness(
          owner,
          pe.id,
          rows,
          undefined,
          undefined,
          list.id,
          undefined,
          false,
          (
            await db.metaEffectivenessSheet.findUniqueOrThrow({
              where: { id: list.id },
            })
          ).categoryRevision,
          true,
        );
        const assigned = await db.metaAlias.findMany({
          where: { tableId: pe.id, inventorySheetId: list.id },
        });
        assert.equal(assigned.length, 4);
        assert.equal(
          (await report()).rows.find((r) => r.name === names[1])!.activation,
          existing.activation,
        );
        const added = assigned.find((a) => a.name === extra.name)!;
        assert(
          await db.metaInventoryCategoryAssignment.findUnique({
            where: {
              aliasId_categoryId: {
                aliasId: added.id,
                categoryId: category.id,
              },
            },
          }),
        );
        assert.equal(
          (await report()).rows.find((r) => r.name === extra.name)!.activation,
          "INACTIVE",
        );
        await importEffectiveness(
          owner,
          pe.id,
          rows,
          undefined,
          undefined,
          list.id,
          undefined,
          false,
          (
            await db.metaEffectivenessSheet.findUniqueOrThrow({
              where: { id: list.id },
            })
          ).categoryRevision,
          true,
        );
        await assert.rejects(
          () =>
            importEffectiveness(
              owner,
              pe.id,
              rows,
              undefined,
              undefined,
              list.id,
              undefined,
              false,
              revision,
              true,
            ),
          /cambió/i,
        );
        const freshRevision = (
          await db.metaEffectivenessSheet.findUniqueOrThrow({
            where: { id: list.id },
          })
        ).categoryRevision;
        await assert.rejects(
          () =>
            importEffectiveness(
              owner,
              pe.id,
              [{ name: "No existe " + tag, country: "PE", currency: "PEN" }],
              undefined,
              undefined,
              list.id,
              undefined,
              false,
              freshRevision,
              true,
            ),
          /no pertenece/i,
        );
        assert.equal(
          await db.metaAlias.count({
            where: { tableId: pe.id, inventorySheetId: list.id },
          }),
          4,
        );
        assert.equal(
          await db.metaInventoryItem.count({ where: { sheetId: list.id } }),
          4,
        );
        assert.deepEqual(
          await db.metaEffectivenessDay.findMany({
            where: { row: { alias: { inventorySheetId: list.id } } },
            orderBy: [{ rowId: "asc" }, { day: "asc" }],
          }),
          beforeDays,
        );
      },
    );
    await t.test(
      "Pendientes de campaña por hoja se guardan sin confundir activación ni dividir ciclos",
      async () => {
        let row = (await report()).rows.find((r) => r.name === names[0])!;
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: pe.id,
          items: [{ name: names[0], targets: row.targets }],
          campaignTask: "CREATE",
        });
        row = (await report()).rows.find((r) => r.name === names[0])!;
        assert.equal(row.activation, "ACTIVE");
        assert.equal(row.campaignTask, "CREATE");
        assert.deepEqual(row.campaignTasks, ["CREATE"]);
        const periods = (
          await inventoryActivationReport(owner, {
            listId: list.id,
            tableIds: pe.id,
            historyName: names[0],
          })
        ).rows[0].history!.length;
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: pe.id,
          items: [{ name: names[0], targets: row.targets }],
          campaignTask: "STOP",
        });
        row = (await report()).rows.find((r) => r.name === names[0])!;
        assert.equal(row.activation, "ACTIVE");
        assert.equal(row.campaignTask, "STOP");
        await change(names[0], { pinned: true });
        assert.equal(
          (await report()).rows.find((r) => r.name === names[0])!.campaignTask,
          "STOP",
        );
        assert.equal(
          (
            await inventoryActivationReport(owner, {
              listId: list.id,
              tableIds: pe.id,
              historyName: names[0],
            })
          ).rows[0].history!.length,
          periods,
        );
        assert.equal(
          (
            await inventoryActivationReport(owner, {
              listId: list.id,
              tableIds: ec.id,
            })
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "Completar campaña borra pendiente y desactivar conserva pin; conflictos no escriben",
      async () => {
        let row = (await report()).rows.find((r) => r.name === names[0])!;
        await assert.rejects(() =>
          inventoryActivationChange(owner, {
            listId: list.id,
            tableId: pe.id,
            items: [{ name: names[0], targets: row.targets }],
            active: false,
            campaignTask: "CREATE",
          }),
        );
        assert.equal(
          (await report()).rows.find((r) => r.name === names[0])!.campaignTask,
          "STOP",
        );
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: pe.id,
          items: [{ name: names[0], targets: row.targets }],
          active: false,
        });
        row = (await report()).rows.find((r) => r.name === names[0])!;
        assert.equal(row.activation, "INACTIVE");
        assert.equal(row.campaignTask, "NONE");
        assert.equal(row.pinned, true);
        await assert.rejects(() =>
          inventoryActivationChange(owner, {
            listId: list.id,
            tableId: pe.id,
            items: [{ name: names[0], targets: row.targets }],
            campaignTask: "INVALID",
          }),
        );
        const cap = await authorizeFinancialRequest(
          { id: viewer.id, role: "OBSERVER" },
          "inventory/sheet-activation/report",
          "GET",
          new URLSearchParams({ listId: list.id, tableIds: pe.id }),
          null,
          "TAB:" + list.id,
        );
        await assert.rejects(
          () =>
            inventoryActivationChange(cap, {
              listId: list.id,
              tableId: pe.id,
              items: [{ name: names[0], targets: row.targets }],
              campaignTask: "STOP",
            }),
          /permiso/i,
        );
      },
    );
    await t.test(
      "Estado financiero respeta hoja, país y revocación de acceso",
      async () => {
        const result = await financialCatalogStatus(owner, { tableId: pe.id });
        assert(result.rows.length > 0);
        const aliasIds = await db.metaAlias.findMany({
          where: { tableId: pe.id },
          select: { id: true },
        });
        assert(
          result.rows.every((r) => aliasIds.some((a) => a.id === r.aliasId)),
        );
        assert(
          result.rows.every(
            (r) =>
              Object.keys(r).sort().join(",") === "aliasId,assessment,country",
          ),
        );
        await db.effectivenessGrant.create({
          data: {
            userId: viewer.id,
            scope: "TABLE:" + pe.id,
            permission: "VIEW",
            grantedById: actor.id,
          },
        });
        const cap = await authorizeFinancialRequest(
          { id: viewer.id, role: "OBSERVER" },
          "effectiveness/catalog-status",
          "GET",
          new URLSearchParams({ tableId: pe.id }),
          null,
          "TABLE:" + pe.id,
        );
        assert.deepEqual(
          await financialCatalogStatus(cap, { tableId: pe.id }),
          result,
        );
        await assert.rejects(
          () => financialCatalogStatus(cap, { tableId: ec.id }),
          /fuera/i,
        );
        await db.effectivenessGrant.deleteMany({
          where: { userId: viewer.id, scope: "TABLE:" + pe.id },
        });
        await assert.rejects(
          () => financialCatalogStatus(cap, { tableId: pe.id }),
          /acceso/i,
        );
      },
    );
    await t.test(
      "Activar y pendientes reconocen país del nombre de hoja sin repetir configuración",
      async () => {
        const table = await db.metaAliasTable.create({
          data: { name: "EC · Ecuador" },
        });
        autoTables.push(table.id);
        const emptyAlias = await db.metaAlias.create({
          data: {
            tableId: table.id,
            inventorySheetId: list.id,
            name: names[0],
          },
        });
        const initial = await inventoryActivationReport(owner, {
          listId: list.id,
          tableIds: table.id,
        });
        assert.equal(
          initial.rows.find((r) => r.name === names[0])!.targets.length,
          0,
        );
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          items: names.slice(0, 2).map((name) => ({ name, targets: [] })),
          campaignTask: "CREATE",
        });
        let result = await inventoryActivationReport(owner, {
          listId: list.id,
          tableIds: table.id,
        });
        for (const name of names.slice(0, 2)) {
          const row = result.rows.find((r) => r.name === name)!;
          assert.equal(row.activation, "ACTIVE");
          assert.equal(row.campaignTask, "CREATE");
          assert.deepEqual(
            row.targets.map((t) => t.country),
            ["EC"],
          );
        }
        const row = result.rows.find((r) => r.name === names[0])!;
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          items: [{ name: names[0], targets: row.targets }],
          campaignTask: "STOP",
        });
        result = await inventoryActivationReport(owner, {
          listId: list.id,
          tableIds: table.id,
        });
        assert.equal(
          result.rows.find((r) => r.name === names[0])!.campaignTask,
          "STOP",
        );
        assert.equal(
          result.rows.find((r) => r.name === names[0])!.activation,
          "ACTIVE",
        );
        const fresh = result.rows.find((r) => r.name === names[0])!;
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          items: [{ name: names[0], targets: fresh.targets }],
          active: true,
          campaignTask: "NONE",
        });
        assert.equal(
          (
            await inventoryActivationReport(owner, {
              listId: list.id,
              tableIds: table.id,
            })
          ).rows.find((r) => r.name === names[0])!.campaignTask,
          "NONE",
        );
        assert.equal(
          (
            await db.metaAliasTable.findUniqueOrThrow({
              where: { id: table.id },
            })
          ).defaultCountry,
          "",
        );
        assert.equal(
          (
            await db.metaAlias.findUniqueOrThrow({
              where: { id: emptyAlias.id },
            })
          ).inventorySheetId,
          list.id,
        );
      },
    );
    await t.test(
      "Elegir hoja guarda país una sola vez sin modificar filas existentes",
      async () => {
        const table = await db.metaAliasTable.create({
          data: { name: "Hoja país único " + tag },
        });
        autoTables.push(table.id);
        await inventoryActivationAddSheet(owner, {
          listId: list.id,
          tableId: table.id,
          country: "BO",
        });
        assert.equal(
          (
            await db.metaAliasTable.findUniqueOrThrow({
              where: { id: table.id },
            })
          ).defaultCountry,
          "",
        );
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          country: "BO",
          items: [{ name: names[2], targets: [] }],
          active: true,
        });
        const row = (
          await inventoryActivationReport(owner, {
            listId: list.id,
            tableIds: table.id,
          })
        ).rows.find((r) => r.name === names[2])!;
        assert.equal(row.activation, "ACTIVE");
        assert.deepEqual(
          row.targets.map((t) => t.country),
          ["BO"],
        );
        const cap = await authorizeFinancialRequest(
          { id: viewer.id, role: "OBSERVER" },
          "inventory/sheet-activation/directory",
          "GET",
          new URLSearchParams({ listId: list.id }),
          null,
          "TAB:" + list.id,
        );
        await assert.rejects(
          () =>
            inventoryActivationAddSheet(cap, {
              listId: list.id,
              tableId: table.id,
              country: "EC",
            }),
          /permiso/i,
        );
        assert.equal(
          (
            await db.metaAliasTable.findUniqueOrThrow({
              where: { id: table.id },
            })
          ).defaultCountry,
          "",
        );
      },
    );
    await t.test(
      "Una hoja admite BO/EC/CO con activación, revisión y reportes independientes",
      async () => {
        const table = await db.metaAliasTable.create({
          data: { name: "A10 " + tag },
        });
        autoTables.push(table.id);
        for (const country of ["BO", "EC", "CO"])
          await inventoryActivationAddSheet(owner, {
            listId: list.id,
            tableId: table.id,
            country,
          });
        const directory = await inventoryActivationDirectory(owner, {
          listId: list.id,
        });
        assert.deepEqual(
          directory.columns
            .filter((c) => c.tableId === table.id)
            .map((c) => c.country)
            .sort(),
          ["BO", "CO", "EC"],
        );
        const read = () =>
          inventoryActivationReport(owner, {
            listId: list.id,
            tableIds: table.id,
            byCountry: "true",
          });
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          country: "BO",
          items: [{ name: names[0], targets: [] }],
          campaignTask: "CREATE",
        });
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          country: "EC",
          items: [{ name: names[0], targets: [] }],
          active: true,
        });
        let rows = (await read()).rows;
        assert.equal(
          rows.find((r) => r.country === "BO")!.campaignTask,
          "CREATE",
        );
        assert.equal(
          rows.find((r) => r.country === "EC")!.campaignTask,
          "NONE",
        );
        const ec = rows.find((r) => r.country === "EC")!;
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          country: "EC",
          items: [{ name: names[0], targets: ec.targets }],
          active: false,
          pinned: true,
        });
        rows = (await read()).rows;
        assert.equal(
          rows.find((r) => r.country === "BO")!.activation,
          "ACTIVE",
        );
        assert.equal(
          rows.find((r) => r.country === "BO")!.campaignTask,
          "CREATE",
        );
        assert.equal(
          rows.find((r) => r.country === "EC")!.activation,
          "INACTIVE",
        );
        assert.deepEqual(
          rows.find((r) => r.country === "BO")!.targets.map((t) => t.country),
          ["BO"],
        );
        assert.deepEqual(
          rows.find((r) => r.country === "EC")!.targets.map((t) => t.country),
          ["EC"],
        );
        await assert.rejects(
          () =>
            inventoryActivationChange(owner, {
              listId: list.id,
              tableId: table.id,
              country: "CO",
              items: [{ name: names[0], targets: ec.targets }],
              active: true,
            }),
          /cambió/i,
        );
        const filtered = await inventoryActivationReport(owner, {
          listId: list.id,
          tableIds: table.id,
          historyName: names[0],
          country: "BO",
        });
        assert(filtered.rows[0].history?.every((h) => h.country === "BO"));
      },
    );
    await t.test(
      "Reemplazar conserva otros diplomados y países, valida categorías y revierte pares en conflicto",
      async () => {
        const table = await db.metaAliasTable.create({
          data: { name: "Top reemplazo " + tag, defaultCountry: "EC" },
        });
        autoTables.push(table.id);
        for (const country of ["EC", "BO"])
          await inventoryActivationAddSheet(owner, {
            listId: list.id,
            tableId: table.id,
            country,
          });
        const category = await db.metaInventoryCategory.create({
          data: {
            sheetId: list.id,
            kind: "PRIMARY",
            name: "QA reemplazo " + tag,
            key: "reemplazo-" + tag,
          },
        });
        const catalog = await db.metaInventoryItem.findMany({
          where: { sheetId: list.id, name: { in: names.slice(0, 2) } },
        });
        await db.metaInventoryItemCategory.createMany({
          data: catalog.map((i) => ({ itemId: i.id, categoryId: category.id })),
          skipDuplicates: true,
        });
        const read = () =>
          inventoryActivationReport(owner, {
            listId: list.id,
            tableIds: table.id,
            byCountry: "true",
          });
        for (const country of ["EC", "BO"])
          await inventoryActivationChange(owner, {
            listId: list.id,
            tableId: table.id,
            country,
            items: [{ name: names[0], targets: [] }],
            active: true,
          });
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          country: "EC",
          items: [{ name: names[2], targets: [] }],
          active: true,
        });
        let rows = (await read()).rows;
        const old = rows.find(
            (r) => r.name === names[0] && r.country === "EC",
          )!,
          bo = rows.find((r) => r.name === names[0] && r.country === "BO")!,
          kept = rows.find((r) => r.name === names[2])!;
        const groupsBefore = await db.metaInventoryTrialGroup.findMany({
          where: { sheetId: list.id },
        });
        await inventoryActivationReplace(owner, {
          listId: list.id,
          tableId: table.id,
          country: "EC",
          from: { name: names[0], targets: old.targets },
          to: { name: names[1], targets: [] },
          mode: "SAME",
        });
        rows = (await read()).rows;
        assert.equal(
          rows.find((r) => r.name === names[0] && r.country === "EC")!
            .campaignTask,
          "STOP",
        );
        assert.equal(
          rows.find((r) => r.name === names[1] && r.country === "EC")!
            .campaignTask,
          "CREATE",
        );
        assert.equal(
          rows.find((r) => r.name === names[0] && r.country === "EC")!
            .activation,
          "ACTIVE",
        );
        assert.equal(
          rows.find((r) => r.name === names[1] && r.country === "EC")!
            .activation,
          "ACTIVE",
        );
        assert.deepEqual(
          rows.find((r) => r.name === names[0] && r.country === "BO")!.targets,
          bo.targets,
        );
        assert.deepEqual(
          rows.find((r) => r.name === names[2])!.targets,
          kept.targets,
        );
        assert.deepEqual(
          await db.metaInventoryTrialGroup.findMany({
            where: { sheetId: list.id },
          }),
          groupsBefore,
        );
        const from = rows.find((r) => r.name === names[2])!;
        await assert.rejects(
          () =>
            inventoryActivationReplace(owner, {
              listId: list.id,
              tableId: table.id,
              country: "EC",
              from: { name: names[2], targets: from.targets },
              to: { name: names[1], targets: [] },
              mode: "MANUAL",
            }),
          /ya está activo/i,
        );
        const extra = await db.metaInventoryItem.create({
          data: { sheetId: list.id, name: "Reserva " + tag },
        });
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          country: "EC",
          items: [{ name: extra.name, targets: [] }],
          active: true,
        });
        let reserve = (await read()).rows.find((r) => r.name === extra.name)!;
        await inventoryActivationChange(owner, {
          listId: list.id,
          tableId: table.id,
          country: "EC",
          items: [{ name: extra.name, targets: reserve.targets }],
          active: false,
        });
        reserve = (await read()).rows.find((r) => r.name === extra.name)!;
        await assert.rejects(
          () =>
            inventoryActivationReplace(owner, {
              listId: list.id,
              tableId: table.id,
              country: "EC",
              from: { name: names[2], targets: from.targets },
              to: {
                name: extra.name,
                targets: reserve.targets.map((t) => ({
                  ...t,
                  revision: t.revision - 1,
                })),
              },
              mode: "MANUAL",
            }),
          /cambió/i,
        );
        const after = (await read()).rows.find((r) => r.name === names[2])!;
        assert.equal(after.campaignTask, "NONE");
        assert.deepEqual(after.targets, from.targets);
        const cap = await authorizeFinancialRequest(
          { id: viewer.id, role: "OBSERVER" },
          "inventory/sheet-activation/report",
          "GET",
          new URLSearchParams({ listId: list.id, tableIds: table.id }),
          null,
          "TAB:" + list.id,
        );
        await assert.rejects(
          () =>
            inventoryActivationReplace(cap, {
              listId: list.id,
              tableId: table.id,
              country: "EC",
              from: { name: names[2], targets: from.targets },
              to: { name: extra.name, targets: reserve.targets },
              mode: "MANUAL",
            }),
          /permiso/i,
        );
      },
    );
    await t.test(
      "Editar preferencias conserva metadatos internos de activación",
      async () => {
        const current = await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: list.id },
        });
        const updated = await updateWorkbookSheet(owner, list.id, {
          revision: current.revision,
          config: { query: "buscar" },
        });
        assert.deepEqual(
          (updated.config as any).inventoryActivation,
          (current.config as any).inventoryActivation,
        );
      },
    );
  } finally {
    await db.metaAlias
      .deleteMany({ where: { inventorySheetId: { in: [list.id, other.id] } } })
      .catch(async () => {
        const aliases = await db.metaAlias.findMany({
          where: { inventorySheetId: list.id },
          select: { id: true },
        });
        await db.metaEffectivenessRow.deleteMany({
          where: { aliasId: { in: aliases.map((a) => a.id) } },
        });
        await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
      });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: [list.id, other.id] } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [list.id, other.id] } },
    });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: [pe?.id, ec?.id, ...autoTables].filter(Boolean) } },
    });
    await db.effectivenessGrant.deleteMany({
      where: {
        OR: [
          { userId: { in: [actor.id, viewer.id] } },
          { grantedById: actor.id },
        ],
      },
    });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: [actor.id, viewer.id] } },
    });
    await db.user.deleteMany({ where: { id: { in: [actor.id, viewer.id] } } });
    await db.$disconnect();
  }
});
