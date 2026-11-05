import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryTrials,
  saveInventoryTrial,
} from "../lib/meta-ads/inventory-trials";
import { groupUsageKey } from "../lib/meta-ads/inventory-group-usage";
import { inventoryCountryUsage } from "../lib/meta-ads/inventory-usage";

test("Matriz de grupos: 12 horas reales, solapes y activación breve", () => {
  const now = Date.now(),
    e = (h: number, active: boolean) => ({
      active,
      createdAt: new Date(now - h * 3600000),
      snapshot: { priorActive: !active },
    });
  assert.equal(
    inventoryCountryUsage(
      [{ active: false, events: [e(1, true), e(0.99, false)] }],
      now,
    ).usage,
    "TEST",
  );
  assert.equal(
    inventoryCountryUsage([{ active: true, events: [e(11.99, true)] }], now)
      .usage,
    "TEST",
  );
  assert.equal(
    inventoryCountryUsage([{ active: true, events: [e(12, true)] }], now).usage,
    "USED",
  );
  const overlap = inventoryCountryUsage(
    [
      { active: true, events: [e(7, true)] },
      { active: true, events: [e(6, true)] },
    ],
    now,
  );
  assert.equal(overlap.usage, "TEST");
  assert.equal(overlap.activationHours, 7);
  assert.equal(
    inventoryCountryUsage([{ active: true, events: [] }], now).usage,
    "UNKNOWN",
  );
  assert.equal(inventoryCountryUsage([], now).usage, "NEVER");
  assert.equal(
    inventoryCountryUsage([{ active: true, events: [e(1, true)] }], now)
      .nextUsedAt,
    new Date(now + 11 * 3600000).toISOString(),
  );
});
test("Uso manual compartido por diplomado y país: persistencia, CAS, permisos e integridad", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "DB exclusiva",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "Grupo QA",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
    data: { name: "Matriz " + tag, kind: "INVENTORY" },
  });
  const tables = await Promise.all(
    ["PE", "EC"].map((defaultCountry) =>
      db.metaAliasTable.create({
        data: {
          name: "Matriz " + defaultCountry + tag,
          defaultCountry,
          defaultCurrency: "PEN",
        },
      }),
    ),
  );
  const item = await db.metaInventoryItem.create({
    data: { sheetId: list.id, name: "Diplomado " + tag },
  });
  const alias = await db.metaAlias.create({
    data: { tableId: tables[0].id, name: item.name, inventorySheetId: list.id },
  });
  const state = await db.metaEffectivenessState.create({
    data: {
      aliasId: alias.id,
      country: "PE",
      active: true,
      events: {
        create: {
          actorId: owner.id,
          active: true,
          createdAt: new Date(Date.now() - 13 * 3600000),
          snapshot: { priorActive: false },
        },
      },
    },
  });
  const row = await db.metaEffectivenessRow.create({
    data: {
      aliasId: alias.id,
      country: "AO",
      currency: "PEN",
      days: { create: { day: "2026-10-01", sales: 3 } },
    },
  });
  await db.metaEffectivenessSheet.update({
    where: { id: list.id },
    data: {
      config: { inventoryActivation: { sheets: tables.map((t) => t.id) } },
    },
  });
  let revision: string | null = null;
  try {
    await t.test(
      "Solo países de hojas; Angola histórico no crea columna",
      async () => {
        const d = await inventoryTrials(actor, { listId: list.id });
        assert.deepEqual(d.countries.map((c) => c.code).sort(), ["EC", "PE"]);
        assert.equal(d.usage[groupUsageKey(item.name, "PE")].automatic, "USED");
        assert.equal(d.catalog.length, 1);
      },
    );
    await t.test(
      "Cambiar usado manualmente no altera activación, ventas ni ciclos",
      async () => {
        const r = await saveInventoryTrial(actor, {
          action: "USAGE",
          listId: list.id,
          itemId: item.id,
          country: "PE",
          mode: "UNUSED",
          expectedRevision: null,
        });
        assert("usageUpdate" in r && r.usageUpdate);
        revision = r.usageUpdate.cell.revision;
        const d = await inventoryTrials(actor, { listId: list.id });
        assert.equal(d.usage[groupUsageKey(item.name, "PE")].mode, "UNUSED");
        assert.equal(d.usage[groupUsageKey(item.name, "PE")].automatic, "USED");
        assert.equal(d.usage[groupUsageKey(item.name, "EC")], undefined);
        assert.equal(
          (
            await db.metaEffectivenessState.findUniqueOrThrow({
              where: { id: state.id },
            })
          ).active,
          true,
        );
        assert.equal(
          (
            await db.metaEffectivenessDay.findFirstOrThrow({
              where: { rowId: row.id },
            })
          ).sales,
          3,
        );
        assert.equal(
          await db.metaInventoryTrialGroup.count({
            where: { sheetId: list.id },
          }),
          0,
        );
      },
    );
    await t.test("Directorio rápido conserva preferencias manuales sin calcular historial; uso diferido sin catálogo duplicado", async () => {
      const basic=await inventoryTrials(actor,{listId:list.id,mode:"directory"});
      assert.equal(basic.usageReady,false);assert.equal(basic.catalog.length,1);assert.equal(basic.usage[groupUsageKey(item.name,"PE")].mode,"UNUSED");assert.equal(basic.usage[groupUsageKey(item.name,"PE")].automatic,"UNKNOWN");
      const usage=await inventoryTrials(actor,{listId:list.id,mode:"usage"});assert.equal(usage.usageReady,true);assert.equal(usage.catalog.length,0);assert.equal(usage.groups.length,0);assert.equal(usage.usage[groupUsageKey(item.name,"PE")].automatic,"USED");assert.equal(usage.usage[groupUsageKey(item.name,"PE")].mode,"UNUSED");
    });
    await t.test("Catálogo canónico, categorías heredadas y desfijados sobreviven a la proyección ligera",async()=>{
      const saved=(await db.metaEffectivenessSheet.findUniqueOrThrow({where:{id:list.id}})).config as any;
      const cats=await Promise.all(["Canónica","Heredada"].map((name,n)=>db.metaInventoryCategory.create({data:{sheetId:list.id,kind:"PRIMARY",name,key:tag+"-"+n}})));
      const legacy=await db.metaAlias.create({data:{tableId:tables[1].id,inventorySheetId:list.id,name:"Heredado "+tag}});
      try{
        await db.metaInventoryItemCategory.create({data:{itemId:item.id,categoryId:cats[0].id}});
        await db.metaInventoryCategoryAssignment.createMany({data:[{aliasId:alias.id,categoryId:cats[1].id},{aliasId:legacy.id,categoryId:cats[1].id}]});
        await db.metaEffectivenessSheet.update({where:{id:list.id},data:{config:{...saved,unrelatedHeavySetting:"x".repeat(100000),inventoryActivation:{...saved.inventoryActivation,detachedAliases:[alias.id]}}}});
        const fast=await inventoryTrials(actor,{listId:list.id,mode:"directory"});
        assert.deepEqual(fast.catalog.find(i=>i.id===item.id)?.primaryNames,["Canónica"]);
        assert.deepEqual(fast.catalog.find(i=>i.id===item.id)?.sheets,[]);
        assert.deepEqual(fast.catalog.find(i=>i.id===legacy.id)?.primaryNames,["Heredada"]);
        assert.equal(fast.usage[groupUsageKey(item.name,"PE")].mode,"UNUSED");
        const usage=await inventoryTrials(actor,{listId:list.id,mode:"usage"});assert.equal(usage.usage[groupUsageKey(item.name,"PE")].automatic,"USED");assert.equal(usage.usage[groupUsageKey(item.name,"PE")].mode,"UNUSED");
        assert.equal(((await db.metaEffectivenessSheet.findUniqueOrThrow({where:{id:list.id}})).config as any).unrelatedHeavySetting.length,100000);
      }finally{await db.metaEffectivenessSheet.update({where:{id:list.id},data:{config:saved}});await db.metaAlias.delete({where:{id:legacy.id}});await db.metaInventoryCategory.deleteMany({where:{id:{in:cats.map(c=>c.id)}}});}
    });
    await t.test(
      "Conflicto concurrente, país ajeno e inventario ajeno rechazados",
      async () => {
        const base = {
          action: "USAGE",
          listId: list.id,
          itemId: item.id,
          country: "PE",
          mode: "USED",
          expectedRevision: null,
        };
        await assert.rejects(saveInventoryTrial(actor, base), { status: 409 });
        await assert.rejects(
          saveInventoryTrial(actor, { ...base, country: "AO" }),
          { status: 409 },
        );
        await assert.rejects(
          saveInventoryTrial(actor, { ...base, itemId: "foreign-item" }),
          { status: 409 },
        );
      },
    );
    await t.test(
      "Automático vuelve al registro de 12 h sin modificarlo",
      async () => {
        await saveInventoryTrial(actor, {
          action: "USAGE",
          listId: list.id,
          itemId: item.id,
          country: "PE",
          mode: "AUTO",
          expectedRevision: revision,
        });
        const cell = (await inventoryTrials(actor, { listId: list.id })).usage[
          groupUsageKey(item.name, "PE")
        ];
        assert.equal(cell.mode, "AUTO");
        assert.equal(cell.automatic, "USED");
        assert.equal(cell.revision, null);
      },
    );
    await t.test(
      "Rol revocado no puede escribir aunque el cliente conserve OWNER",
      async () => {
        await db.user.update({
          where: { id: owner.id },
          data: { role: "USER" },
        });
        await assert.rejects(inventoryTrials(actor, { listId: list.id }), {
          status: 403,
        });
        await assert.rejects(
          saveInventoryTrial(actor, {
            action: "USAGE",
            listId: list.id,
            itemId: item.id,
            country: "PE",
            mode: "USED",
            expectedRevision: null,
          }),
          { status: 403 },
        );
      },
    );
  } finally {
    await db.metaEffectivenessRow.deleteMany({ where: { aliasId: alias.id } });
    await db.metaAlias.delete({ where: { id: alias.id } });
    await db.metaInventoryItem.delete({ where: { id: item.id } });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((t) => t.id) } },
    });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});

test("Reemplazos por grupo y país: prioridad, filtros, manual y grupo desconocido", async () => {
  const { groupReplacementCandidates } =
    await import("../lib/meta-ads/inventory-replacement-groups");
  const items = ["Usado", "Nuevo", "Prueba", "Ajeno"].map((name, i) => ({
    id: String(i),
    name,
    primaryIds: [],
    primaryNames: [],
  }));
  const directory = {
    groups: [
      {
        id: "g1",
        members: items.slice(0, 3).map((i) => ({ itemId: i.id, name: i.name })),
      },
    ],
    usage: {
      [groupUsageKey("Usado", "PE")]: { automatic: "USED", mode: "AUTO" },
      [groupUsageKey("Prueba", "PE")]: { automatic: "TEST", mode: "AUTO" },
      [groupUsageKey("Nuevo", "EC")]: { automatic: "USED", mode: "AUTO" },
    },
  } as unknown as Awaited<ReturnType<typeof inventoryTrials>>;
  assert.deepEqual(
    groupReplacementCandidates(items, directory, "PE", "g1", "ALL").map(
      (i) => i.name,
    ),
    ["Nuevo", "Prueba", "Usado"],
  );
  assert.deepEqual(
    groupReplacementCandidates(items, directory, "PE", "g1", "UNUSED").map(
      (i) => i.name,
    ),
    ["Nuevo", "Prueba"],
  );
  assert.deepEqual(
    groupReplacementCandidates(items, directory, "PE", "g1", "USED").map(
      (i) => i.name,
    ),
    ["Usado"],
  );
  assert.deepEqual(
    groupReplacementCandidates(items, directory, "EC", "g1", "USED").map(
      (i) => i.name,
    ),
    ["Nuevo"],
  );
  assert.equal(
    groupReplacementCandidates(items, directory, "PE", "deleted", "ALL").length,
    0,
  );
  directory.usage[groupUsageKey("Usado", "PE")].mode = "UNUSED";
  assert(
    groupReplacementCandidates(items, directory, "PE", "g1", "UNUSED").some(
      (i) => i.name === "Usado",
    ),
  );
});
