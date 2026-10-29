import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { metaRoutes } from "../lib/meta-ads/routes";
import {
  saveFinancialSharing,
  readFinancialSharing,
  authorizeFinancialRequest,
  checkFinancialContext,
} from "../lib/meta-ads/financial-access";
test("Compartir Efectividad por módulo y documento no expone otras hojas", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const oldGrants = await db.effectivenessGrant.findMany(),
    oldState = await db.effectivenessSharing.findMany(),
    tag = randomUUID(),
    hash = await argon2.hash("Efectividad-compartir-0123456789");
  const users = await Promise.all(
    (["OWNER", "USER", "USER", "OBSERVER", "USER"] as const).map((role, i) =>
      db.user.create({
        data: {
          role,
          status: "APPROVED",
          name: `QA hojas ${i} ${tag}`,
          email: `financial-share-${i}-${tag}@example.test`,
          passwordHash: hash,
        },
      }),
    ),
  );
  const [owner, editor, viewer, allViewer, none] = users,
    ids = users.map((u) => u.id);
  const lists = await Promise.all(
      [0, 1].map((i) =>
        db.metaEffectivenessSheet.create({
          data: { kind: "INVENTORY", name: `QA Inventario ${i} ${tag}` },
        }),
      ),
    ),
    tables = await Promise.all(
      [0, 1].map((i) =>
        db.metaAliasTable.create({
          data: {
            name: `QA Hoja ${i} ${tag}`,
            defaultCountry: "PE",
            defaultCurrency: "PEN",
          },
        }),
      ),
    );
  const items = await Promise.all(
      lists.map((l, i) =>
        db.metaInventoryItem.create({
          data: { sheetId: l.id, name: `Curso privado ${i} ${tag}` },
        }),
      ),
    ),
    aliases = await Promise.all(
      tables.map((table, i) =>
        db.metaAlias.create({
          data: {
            tableId: table.id,
            name: items[i].name,
            inventorySheetId: lists[i].id,
          },
        }),
      ),
    );
  for (const a of aliases)
    await db.metaEffectivenessRow.create({
      data: {
        aliasId: a.id,
        country: "PE",
        currency: "PEN",
        displayCurrency: "PEN",
        days: {
          create: { day: "2026-10-28", sales: 5, salesOverridden: true },
        },
      },
    });
  const extraAlias = await db.metaAlias.create({
    data: {
      tableId: tables[0].id,
      inventorySheetId: lists[1].id,
      name: "Alias oculto de otro inventario " + tag,
    },
  });
  const advisorLists = await Promise.all(
    [0, 1].map((i) =>
      db.metaEffectivenessSheet.create({
        data: { kind: "ADVISORS", name: `QA asesores privados ${i} ${tag}` },
      }),
    ),
  );
  const people = await Promise.all(
    advisorLists.map((l, i) =>
      db.metaAdvisor.create({
        data: { sheetId: l.id, name: `Asesor privado ${i} ${tag}` },
      }),
    ),
  );
  const totals = await db.metaEffectivenessSheet.create({
    data: {
      kind: "TOTALS",
      name: "QA Totales " + tag,
      config: { selected: [tables[0].id] },
    },
  });
  const share = async (
    scope: string,
    grants: { userId: string; permission: "VIEW" | "EDIT" }[],
  ) =>
    saveFinancialSharing(owner, {
      scope,
      revision: (await readFinancialSharing(owner, scope)).revision,
      grants,
    });
  const call = (
    actor: { id: string; role: string },
    path: string,
    method = "GET",
    body: unknown = {},
    scope?: string,
  ) =>
    metaRoutes(
      new NextRequest("http://localhost/api/meta-ads/" + path, {
        method,
        headers: scope ? { "x-effectiveness-document": scope } : {},
      }),
      ["meta-ads", ...path.split("?")[0].split("/")],
      actor,
      async () => body,
    );
  const fail = (p: Promise<unknown>, status: number) =>
    assert.rejects(p, (e: any) => e.status === status);
  try {
    await t.test(
      "OWNER comparte documento; nadie más delega ni gana rol general",
      async () => {
        await fail(readFinancialSharing(editor, "ALL"), 403);
        await share("TAB:" + lists[0].id, [
          { userId: editor.id, permission: "EDIT" },
          { userId: viewer.id, permission: "VIEW" },
        ]);
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: editor.id } })).role,
          "USER",
        );
        await fail(call(none, "financial/workbook-sheets"), 403);
      },
    );
    await t.test(
      "Solo se listan las pestañas compartidas, no otros inventarios ni conexiones de Meta",
      async () => {
        const listed = await (
          await call(viewer, "financial/workbook-sheets")
        ).json();
        assert.deepEqual(
          listed.map((x: any) => x.id),
          [lists[0].id],
        );
        const data = await (
          await call(
            viewer,
            "financial/inventory/categories?listId=" + lists[0].id,
            "GET",
            {},
            "TAB:" + lists[0].id,
          )
        ).json();
        assert(JSON.stringify(data).includes(items[0].name));
        assert(!JSON.stringify(data).includes(items[1].name));
        const lookup = await (await call(viewer, "financial/aliases")).json();
        assert(lookup.some((a: any) => a.id === aliases[0].id));
        assert(!lookup.some((a: any) => a.id === extraAlias.id));
        const source = await (
          await call(viewer, "financial/alias-tables")
        ).json();
        assert(source.some((t: any) => t.id === tables[0].id));
        assert(!JSON.stringify(source).includes(extraAlias.name));
        await fail(
          call(
            viewer,
            "financial/inventory/categories?listId=" + lists[1].id,
            "GET",
            {},
            "TAB:" + lists[0].id,
          ),
          403,
        );
        await fail(
          call(
            viewer,
            "financial/connections",
            "GET",
            {},
            "TAB:" + lists[0].id,
          ),
          403,
        );
        await fail(
          call(viewer, "inventory/categories?listId=" + lists[0].id),
          403,
        );
      },
    );
    await t.test(
      "Editor modifica su inventario; viewer no escribe y una cabecera manipulada no amplía permisos",
      async () => {
        const body = {
          listId: lists[0].id,
          revision: 0,
          action: "IMPORT",
          rows: [{ primary: "QA categoría " + tag, secondary: "" }],
          targetIds: [items[0].id, aliases[0].id],
        };
        await fail(
          call(
            viewer,
            "financial/inventory/categories",
            "POST",
            body,
            "TAB:" + lists[0].id,
          ),
          403,
        );
        assert.equal(
          (
            await call(
              editor,
              "financial/inventory/categories",
              "POST",
              body,
              "TAB:" + lists[0].id,
            )
          ).status,
          200,
        );
        await fail(
          call(
            editor,
            "financial/inventory/categories?listId=" + lists[1].id,
            "GET",
            {},
            "TAB:" + lists[1].id,
          ),
          403,
        );
        await fail(
          call(
            editor,
            "financial/inventory/categories",
            "POST",
            { ...body, listId: lists[1].id },
            "TAB:" + lists[0].id,
          ),
          403,
        );
        await fail(
          call(
            editor,
            "financial/workbook-sheets",
            "POST",
            { kind: "INVENTORY" },
            "TAB:" + lists[0].id,
          ),
          403,
        );
      },
    );
    await t.test(
      "Hoja financiera individual permite su tabla y sus datos; bloquea inventarios de otras tablas",
      async () => {
        await share("TABLE:" + tables[0].id, [
          { userId: viewer.id, permission: "VIEW" },
          { userId: editor.id, permission: "EDIT" },
        ]);
        const rows = await (
          await call(viewer, "financial/alias-tables")
        ).json();
        assert.deepEqual(
          rows.map((x: any) => x.id),
          [tables[0].id],
        );
        assert.equal(
          (
            await call(
              viewer,
              `financial/effectiveness?tableId=${tables[0].id}&since=2026-10-28&until=2026-10-28`,
              "GET",
              {},
              "TABLE:" + tables[0].id,
            )
          ).status,
          200,
        );
        await fail(
          call(
            viewer,
            `financial/effectiveness?tableId=${tables[1].id}&since=2026-10-28&until=2026-10-28`,
            "GET",
            {},
            "TABLE:" + tables[0].id,
          ),
          403,
        );
        await fail(
          call(
            editor,
            "financial/effectiveness/history?aliasId=" +
              aliases[1].id +
              "&country=PE",
            "GET",
            {},
            "TABLE:" + tables[0].id,
          ),
          403,
        );
        assert.equal(
          (
            await call(
              editor,
              "financial/alias-tables/" + tables[0].id,
              "PATCH",
              { name: "QA Renombrada " + tag },
              "TABLE:" + tables[0].id,
            )
          ).status,
          200,
        );
        await fail(
          call(
            editor,
            "financial/alias-tables/" + tables[1].id,
            "PATCH",
            { name: "No debe cambiar" },
            "TABLE:" + tables[0].id,
          ),
          403,
        );
      },
    );
    await t.test(
      "Totales compartido solo lee sus fuentes configuradas; no concede otras pestañas",
      async () => {
        await share("TAB:" + totals.id, [
          { userId: viewer.id, permission: "VIEW" },
        ]);
        assert.equal(
          (
            await call(
              viewer,
              `financial/effectiveness/totals?sheetId=${totals.id}&tableId=${tables[0].id}&since=2026-10-28&until=2026-10-28`,
              "GET",
              {},
              "TAB:" + totals.id,
            )
          ).status,
          200,
        );
        await fail(
          call(
            viewer,
            `financial/effectiveness/totals?sheetId=${totals.id}&tableId=${tables[1].id}&since=2026-10-28&until=2026-10-28`,
            "GET",
            {},
            "TAB:" + totals.id,
          ),
          403,
        );
      },
    );
    await t.test(
      "Una pestaña de asesores no permite leer otras personas ni fuentes financieras completas",
      async () => {
        await share("TAB:" + advisorLists[0].id, [
          { userId: viewer.id, permission: "VIEW" },
        ]);
        const own = await (
          await call(
            viewer,
            `financial/advisors/sheet?advisorListId=${advisorLists[0].id}&tableId=${tables[0].id}&since=2026-10-28&until=2026-10-28`,
            "GET",
            {},
            "TAB:" + advisorLists[0].id,
          )
        ).json();
        assert(JSON.stringify(own).includes(people[0].name));
        assert(!JSON.stringify(own).includes(people[1].name));
        await fail(
          call(
            viewer,
            `financial/advisors/sheet?advisorListId=${advisorLists[1].id}&tableId=${tables[0].id}&since=2026-10-28&until=2026-10-28`,
            "GET",
            {},
            "TAB:" + advisorLists[0].id,
          ),
          403,
        );
        await fail(
          call(
            viewer,
            `financial/effectiveness?tableId=${tables[0].id}&since=2026-10-28&until=2026-10-28`,
            "GET",
            {},
            "TAB:" + advisorLists[0].id,
          ),
          403,
        );
      },
    );
    await t.test(
      "Acceso global hereda todas las hojas; permiso por documento puede elevar consulta a edición",
      async () => {
        await share("ALL", [
          { userId: allViewer.id, permission: "VIEW" },
          { userId: editor.id, permission: "EDIT" },
        ]);
        const list = await (
          await call(allViewer, "financial/workbook-sheets")
        ).json();
        assert(list.some((x: any) => x.id === lists[1].id));
        await fail(
          call(
            allViewer,
            "financial/alias-tables/" + tables[0].id,
            "PATCH",
            { name: "No" },
            "TABLE:" + tables[0].id,
          ),
          403,
        );
        await share("TAB:" + lists[1].id, [
          { userId: allViewer.id, permission: "EDIT" },
        ]);
        const doc = await readFinancialSharing(owner, "TAB:" + lists[1].id);
        assert(
          doc.inherited.some(
            (x) => x.userId === allViewer.id && x.permission === "VIEW",
          ),
        );
        const raw = {
          listId: lists[1].id,
          revision: 0,
          action: "IMPORT",
          rows: [{ primary: "QA otra " + tag, secondary: "" }],
        };
        assert.equal(
          (
            await call(
              allViewer,
              "financial/inventory/categories",
              "POST",
              raw,
              "TAB:" + lists[1].id,
            )
          ).status,
          200,
        );
        await db.metaWorkspaceGrant.create({
          data: {
            userId: editor.id,
            grantedById: owner.id,
            permission: "VIEW",
          },
        });
        assert.equal(
          (
            await call(
              editor,
              "financial/alias-tables/" + tables[0].id,
              "PATCH",
              { name: "QA Independiente " + tag },
              "TABLE:" + tables[0].id,
            )
          ).status,
          200,
        );
        await db.metaWorkspaceGrant.delete({ where: { userId: editor.id } });
      },
    );
    await t.test(
      "Revocar o degradar invalida también una autorización de escritura anterior",
      async () => {
        const actor = await authorizeFinancialRequest(
          editor,
          "inventory/categories",
          "POST",
          new URLSearchParams(),
          {},
          "TAB:" + lists[0].id,
        );
        await share("ALL", []);
        await share("TAB:" + lists[0].id, [
          { userId: editor.id, permission: "VIEW" },
        ]);
        await fail(checkFinancialContext(actor), 403);
        await fail(
          call(
            editor,
            "financial/inventory/categories",
            "POST",
            {
              listId: lists[0].id,
              revision: 1,
              action: "IMPORT",
              rows: [{ primary: "No", secondary: "" }],
            },
            "TAB:" + lists[0].id,
          ),
          403,
        );
        await fail(
          call(
            viewer,
            "financial/objects/123/status",
            "POST",
            {},
            "TABLE:" + tables[0].id,
          ),
          403,
        );
      },
    );
  } finally {
    await db.metaWorkspaceGrant.deleteMany({ where: { userId: { in: ids } } });
    await db.effectivenessGrant.deleteMany({});
    if (oldGrants.length)
      await db.effectivenessGrant.createMany({ data: oldGrants });
    await db.effectivenessSharing.deleteMany({});
    if (oldState.length)
      await db.effectivenessSharing.createMany({ data: oldState });
    await db.metaEffectivenessRow.deleteMany({
      where: { aliasId: { in: aliases.map((a) => a.id) } },
    });
    await db.metaAlias.deleteMany({
      where: { tableId: { in: tables.map((t) => t.id) } },
    });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((x) => x.id) } },
    });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: lists.map((x) => x.id) } },
    });
    await db.metaAdvisor.deleteMany({
      where: { id: { in: people.map((p) => p.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: {
        id: {
          in: [
            ...lists.map((x) => x.id),
            ...advisorLists.map((x) => x.id),
            totals.id,
          ],
        },
      },
    });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
