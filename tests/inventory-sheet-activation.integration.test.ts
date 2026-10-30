import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAliasTable } from "../lib/meta-ads/aliases";
import { db } from "../lib/db";
import {
  inventoryActivationDirectory,
  inventoryActivationAddSheet,
  inventoryActivationChange,
  inventoryActivationReport,
} from "../lib/meta-ads/inventory-sheet-activation";
import {
  effectiveness,
  inventoryEffectivenessSource,
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
