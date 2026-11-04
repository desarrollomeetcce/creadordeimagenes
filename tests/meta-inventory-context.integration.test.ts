import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import {
  assignAliases,
  metaAssignmentContext,
  inventoryMetaCandidates,
} from "../lib/meta-ads/aliases";
import { metaRoutes } from "../lib/meta-ads/routes";
import { inventoryActivationReport } from "../lib/meta-ads/inventory-sheet-activation";

test("Contexto diplomado/país se guarda sin campañas y conserva otras fuentes", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = "optional-sync-" + randomUUID(),
    uid = tag + "-owner",
    viewer = tag + "-viewer",
    listId = tag + "-list",
    tableId = tag + "-table",
    peopleId = tag + "-people",
    cid = tag + "-connection",
    aid = Date.now() + "73",
    actor = { id: uid, role: "OWNER" },
    original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("No providers allowed");
  };
  const req = (input: unknown, as = actor) =>
    metaRoutes(
      new NextRequest("http://localhost/api/meta-ads/objects/alias", {
        method: "PATCH",
      }),
      ["meta-ads", "objects", "alias"],
      as,
      async () => input,
    );
  try {
    await db.user.createMany({
      data: [uid, viewer].map((id, i) => ({
        id,
        name: tag,
        email: id + "@example.test",
        passwordHash: "synthetic",
        role: i ? "OBSERVER" : "OWNER",
        status: "APPROVED",
      })),
    });
    await db.metaEffectivenessSheet.createMany({
      data: [
        { id: listId, name: tag, kind: "INVENTORY" },
        { id: peopleId, name: tag, kind: "ADVISORS" },
      ],
    });
    await db.metaAliasTable.create({
      data: {
        id: tableId,
        name: tag,
        defaultCountry: "EC",
        defaultCurrency: "PEN",
      },
    });
    const first = await db.metaAdvisor.create({
        data: { sheetId: peopleId, name: "FRAN " + tag },
      }),
      second = await db.metaAdvisor.create({
        data: { sheetId: peopleId, name: "Francesca " + tag },
      }),
      item = await db.metaInventoryItem.create({
        data: {
          sheetId: listId,
          name: "Sin campaña " + tag,
          advisors: { create: { advisorId: first.id } },
        },
      });
    let aliasId = "";
    await t.test(
      "Catálogo y país precargan asesor y moneda; guardar sin campaña materializa una sola ficha",
      async () => {
        const context = await metaAssignmentContext(actor, {
          tableId,
          country: "EC",
          catalogId: "item:" + item.id,
        });
        assert.equal(context.advisorId, first.id);
        assert.equal(context.currency, "PEN");
        assert.equal(context.aliasId, null);
        const input = {
          inventorySync: true,
          objectIds: [],
          aliasId: null,
          country: "EC",
          selection: { tableId, catalogId: "item:" + item.id },
          advisorId: first.id,
          currency: "PEN",
          assignmentContext: context,
        };
        // Only the receipt fields are accepted, not arbitrary UI metadata.
        input.assignmentContext = {
          aliasId: context.aliasId,
          tableId,
          country: "EC",
          revision: context.revision,
          inventoryId: context.inventoryId,
          advisorRevision: context.advisorRevision,
        } as typeof context;
        const response = await req(input);
        assert(response);
        assert.equal(response.status, 200);
        const result = await response.json();
        aliasId = result.aliasId;
        assert(aliasId);
        assert.equal(result.count, 0);
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId, country: "EC" },
        });
        assert.equal(row.advisorId, first.id);
        assert.equal(row.displayCurrency, "PEN");
        assert.equal(await db.metaAdObject.count({ where: { aliasId } }), 0);
        assert.equal(
          await db.metaEffectivenessEvent.count({
            where: { state: { aliasId } },
          }),
          0,
        );
        const back = await inventoryMetaCandidates(actor, {
          tableId,
          country: "EC",
          aliasId,
        });
        assert.equal(back.context.advisorId, first.id);
        assert.equal(back.context.currency, "PEN");
        assert.deepEqual(back.campaigns, []);
      },
    );
    await t.test(
      "Misma identidad se reutiliza; guardado de contexto no reactiva ni altera ventas",
      async () => {
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId, country: "EC" },
        });
        await db.metaEffectivenessDay.create({
          data: {
            rowId: row.id,
            day: "2026-11-03",
            sales: 3,
            salesOverridden: true,
          },
        });
        await db.metaEffectivenessState.create({
          data: { aliasId, country: "EC", active: false },
        });
        const days = await db.metaEffectivenessDay.findMany({
            where: { rowId: row.id },
          }),
          context = await metaAssignmentContext(actor, {
            tableId,
            country: "EC",
            aliasId,
          });
        await assignAliases(
          actor,
          [],
          aliasId,
          "EC",
          first.id,
          undefined,
          "PEN",
          context,
          true,
        );
        assert.equal(
          await db.metaAlias.count({ where: { tableId, name: item.name } }),
          1,
        );
        assert.deepEqual(
          await db.metaEffectivenessDay.findMany({ where: { rowId: row.id } }),
          days,
        );
        assert.equal(
          (
            await db.metaEffectivenessState.findFirstOrThrow({
              where: { aliasId },
            })
          ).active,
          false,
        );
        assert.equal(
          await db.metaEffectivenessEvent.count({
            where: { state: { aliasId } },
          }),
          0,
        );
        const report = await inventoryActivationReport(actor, {
          listId,
          tableIds: tableId,
          byCountry: "true",
        });
        assert(
          report.rows.find((r) => r.name === item.name)?.synchronizationReady,
        );
      },
    );
    await t.test(
      "Sin recibo, sin modo explícito o sin permiso no se admite una lista vacía",
      async () => {
        await assert.rejects(assignAliases(actor, [], aliasId, "EC"));
        await assert.rejects(
          req({ inventorySync: true, objectIds: [], aliasId, country: "EC" }),
        );
        await assert.rejects(
          req(
            {
              inventorySync: true,
              objectIds: [],
              aliasId,
              country: "EC",
              assignmentContext: {
                aliasId,
                tableId,
                country: "EC",
                revision: 0,
              },
            },
            { id: viewer, role: "OBSERVER" },
          ),
        );
      },
    );
    await db.metaConnection.create({
      data: { id: cid, ownerId: uid, name: tag, transport: "API" },
    });
    await db.metaAdAccount.create({
      data: {
        id: aid,
        connectionId: cid,
        name: tag,
        currency: "PEN",
        timezone: "America/Lima",
        enabled: false,
      },
    });
    const metaAlias = await db.metaAlias.create({
        data: { tableId, inventorySheetId: listId, name: "Origen Meta " + tag },
      }),
      objectId = aid + "11";
    await db.metaAdObject.create({
      data: {
        id: objectId,
        accountId: aid,
        level: "campaign",
        name: tag,
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        aliasId: metaAlias.id,
        aliasCountry: "EC",
        advisorId: first.id,
      },
    });
    await t.test(
      "Asesor único guardado en Meta se precarga y no cruza países",
      async () => {
        const context = await metaAssignmentContext(actor, {
          tableId,
          country: "EC",
          aliasId: metaAlias.id,
        });
        assert.equal(context.source, "meta");
        assert.equal(context.advisorId, first.id);
        assert.equal(context.metaAdvisorId, first.id);
        assert(!context.hasRow);
        assert.equal(
          (
            await metaAssignmentContext(actor, {
              tableId,
              country: "PE",
              aliasId: metaAlias.id,
            })
          ).advisorId,
          null,
        );
        const before = await db.metaAdObject.findUniqueOrThrow({
          where: { id: objectId },
        });
        await assignAliases(
          actor,
          [],
          metaAlias.id,
          "EC",
          first.id,
          undefined,
          "PEN",
          context,
          true,
        );
        assert.deepEqual(
          await db.metaAdObject.findUniqueOrThrow({ where: { id: objectId } }),
          before,
        );
      },
    );
    await t.test(
      "Diferencias Meta/hoja son explícitas; propuesta conserva titular y datos",
      async () => {
        await db.metaAdObject.update({
          where: { id: objectId },
          data: { advisorId: second.id },
        });
        const context = await metaAssignmentContext(actor, {
          tableId,
          country: "EC",
          aliasId: metaAlias.id,
        });
        assert.equal(context.advisorId, first.id);
        assert(
          context.advisorConflicts.some(
            (a) => a.source === "Meta Ads" && a.advisorId === second.id,
          ),
        );
        const result = await assignAliases(
          actor,
          [],
          metaAlias.id,
          "EC",
          second.id,
          undefined,
          "PEN",
          context,
          true,
        );
        assert(result.advisorReview);
        assert.equal(
          (
            await db.metaEffectivenessRow.findFirstOrThrow({
              where: { aliasId: metaAlias.id, country: "EC" },
            })
          ).advisorId,
          first.id,
        );
        assert.equal(
          (await db.metaAdObject.findUniqueOrThrow({ where: { id: objectId } }))
            .advisorId,
          second.id,
        );
      },
    );
    await t.test(
      "Recibo de origen Meta obsoleto impide materializar con el asesor equivocado",
      async () => {
        const a = await db.metaAlias.create({
          data: { tableId, inventorySheetId: listId, name: "CAS Meta " + tag },
        });
        await db.metaAdObject.update({
          where: { id: objectId },
          data: { aliasId: a.id, advisorId: first.id },
        });
        const context = await metaAssignmentContext(actor, {
          tableId,
          country: "EC",
          aliasId: a.id,
        });
        await db.metaAdObject.update({
          where: { id: objectId },
          data: { advisorId: second.id },
        });
        await assert.rejects(
          assignAliases(
            actor,
            [],
            a.id,
            "EC",
            first.id,
            undefined,
            "PEN",
            context,
            true,
          ),
          /Meta Ads cambió/,
        );
        assert.equal(
          await db.metaEffectivenessRow.count({ where: { aliasId: a.id } }),
          0,
        );
        assert.equal(calls, 0);
      },
    );
  } finally {
    globalThis.fetch = original;
    await db.metaAdAccount.deleteMany({ where: { id: aid } });
    await db.metaConnection.deleteMany({ where: { id: cid } });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: listId } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: listId } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: listId } });
    await db.metaEffectivenessSheet.deleteMany({ where: { id: listId } });
    await db.metaAliasTable.deleteMany({ where: { id: tableId } });
    await db.metaAdvisor.deleteMany({ where: { sheetId: peopleId } });
    await db.metaEffectivenessSheet.deleteMany({ where: { id: peopleId } });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: [uid, viewer] } },
    });
    await db.user.deleteMany({ where: { id: { in: [uid, viewer] } } });
    await db.$disconnect();
  }
});
