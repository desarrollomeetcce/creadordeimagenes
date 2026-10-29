import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { assignRowsAdvisor } from "../lib/meta-ads/advisors";
import { linkInventorySheetsBatch } from "../lib/meta-ads/inventory-import";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import { localDay } from "../lib/meta-ads/analytics";
test("Asignaciones de cabecera: selección exacta y transacciones completas", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    today = localDay("America/Lima"),
    users = [] as Awaited<ReturnType<typeof db.user.create>>[];
  for (const role of ["OWNER", "USER"] as const)
    users.push(
      await db.user.create({
        data: {
          name: "Lote " + role,
          email: role + tag + "@example.test",
          role,
          status: "APPROVED",
          passwordHash: "synthetic",
        },
      }),
    );
  const [owner, editor] = users,
    inv = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "Lote " + tag },
    }),
    other = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "Otro " + tag },
    }),
    team = await db.metaEffectivenessSheet.create({
      data: { kind: "ADVISORS", name: "Equipo " + tag },
    }),
    people = await Promise.all(
      ["Ana", "Beto"].map((name) =>
        db.metaAdvisor.create({ data: { name: name + tag, sheetId: team.id } }),
      ),
    ),
    tables = await Promise.all(
      [0, 1].map((n) =>
        db.metaAliasTable.create({ data: { name: "Destino " + n + tag } }),
      ),
    ),
    items = await Promise.all(
      ["X", "Y", "Z"].map((name) =>
        db.metaInventoryItem.create({
          data: { name: "Curso " + name + tag, sheetId: inv.id },
        }),
      ),
    ),
    aliases = await Promise.all(
      ["A", "B", "C"].map((name) =>
        db.metaAlias.create({
          data: {
            name: "Fila " + name + tag,
            tableId: tables[0].id,
            inventorySheetId: inv.id,
          },
        }),
      ),
    ),
    rows = await Promise.all(
      aliases.map((a) =>
        db.metaEffectivenessRow.create({
          data: {
            aliasId: a.id,
            country: "PE",
            currency: "",
            advisorId: people[0].id,
            days: { create: { day: today, sales: 2, salesOverridden: true } },
          },
        }),
      ),
    );
  const fail = (p: Promise<unknown>, status: number) =>
    assert.rejects(p, (e: any) => e.status === status);
  try {
    const targets = aliases
        .slice(0, 2)
        .map((a) => ({ aliasId: a.id, country: "PE", revision: 0 })),
      body = {
        tableId: tables[0].id,
        advisorId: people[1].id,
        day: today,
        mode: "DAY" as const,
        targets,
      };
    await t.test(
      "Solo cambia las filas entregadas por la selección, sin tocar ventas ni otras filas",
      async () => {
        const r = await assignRowsAdvisor(owner, body);
        assert.equal(r.changed, 2);
        const stored = await db.metaEffectivenessRow.findMany({
          where: { id: { in: rows.map((r) => r.id) } },
          include: { days: true },
        });
        for (const row of stored) {
          assert.equal(
            row.advisorId,
            row.id === rows[2].id ? people[0].id : people[1].id,
          );
          assert.equal(row.days[0].sales, 2);
        }
        await fail(assignRowsAdvisor(editor, body), 403);
      },
    );
    await t.test(
      "Una revisión obsoleta revierte todas las asignaciones del lote",
      async () => {
        await fail(
          assignRowsAdvisor(owner, {
            ...body,
            advisorId: people[0].id,
            targets: [{ ...targets[0], revision: 1 }, targets[1]],
          }),
          409,
        );
        assert.equal(
          (
            await db.metaEffectivenessRow.findUnique({
              where: { id: rows[0].id },
            })
          )?.advisorId,
          people[1].id,
        );
        assert.equal(
          await db.metaAdvisorAssignment.count({
            where: { aliasId: aliases[0].id },
          }),
          1,
        );
        await fail(
          assignRowsAdvisor(owner, { ...body, tableId: tables[1].id }),
          403,
        );
      },
    );
    const batch = {
      listId: inv.id,
      revision: 0,
      tableIds: tables.map((t) => t.id),
      items: items
        .slice(0, 2)
        .map((i) => ({ inventoryId: i.id, expectedName: i.name })),
    };
    await t.test(
      "Un conflicto al asignar hojas no deja vínculos ni revisiones parciales",
      async () => {
        const conflict = await db.metaAlias.create({
          data: {
            name: items[1].name,
            tableId: tables[1].id,
            inventorySheetId: other.id,
          },
        });
        await fail(linkInventorySheetsBatch(owner, batch), 409);
        assert.equal(
          await db.metaAlias.count({ where: { name: items[0].name } }),
          0,
        );
        assert.equal(
          (
            await db.metaEffectivenessSheet.findUnique({
              where: { id: inv.id },
            })
          )?.categoryRevision,
          0,
        );
        await db.metaAlias.delete({ where: { id: conflict.id } });
      },
    );
    await t.test(
      "Asignar varias hojas es idempotente y solo incluye los inventarios marcados",
      async () => {
        const result = await linkInventorySheetsBatch(owner, batch);
        assert.equal(result.created, 4);
        assert.equal(
          await db.metaAlias.count({ where: { name: items[2].name } }),
          0,
        );
        const repeat = await linkInventorySheetsBatch(owner, {
          ...batch,
          revision: result.revision,
        });
        assert.equal(repeat.created, 0);
        await fail(linkInventorySheetsBatch(owner, batch), 409);
      },
    );
    await t.test(
      "Compartir Inventario no concede permiso de vincular una hoja de destino ajena",
      async () => {
        await db.effectivenessGrant.createMany({
          data: [
            {
              scope: "TAB:" + inv.id,
              userId: editor.id,
              grantedById: owner.id,
              permission: "EDIT",
            },
            {
              scope: "TABLE:" + tables[0].id,
              userId: editor.id,
              grantedById: owner.id,
              permission: "EDIT",
            },
          ],
        });
        await fail(
          authorizeFinancialRequest(
            editor,
            "inventory/sheets/batch",
            "POST",
            new URLSearchParams(),
            batch,
            "TAB:" + inv.id,
          ),
          403,
        );
      },
    );
    await t.test("Revocar el destino invalida también un lote autorizado anteriormente",async()=>{
      const scope=await authorizeFinancialRequest(editor,"inventory/sheets/batch","POST",new URLSearchParams(),{...batch,tableIds:[tables[0].id]},"TAB:"+inv.id);
      await db.effectivenessGrant.delete({where:{scope_userId:{scope:"TABLE:"+tables[0].id,userId:editor.id}}});
      await fail(linkInventorySheetsBatch(scope,{...batch,tableIds:[tables[0].id],revision:2}),403);
    });
  } finally {
    const ids = users.map((u) => u.id);
    await db.effectivenessGrant.deleteMany({ where: { userId: { in: ids } } });
    await db.metaAdvisorAssignment.deleteMany({
      where: { aliasId: { in: aliases.map((a) => a.id) } },
    });
    await db.metaEffectivenessRow.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    await db.metaAlias.deleteMany({
      where: { tableId: { in: tables.map((t) => t.id) } },
    });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((t) => t.id) } },
    });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: [inv.id, other.id] } },
    });
    await db.metaAdvisor.deleteMany({
      where: { id: { in: people.map((p) => p.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [inv.id, other.id, team.id] } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
