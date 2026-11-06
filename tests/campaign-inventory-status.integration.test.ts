import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { MetaReader } from "../lib/meta-ads/provider";
import { MetaGraphError } from "../lib/meta-ads/graph-error";
import { setMetaStatus } from "../lib/meta-ads/manage";
import { activationSettings } from "../lib/meta-ads/inventory-sheet-activation";
import { inventoryMetaReplace } from "../lib/meta-ads/inventory-meta-replace";
import { pendingInventoryCampaigns } from "../lib/meta-ads/pending-campaigns";
import { inventoryReplacementContext } from "../lib/meta-ads/inventory-sheet-activation";
import { dashboard } from "../lib/meta-ads/dashboard";

test("Pausa rechazada conserva STOP y filtro activo; solo el acuse completo desactiva la hoja", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID(),
    root = String(Date.now()) + "987",
    accountId = root + "0",
    ids = [root + "1", root + "2", root + "3"];
  const actor = await db.user.create({
    data: {
      name: "QA pausa " + tag,
      email: tag + "@example.test",
      passwordHash: "synthetic",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const list = await db.metaEffectivenessSheet.create({
    data: {
      name: "QA inventario " + tag,
      kind: "INVENTORY",
      config: { keep: { marker: tag } },
    },
  });
  const table = await db.metaAliasTable.create({
    data: {
      name: "QA Colombia " + tag,
      defaultCountry: "CO",
      defaultCurrency: "PEN",
    },
  });
  const alias = await db.metaAlias.create({
    data: {
      name: "QA diploma " + tag,
      tableId: table.id,
      inventorySheetId: list.id,
    },
  });
  await db.metaInventoryItem.create({
    data: { sheetId: list.id, name: alias.name },
  });
  await db.metaEffectivenessState.createMany({
    data: [
      { aliasId: alias.id, country: "CO", active: true },
      { aliasId: alias.id, country: "PE", active: true },
    ],
  });
  const row = await db.metaEffectivenessRow.create({
    data: {
      aliasId: alias.id,
      country: "CO",
      currency: "PEN",
      displayCurrency: "PEN",
    },
  });
  await db.metaEffectivenessDay.create({
    data: {
      rowId: row.id,
      day: "2026-11-04",
      sales: 7,
      fixedCost: 23,
      annotations: { G: 49 },
    },
  });
  const connection = await db.metaConnection.create({
    data: {
      ownerId: actor.id,
      name: "QA " + tag,
      transport: "API",
      encryptedToken: encryptKey(
        "synthetic-token-000000000000",
        "meta:pending",
      ),
      verifiedAt: new Date(),
    },
  });
  await db.metaConnection.update({
    where: { id: connection.id },
    data: {
      encryptedToken: encryptKey(
        "synthetic-token-000000000000",
        "meta:" + connection.id,
      ),
    },
  });
  await db.metaAdAccount.create({
    data: {
      id: accountId,
      name: "QA " + tag,
      connectionId: connection.id,
      currency: "PEN",
      timezone: "America/Lima",
      enabled: true,
    },
  });
  await db.metaAdObject.createMany({
    data: ids.map((id, i) => ({
      id,
      accountId,
      name: "QA campaña " + tag + " " + i,
      level: "campaign",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      aliasId: alias.id,
      aliasCountry: i === 2 ? "PE" : "CO",
    })),
  });
  const get = MetaReader.prototype.get,
    write = MetaReader.prototype.setStatus,
    fetch = globalThis.fetch;
  const remote = new Map(ids.map((id) => [id, "ACTIVE"]));
  let reject = true,
    writes = 0;
  globalThis.fetch = async () => {
    throw Error("QA prohíbe llamadas externas");
  };
  MetaReader.prototype.get = async function (_op, options: any) {
    return {
      data: [
        {
          id: options.objectId,
          account_id: accountId,
          status: remote.get(options.objectId),
        },
      ],
      next: null,
    } as any;
  };
  MetaReader.prototype.setStatus = async function (id, status) {
    writes++;
    if (reject)
      throw new MetaGraphError(
        403,
        { error: { code: 200, message: "Permiso de prueba" } },
        "synthetic-token",
        { version: "v26.0", endpoint: id, fields: "status" },
      );
    remote.set(id, status);
    return {success:true};
  };
  const controls = async () =>
    activationSettings(
      (
        await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: list.id },
        })
      ).config,
    );
  try {
    await assert.rejects(
      () => setMetaStatus(actor, ids[0], "PAUSED", "ACTIVE"),
      /ads_management|Permiso/,
    );
    assert.equal(
      (await controls()).rows[alias.id + "|CO"].campaignTask,
      "STOP",
    );
    assert.equal(
      (
        await db.metaEffectivenessState.findUniqueOrThrow({
          where: { aliasId_country: { aliasId: alias.id, country: "CO" } },
        })
      ).active,
      true,
    );
    const report = await dashboard(
      actor,
      new URLSearchParams({
        accounts: accountId,
        level: "campaign",
        state: "active",
      }),
    );
    assert(
      report.items.some(
        (i) =>
          i.id === ids[0] && i.status === "ACTIVE" && i.campaignTask === "STOP",
      ),
    );
    reject = false;
    const first = await setMetaStatus(actor, ids[0], "PAUSED", "ACTIVE");
    assert.equal(first.inventoryCampaignTask, "STOP");
    assert.equal(first.inventoryActive, true);
    const last = await setMetaStatus(actor, ids[1], "PAUSED", "ACTIVE");
    assert.equal(last.inventoryCampaignTask, "NONE");
    assert.equal(last.inventoryActive, false);
    assert.equal(
      (
        await db.metaEffectivenessState.findUniqueOrThrow({
          where: { aliasId_country: { aliasId: alias.id, country: "CO" } },
        })
      ).active,
      false,
    );
    assert.equal(
      (
        await db.metaEffectivenessState.findUniqueOrThrow({
          where: { aliasId_country: { aliasId: alias.id, country: "PE" } },
        })
      ).active,
      true,
    );
    assert.equal(
      (await db.metaAdObject.findUniqueOrThrow({ where: { id: ids[2] } }))
        .status,
      "ACTIVE",
    );
    const facts = await db.metaEffectivenessDay.findUniqueOrThrow({
      where: { rowId_day: { rowId: row.id, day: "2026-11-04" } },
    });
    assert.equal(facts.sales, 7);
    assert.equal(Number(facts.fixedCost), 23);
    assert.deepEqual(facts.annotations, { G: 49 });
    assert.deepEqual(
      (
        (
          await db.metaEffectivenessSheet.findUniqueOrThrow({
            where: { id: list.id },
          })
        ).config as any
      ).keep,
      { marker: tag },
    );
    assert.equal(writes, 3);
    const second=await db.metaAlias.create({data:{name:"QA segundo "+tag,tableId:table.id,inventorySheetId:list.id}});
    await db.metaEffectivenessState.create({data:{aliasId:second.id,country:"CO",active:true}});
    const newNames=["QA entrante A "+tag,"QA entrante B "+tag];
    await db.metaInventoryItem.createMany({data:[{sheetId:list.id,name:second.name},...newNames.map(name=>({sheetId:list.id,name}))]});
    const fourth=root+"4";remote.set(fourth,"ACTIVE");
    await db.metaAdObject.create({data:{id:fourth,accountId,name:"QA pendiente "+tag,level:"campaign",status:"ACTIVE",effectiveStatus:"ACTIVE",aliasId:second.id,aliasCountry:"CO"}});
    const context=await inventoryReplacementContext(actor,{listId:list.id,tableId:table.id,country:"CO"});
    const payload={listId:list.id,tableId:table.id,country:"CO",pauseNow:[alias.name],replacements:[alias.name,second.name].map((name,n)=>({from:{name,targets:context.rows.find(r=>r.name===name)!.targets},to:{name:newNames[n],targets:[]},mode:"MANUAL"}))};
    const replaced=await inventoryMetaReplace(actor,payload);
    assert.equal(replaced.replaced,2);assert.equal(replaced.warnings.length,0);
    assert.equal(writes,3,"Already paused campaigns are verified through reads, never posted again");
    const pending=await pendingInventoryCampaigns(actor,[accountId],{level:"campaign",state:"active",q:""});
    assert.equal(pending.length,2);assert.deepEqual(pending.map(p=>p.name).sort(),newNames.sort());assert(pending.every(p=>p.country==="CO"));
    assert.equal((await controls()).rows[second.id+"|CO"].campaignTask,"STOP");
    assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:fourth}})).status,"ACTIVE");
    assert.equal((await db.metaEffectivenessState.findUniqueOrThrow({where:{aliasId_country:{aliasId:alias.id,country:"CO"}}})).active,false);
    await assert.rejects(()=>inventoryMetaReplace(actor,payload),/cambió|activo|pendiente/);
    assert.equal(writes,3);

  } finally {
    MetaReader.prototype.get = get;
    MetaReader.prototype.setStatus = write;
    globalThis.fetch = fetch;
    await db.metaAdObject.deleteMany({ where: { accountId } });
    await db.metaAdAccount.delete({ where: { id: accountId } });
    await db.metaConnection.delete({ where: { id: connection.id } });
    const cleanupAliases=await db.metaAlias.findMany({where:{inventorySheetId:list.id},select:{id:true}});
    await db.metaEffectivenessRow.deleteMany({where:{aliasId:{in:cleanupAliases.map(a=>a.id)}}});
    await db.metaAlias.deleteMany({where:{inventorySheetId:list.id}});
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.auditEvent.deleteMany({ where: { actorId: actor.id } });
    await db.user.delete({ where: { id: actor.id } });
    await db.$disconnect();
  }
});
