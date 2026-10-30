import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  previewDeleteEffectivenessRows,
  deleteEffectivenessRows,
} from "../lib/meta-ads/delete-effectiveness-rows";
import {
  inventoryActivationAddSheet,
  inventoryActivationChange,
  inventoryActivationReport,
} from "../lib/meta-ads/inventory-sheet-activation";
import {
  effectiveness,
  importEffectiveness,
} from "../lib/meta-ads/effectiveness";
import { effectivenessDetail } from "../lib/meta-ads/effectiveness-detail";
import { setEffectivenessState } from "../lib/meta-ads/effectiveness-controls";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
import { aliasTables } from "../lib/meta-ads/aliases";
test("Retirar de hoja desactiva sin borrar ventas/historial; apagar conserva pin y presencia coherente", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    today = limaDay(),
    yesterday = new Date(Date.parse(today) - 86400000)
      .toISOString()
      .slice(0, 10);
  const user = await db.user.create({
    data: {
      name: "QA retiro " + tag,
      email: "retirement-" + tag + "@example.test",
      passwordHash: "synthetic",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const actor = { id: user.id, role: "OWNER" },
    list = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "Retiro " + tag },
    }),
    table = await db.metaAliasTable.create({
      data: {
        name: "Perú retiro " + tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    });
  try {
    await inventoryActivationAddSheet(actor, {
      listId: list.id,
      tableId: table.id,
      country: "PE",
    });
    const names = ["A " + tag, "B " + tag];
    await db.metaInventoryItem.createMany({
      data: names.map((name) => ({ sheetId: list.id, name })),
    });
    for (const name of names)
      await inventoryActivationChange(actor, {
        listId: list.id,
        tableId: table.id,
        country: "PE",
        items: [{ name, targets: [] }],
        active: true,
      });
    assert.equal(
      (await aliasTables(actor)).find((t) => t.id === table.id)!
        .visibleAliasCount,
      2,
    );
    const aliases = await db.metaAlias.findMany({
      where: { tableId: table.id },
      orderBy: { name: "asc" },
    });
    for (const [n, a] of aliases.entries()) {
      const row = await db.metaEffectivenessRow.findFirstOrThrow({
        where: { aliasId: a.id, country: "PE" },
      });
      await db.metaEffectivenessDay.createMany({
        data: [
          {
            rowId: row.id,
            day: yesterday,
            sales: 0,
            salesOverridden: true,
            annotations: { budget: { value: 25, currency: "PEN" } },
          },
          {
            rowId: row.id,
            day: today,
            sales: n ? 3 : 5,
            salesOverridden: true,
            annotations: { budget: { value: 25, currency: "PEN" } },
          },
        ],
      });
      const state = await db.metaEffectivenessState.findUniqueOrThrow({
        where: { aliasId_country: { aliasId: a.id, country: "PE" } },
      });
      await db.metaEffectivenessEvent.updateMany({
        where: { stateId: state.id },
        data: { createdAt: new Date(yesterday + "T05:00:00Z") },
      });
    }
    await inventoryActivationAddSheet(actor, {
      listId: list.id,
      tableId: table.id,
      country: "EC",
    });
    await inventoryActivationChange(actor, {
      listId: list.id,
      tableId: table.id,
      country: "EC",
      items: [{ name: names[0], targets: [] }],
      active: true,
    });
    const read = () =>
      inventoryActivationReport(actor, {
        listId: list.id,
        tableIds: table.id,
        byCountry: "true",
      });
    const request = {
      tableId: table.id,
      since: yesterday,
      until: today,
      targets: aliases.map((a) => ({ aliasId: a.id, country: "PE" })),
    };
    const review = await previewDeleteEffectivenessRows(actor, request),
      beforeDays = await db.metaEffectivenessDay.findMany({
        where: { row: { alias: { tableId: table.id } } },
        orderBy: [{ rowId: "asc" }, { day: "asc" }],
      });
    await db.metaEffectivenessDay.updateMany({
      where: { row: { aliasId: aliases[1].id, country: "PE" }, day: today },
      data: { revision: { increment: 1 } },
    });
    await assert.rejects(
      () => deleteEffectivenessRows(actor, { ...request, token: review.token }),
      /cambiaron/i,
    );
    assert(
      (await read()).rows
        .filter((r) => r.country === "PE")
        .every((r) => r.activation === "ACTIVE"),
    );
    const fresh = await previewDeleteEffectivenessRows(actor, request);
    await deleteEffectivenessRows(actor, { ...request, token: fresh.token });
    const after = (await read()).rows;
    assert(
      after
        .filter((r) => r.country === "PE")
        .every(
          (r) =>
            r.activation === "INACTIVE" &&
            !r.pinned &&
            !r.campaignTasks.length &&
            r.usage !== "NEVER",
        ),
    );
    assert.equal(after.find((r) => r.country === "EC")!.activation, "ACTIVE");
    assert.equal(
      (await effectiveness(actor, table.id, yesterday, today)).rows.filter(
        (r) => r.country === "PE",
      ).length,
      0,
    );
    assert.equal(
      await db.metaEffectivenessDay.count({
        where: { row: { alias: { tableId: table.id } } },
      }),
      beforeDays.length,
    );
    for (const a of aliases) {
      const detail = await effectivenessDetail(actor, {
        aliasId: a.id,
        country: "PE",
        since: yesterday,
        until: today,
      });
      assert.equal(detail.active, false);
      assert.equal(detail.activePeriods.length, 1);
      assert.equal(detail.removals.length, 1);
      assert.equal(detail.removals[0].sales, a.id === aliases[0].id ? 5 : 3);
      assert.equal(detail.lifetime.sales, a.id === aliases[0].id ? 5 : 3);
    }
    const dir = await aliasTables(actor),
      dirAliases = dir.flatMap((t) => t.aliases);
    assert.equal(dir.find((t) => t.id === table.id)!.visibleAliasCount, 1);
    assert.equal(dir.find((t) => t.id === table.id)!.aliases.length, 2);
    assert.equal(
      dirAliases.find((a) => a.id === aliases[1].id)?.detached,
      true,
    );
    assert.notEqual(
      dirAliases.find((a) => a.id === aliases[0].id)?.detached,
      true,
    ); // Ecuador remains visible.
    await importEffectiveness(
      actor,
      table.id,
      [{ name: names[1], country: "PE", currency: "PEN" }],
      undefined,
      undefined,
      list.id,
      undefined,
      false,
    );
    let row = (
      await effectiveness(actor, table.id, yesterday, today)
    ).rows.find((r) => r.aliasId === aliases[1].id && r.country === "PE")!;
    assert.equal(row.days[today].sales, 3);
    assert.equal(row.active, false);
    await setEffectivenessState(actor, {
      tableId: table.id,
      aliasId: row.aliasId,
      country: "PE",
      active: true,
      revision: row.stateRevision,
      since: yesterday,
      until: today,
      metrics: ["sales", "budget"],
    });
    row = (await effectiveness(actor, table.id, yesterday, today)).rows.find(
      (r) => r.aliasId === aliases[1].id && r.country === "PE",
    )!;
    await setEffectivenessState(actor, {
      tableId: table.id,
      aliasId: row.aliasId,
      country: "PE",
      active: false,
      revision: row.stateRevision,
      since: yesterday,
      until: today,
      metrics: ["sales", "budget"],
    });
    let point = (await read()).rows.find(
      (r) => r.name === names[1] && r.country === "PE",
    )!;
    assert.equal(
      (await aliasTables(actor)).find((t) => t.id === table.id)!
        .visibleAliasCount,
      2,
    );
    assert.equal(point.pinned, true);
    assert.equal(point.activation, "INACTIVE");
    assert(
      (await effectiveness(actor, table.id, yesterday, today)).rows.some(
        (r) => r.aliasId === aliases[1].id && r.country === "PE" && !r.active,
      ),
    );
    await inventoryActivationChange(actor, {
      listId: list.id,
      tableId: table.id,
      country: "PE",
      items: [{ name: names[1], targets: point.targets }],
      pinned: false,
    });
    assert(
      !(await effectiveness(actor, table.id, yesterday, today)).rows.some(
        (r) => r.aliasId === aliases[1].id && r.country === "PE",
      ),
    );
    assert.equal(
      (await aliasTables(actor))
        .flatMap((t) => t.aliases)
        .find((a) => a.id === aliases[1].id)?.detached,
      true,
    );
    point = (await read()).rows.find(
      (r) => r.name === names[1] && r.country === "PE",
    )!;
    assert.notEqual(point.usage, "NEVER");

    // A hidden stub left by the old destructive route must not return to Top as implicitly active.
    await db.metaEffectivenessEvent.deleteMany({
      where: { state: { aliasId: aliases[1].id, country: "PE" } },
    });
    await db.metaEffectivenessState.deleteMany({
      where: { aliasId: aliases[1].id, country: "PE" },
    });
    await db.metaEffectivenessDay.deleteMany({
      where: { row: { aliasId: aliases[1].id, country: "PE" } },
    });
    const currentList = await db.metaEffectivenessSheet.findUniqueOrThrow({
      where: { id: list.id },
    });
    const config = currentList.config as any;
    config.inventoryActivation.detachedAliases = [];
    config.inventoryActivation.rows[aliases[1].id + "|PE"] = {
      pinned: false,
      campaignTask: "CREATE",
    };
    await db.metaEffectivenessSheet.update({
      where: { id: list.id },
      data: { config },
    });
    await db.auditEvent.create({
      data: {
        actorId: actor.id,
        resourceId: table.id,
        action: "META_EFECTIVIDAD_FILAS_ELIMINADAS",
        detail: {
          targets: [{ aliasId: aliases[1].id, country: "PE" }],
          counts: { events: 2 },
        },
      },
    });
    point = (await read()).rows.find(
      (r) => r.name === names[1] && r.country === "PE",
    )!;
    assert.equal(point.activation, "INACTIVE");
    assert.deepEqual(point.campaignTasks, []);
    assert.equal(point.usage, "UNKNOWN");
    assert.equal(
      (await aliasTables(actor))
        .flatMap((t) => t.aliases)
        .find((a) => a.id === aliases[1].id)?.detached,
      true,
    );
    const old = await effectivenessDetail(actor, {
      aliasId: aliases[1].id,
      country: "PE",
      since: yesterday,
      until: today,
    });
    assert.equal(old.active, false);
    assert.equal(old.legacyHistoryUnavailable, true);
    assert.equal(old.removals[0].sales, null);
    const ecuador = (await read()).rows.find(
      (r) => r.name === names[0] && r.country === "EC",
    )!;
    await inventoryActivationChange(actor, {
      listId: list.id,
      tableId: table.id,
      country: "EC",
      items: [{ name: names[0], targets: ecuador.targets }],
      active: false,
      pinned: false,
    });
    const empty = (await aliasTables(actor)).find((t) => t.id === table.id)!;
    assert.equal(empty.visibleAliasCount, 0);
    assert.equal(empty.aliases.length, 2);
    assert.equal(
      (await effectiveness(actor, table.id, yesterday, today)).rows.length,
      0,
    );
    assert.equal(
      (
        await effectivenessDetail(actor, {
          aliasId: aliases[0].id,
          country: "PE",
          since: yesterday,
          until: today,
        })
      ).lifetime.sales,
      5,
    );
  } finally {
    await db.metaEffectivenessEvent.deleteMany({
      where: { state: { alias: { tableId: table.id } } },
    });
    await db.metaEffectivenessState.deleteMany({
      where: { alias: { tableId: table.id } },
    });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { tableId: table.id } },
    });
    await db.metaAlias.deleteMany({ where: { tableId: table.id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.auditEvent.deleteMany({ where: { actorId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
