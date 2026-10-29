import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { db } from "../lib/db";
import {
  readSyllabi,
  saveSyllabi,
  previewCatalogPackage,
  importCatalogPackage,
} from "../lib/meta-ads/inventory-syllabi";
import { inventoryCategories } from "../lib/meta-ads/inventory-categories";
import { catalogPackageSchema } from "../lib/meta-ads/inventory-syllabi-policy";
import {
  renameInventoryGroup,
  previewRemoveInventory,
  removeInventory,
} from "../lib/meta-ads/inventory-catalog";
const root = process.env.TEST_APP_URL ?? "http://localhost:3074";
class Client {
  cookie = "";
  async call(path: string, method = "GET", body?: unknown) {
    const r = await fetch(root + "/api/" + path, {
      method,
      headers: {
        Cookie: this.cookie,
        ...(method === "GET"
          ? {}
          : { Origin: root, "Content-Type": "application/json" }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const c = r.headers.get("set-cookie");
    if (c) this.cookie = c.split(";")[0];
    return { status: r.status, body: await r.json() };
  }
}
test("Inventario: carga privada, temarios y concurrencia sin cambiar hojas financieras", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID(),
    password = "Prueba-segura-0123456789",
    hash = await argon2.hash(password);
  const owner = await db.user.create({
    data: {
      name: "Owner catálogo prueba",
      email: `catalog-owner-${tag}@example.test`,
      passwordHash: hash,
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const user = await db.user.create({
    data: {
      name: "Usuario catálogo prueba",
      email: `catalog-user-${tag}@example.test`,
      passwordHash: hash,
      status: "APPROVED",
    },
  });
  const actor = { id: owner.id, role: owner.role },
    reader = { id: user.id, role: user.role };
  const outline = {
    id: "synthetic-outline",
    title: "Todo el mundo 1",
    scope: "Todo el mundo",
    content: "Unidad uno\nUnidad dos",
  };
  const p = catalogPackageSchema.parse({
    format: "inventario-catalog-v1",
    targetName: "Catálogo prueba " + tag,
    categories: ["Educación"],
    items: [
      {
        name: "Curso sintético",
        primary: "Educación",
        secondary: ["Gestión empresarial"],
        syllabi: [outline],
      },
    ],
  });
  let listId = "";
  const financeBefore = {
    aliases: await db.metaAlias.count(),
    days: await db.metaEffectivenessDay.count(),
    tables: await db.metaAliasTable.count(),
  };
  await t.test(
    "Permisos antes de leer y escribir, previsualización sin mutaciones",
    async () => {
      await assert.rejects(
        () => previewCatalogPackage(reader, p),
        /permiso|autoriz|exclusiva del OWNER/i,
      );
      const preview = await previewCatalogPackage(actor, p);
      assert.equal(preview.newItems, 1);
      assert.equal(preview.createTarget, true);
      assert.equal(
        await db.metaEffectivenessSheet.count({
          where: { name: p.targetName },
        }),
        0,
      );
      await assert.rejects(
        () =>
          importCatalogPackage(reader, { package: p, token: preview.token }),
        /permiso|autoriz|exclusiva del OWNER/i,
      );
      const result = await importCatalogPackage(actor, {
        package: p,
        token: preview.token,
      });
      listId = result.listId;
      assert.equal(result.created, 1);
      assert.equal(result.addedSyllabi, 1);
      await assert.rejects(
        () => readSyllabi(reader, listId, p.items[0].name),
        /permiso|autoriz|exclusiva del OWNER/i,
      );
    },
  );
  await t.test(
    "Metadatos compactos, categorías y Hojas vacías; repetir sin duplicar",
    async () => {
      const meta = await inventoryCategories(actor, listId);
      assert.equal(meta.items.length, 1);
      assert.equal(meta.items[0].syllabi[0].scope, outline.scope);
      assert(!("content" in meta.items[0].syllabi[0]));
      assert.equal(
        await db.metaAlias.count({ where: { inventorySheetId: listId } }),
        0,
      );
      assert.equal(meta.categories.length, 2);
      assert.equal(meta.assignments[meta.items[0].id].length, 2);
      const preview = await previewCatalogPackage(actor, p);
      const result = await importCatalogPackage(actor, {
        package: p,
        token: preview.token,
      });
      assert.equal(result.created, 0);
      assert.equal(result.addedSyllabi, 0);
    },
  );
  await t.test(
    "Edición conserva versiones, rechaza revisiones antiguas y no sobrescribe al importar",
    async () => {
      const old = await readSyllabi(actor, listId, p.items[0].name),
        second = {
          ...outline,
          id: "second",
          title: "Perú 1",
          scope: "Perú",
          content: "Contenido Perú",
        };
      const saved = await saveSyllabi(actor, {
        listId,
        name: p.items[0].name,
        revision: old.revision,
        syllabi: [
          { ...outline, content: "Contenido editado por propietario" },
          second,
        ],
      });
      assert.equal(saved.syllabi.length, 2);
      await assert.rejects(
        () =>
          saveSyllabi(actor, {
            listId,
            name: p.items[0].name,
            revision: old.revision,
            syllabi: [],
          }),
        /cambiaron/i,
      );
      const preview = await previewCatalogPackage(actor, p);
      await importCatalogPackage(actor, { package: p, token: preview.token });
      const again = await readSyllabi(actor, listId, p.items[0].name);
      assert.equal(
        again.syllabi[0].content,
        "Contenido editado por propietario",
      );
      assert.equal(again.syllabi.length, 2);
      await saveSyllabi(actor, {
        listId,
        name: p.items[0].name,
        revision: again.revision,
        syllabi: again.syllabi.filter((s) => s.id !== "second"),
      });
      assert.equal(
        (await readSyllabi(actor, listId, p.items[0].name)).syllabi.length,
        1,
      );
    },
  );
  await t.test(
    "Vista previa obsoleta tras temario o renombre, sin carga parcial",
    async () => {
      const preview = await previewCatalogPackage(actor, p),
        old = await readSyllabi(actor, listId, p.items[0].name);
      await saveSyllabi(actor, {
        listId,
        name: p.items[0].name,
        revision: old.revision,
        syllabi: old.syllabi,
      });
      await assert.rejects(
        () => importCatalogPackage(actor, { package: p, token: preview.token }),
        /destino cambió/i,
      );
      const fresh = await previewCatalogPackage(actor, p),
        item = await db.metaInventoryItem.findFirstOrThrow({
          where: { sheetId: listId },
        });
      await renameInventoryGroup(actor, {
        listId,
        name: "Curso renombrado",
        expectedName: item.name,
        ids: [item.id],
      });
      await assert.rejects(
        () => importCatalogPackage(actor, { package: p, token: fresh.token }),
        /destino cambió/i,
      );
      assert.equal(
        await db.metaInventoryItem.count({ where: { sheetId: listId } }),
        1,
      );
    },
  );
  await t.test(
    "Conserva categoría principal y revisión de borrado; fallo revierte la carga completa",
    async () => {
      const target = await db.metaEffectivenessSheet.create({
        data: { kind: "INVENTORY", name: "Preservar catálogo " + tag },
      });
      const original = await db.metaInventoryCategory.create({
        data: {
          sheetId: target.id,
          kind: "PRIMARY",
          name: "Categoría previa",
          key: "Categoría previa",
        },
      });
      const item = await db.metaInventoryItem.create({
        data: {
          sheetId: target.id,
          name: "Curso previo",
          categories: { create: { categoryId: original.id } },
        },
      });
      const pack = {
        ...p,
        targetName: target.name,
        items: [{ ...p.items[0], name: item.name }],
      };
      const preview = await previewCatalogPackage(actor, pack);
      await importCatalogPackage(actor, {
        package: pack,
        token: preview.token,
      });
      const meta = await inventoryCategories(actor, target.id);
      assert(meta.assignments[item.id].includes(original.id));
      assert.equal(
        meta.assignments[item.id].filter(
          (id) => meta.categories.find((c) => c.id === id)?.kind === "PRIMARY",
        ).length,
        1,
      );
      const removal = await previewRemoveInventory(actor, item.id),
        old = await readSyllabi(actor, target.id, item.name);
      await saveSyllabi(actor, {
        listId: target.id,
        name: item.name,
        revision: old.revision,
        syllabi: Array.from({ length: 50 }, (_, n) => ({
          ...outline,
          id: "version-" + n,
        })),
      });
      await assert.rejects(
        () => removeInventory(actor, item.id, removal.token),
        /cambiaron/i,
      );
      const countBefore = await db.metaInventoryCategory.count({
        where: { sheetId: target.id },
      });
      const failing = {
        ...pack,
        categories: [...pack.categories, "Categoría prueba rollback"],
        items: [
          {
            ...pack.items[0],
            syllabi: [
              {
                ...outline,
                id: "version-51",
                content: "Versión nueva de prueba 51",
              },
            ],
          },
        ],
      };
      const fresh = await previewCatalogPackage(actor, failing);
      await assert.rejects(() =>
        importCatalogPackage(actor, { package: failing, token: fresh.token }),
      );
      assert.equal(
        await db.metaInventoryCategory.count({ where: { sheetId: target.id } }),
        countBefore,
      );
      assert.equal(
        (await readSyllabi(actor, target.id, item.name)).syllabi.length,
        50,
      );
    },
  );
  const apiOwner = new Client(),
    apiUser = new Client(),
    anon = new Client();
  await t.test(
    "HTTP autenticación, Origin, lectura y validación de cuerpo",
    async () => {
      assert.equal(
        (
          await apiOwner.call("auth/login", "POST", {
            email: owner.email,
            password,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await apiUser.call("auth/login", "POST", {
            email: user.email,
            password,
          })
        ).status,
        200,
      );
      assert.equal(
        (await anon.call("meta-ads/inventory/package/preview", "POST", p))
          .status,
        401,
      );
      assert.equal(
        (await apiUser.call("meta-ads/inventory/package/preview", "POST", p))
          .status,
        403,
      );
      assert.equal(
        (
          await apiOwner.call("meta-ads/inventory/package/preview", "POST", {
            ...p,
            items: [p.items[0], p.items[0]],
          })
        ).status,
        400,
      );
      const bad = await fetch(
        root + "/api/meta-ads/inventory/package/preview",
        {
          method: "POST",
          headers: {
            Cookie: apiOwner.cookie,
            Origin: "https://foreign.example.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(p),
        },
      );
      assert.equal(bad.status, 403);
      const get = await apiOwner.call(
        "meta-ads/inventory/syllabi?" +
          new URLSearchParams({ listId, name: "Curso renombrado" }),
      );
      assert.equal(get.status, 200);
      assert.equal(get.body.syllabi.length, 1);
      assert.equal(
        (
          await apiOwner.call("meta-ads/inventory/syllabi", "PUT", {
            listId,
            name: "Curso renombrado",
            revision: get.body.revision,
            syllabi: get.body.syllabi,
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "Pegar inventario guarda versiones juntas, preserva ediciones y revierte todos los datos ante error",
    async () => {
      const name = "Temarios preparados " + tag,
        versions = [
          { ...outline, id: "prepared-world" },
          {
            ...outline,
            id: "prepared-pe",
            title: "Perú",
            scope: "Perú",
            content: "Contenido propio de Perú",
          },
        ];
      let meta = await inventoryCategories(actor, listId);
      const payload = {
        listId,
        revision: meta.revision,
        rows: [
          {
            name,
            primary: "Educación",
            secondary: "Gestión empresarial",
            sheets: "",
            syllabi: versions,
          },
        ],
      };
      assert.equal(
        (await apiUser.call("meta-ads/inventory/import", "POST", payload))
          .status,
        403,
      );
      const saved = await apiOwner.call(
        "meta-ads/inventory/import",
        "POST",
        payload,
      );
      assert.equal(saved.status, 200);
      assert.equal(saved.body.addedSyllabi, 2);
      const read = await readSyllabi(actor, listId, name);
      assert.equal(read.syllabi.length, 2);
      assert.equal(read.syllabi[1].content, versions[1].content);
      assert.equal(
        (await apiOwner.call("meta-ads/inventory/import", "POST", payload))
          .status,
        409,
      );
      await saveSyllabi(actor, {
        listId,
        name,
        revision: read.revision,
        syllabi: read.syllabi.map((s) =>
          s.id === "prepared-world"
            ? { ...s, title: "Nombre editado", content: "Contenido posterior" }
            : s,
        ),
      });
      meta = await inventoryCategories(actor, listId);
      const repeated = await apiOwner.call(
        "meta-ads/inventory/import",
        "POST",
        { ...payload, revision: meta.revision },
      );
      assert.equal(repeated.status, 200);
      assert.equal(repeated.body.addedSyllabi, 0);
      const kept = await readSyllabi(actor, listId, name);
      assert.equal(kept.syllabi[0].title, "Nombre editado");
      assert.equal(kept.syllabi[0].content, "Contenido posterior");
      assert.equal(kept.syllabi.length, 2);
      meta = await inventoryCategories(actor, listId);
      const before = meta.items.length;
      const invalid = await apiOwner.call("meta-ads/inventory/import", "POST", {
        listId,
        revision: meta.revision,
        rows: [
          {
            name: "No debe quedar " + tag,
            primary: "",
            secondary: "",
            sheets: "",
            syllabi: versions,
          },
          {
            name: "Fallo posterior " + tag,
            primary: "",
            secondary: "",
            sheets: "Hoja inexistente " + tag,
          },
        ],
      });
      assert.equal(invalid.status, 400);
      assert.equal(
        (await inventoryCategories(actor, listId)).items.length,
        before,
      );
      const nameless = await apiOwner.call(
        "meta-ads/inventory/import",
        "POST",
        {
          listId,
          revision: meta.revision,
          rows: [
            {
              name: "",
              primary: "No crear " + tag,
              secondary: "",
              sheets: "",
              syllabi: versions,
            },
          ],
        },
      );
      assert.equal(nameless.status, 400);
      assert.equal(
        await db.metaInventoryCategory.count({
          where: { sheetId: listId, name: "No crear " + tag },
        }),
        0,
      );
    },
  );
  await t.test(
    "Carga de temarios UTF8 supera un megabyte sin ampliar los demás límites",
    async () => {
      const meta = await inventoryCategories(actor, listId),
        rows = Array.from({ length: 2 }, (_, n) => ({
          name: `Temario extenso ${n} ${tag}`,
          primary: "",
          secondary: "",
          sheets: "",
          syllabi: Array.from({ length: 10 }, (_, i) => ({
            ...outline,
            id: `large-${n}-${i}`,
            title: `Versión ${i + 1}`,
            content: `${n}-${i}:` + "字".repeat(24990),
          })),
        }));
      const payload = { listId, revision: meta.revision, rows };
      assert(Buffer.byteLength(JSON.stringify(payload)) > 1000000);
      const saved = await apiOwner.call(
        "meta-ads/inventory/import",
        "POST",
        payload,
      );
      assert.equal(saved.status, 200);
      assert.equal(saved.body.addedSyllabi, 20);
      const read = await readSyllabi(actor, listId, rows[0].name);
      assert.equal(read.syllabi.length, 10);
      assert.equal(read.syllabi[9].content, rows[0].syllabi[9].content);
    },
  );
  await t.test(
    "Importación admite1500 filas completas y rechaza1501 sin cargas parciales",
    async () => {
      const target = await db.metaEffectivenessSheet.create({
          data: { name: "Capacidad1500 " + tag, kind: "INVENTORY" },
        }),
        rows = Array.from({ length: 1500 }, (_, i) => ({
          name: `Registro ${tag} ${i}`,
          primary: "",
          secondary: "",
          sheets: "",
        }));
      const saved = await apiOwner.call("meta-ads/inventory/import", "POST", {
        listId: target.id,
        revision: 0,
        rows,
      });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.created, 1500);
      const state = await inventoryCategories(actor, target.id);
      assert.equal(state.items.length, 1500);
      const excessive = await apiOwner.call(
        "meta-ads/inventory/import",
        "POST",
        {
          listId: target.id,
          revision: state.revision,
          rows: [...rows, { ...rows[0], name: "Exceso" }],
        },
      );
      assert.equal(excessive.status, 400);
      assert.equal(
        await db.metaInventoryItem.count({ where: { sheetId: target.id } }),
        1500,
      );
    },
  );
  if (
    process.env.INVENTORY_XLSX_TEST_PATH &&
    process.env.INVENTORY_PACKAGE_TEST_PATH
  )
    await t.test(
      "Excel real completo: convertir celdas en botones e importar todos los temarios sin pérdida ni duplicación",
      async () => {
        const pkg = catalogPackageSchema.parse(
            JSON.parse(
              await readFile(process.env.INVENTORY_PACKAGE_TEST_PATH!, "utf8"),
            ),
          ),
          file = await readFile(process.env.INVENTORY_XLSX_TEST_PATH!);
        const parsed = await apiOwner.call("meta-ads/inventory/file", "POST", {
          name: "inventario-importar.xlsx",
          content: file.toString("base64"),
        });
        assert.equal(parsed.status, 200);
        assert.equal(parsed.body.rows.length, pkg.items.length);
        const expected = new Map(pkg.items.map((i) => [i.name, i]));
        for (const row of parsed.body.rows) {
          const e = expected.get(row.name)!;
          assert(e);
          assert.equal(row.primary, e.primary);
          assert.deepEqual(
            row.secondary.split(", ").sort(),
            [...e.secondary].sort(),
          );
          assert.equal(row.sheets, "");
          assert.deepEqual(
            (row.syllabi ?? []).map((s: any) => [s.title, s.scope, s.content]),
            e.syllabi.map((s) => [s.title, s.scope, s.content]),
          );
        }
        const target = await db.metaEffectivenessSheet.create({
            data: { kind: "INVENTORY", name: "Excel completo " + tag },
          }),
          saved = await apiOwner.call("meta-ads/inventory/import", "POST", {
            listId: target.id,
            revision: 0,
            rows: parsed.body.rows,
          });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.created, pkg.items.length);
        assert.equal(
          saved.body.addedSyllabi,
          pkg.items.reduce((n, i) => n + i.syllabi.length, 0),
        );
        const state = await inventoryCategories(actor, target.id),
          defs = new Map(state.categories.map((c) => [c.id, c]));
        assert.equal(state.items.length, pkg.items.length);
        for (const item of state.items) {
          const e = expected.get(item.name)!;
          assert.equal(
            state.assignments[item.id].filter(
              (id) => defs.get(id)?.kind === "SECONDARY",
            ).length,
            e.secondary.length,
          );
        }
        const again = await apiOwner.call("meta-ads/inventory/import", "POST", {
          listId: target.id,
          revision: state.revision,
          rows: parsed.body.rows,
        });
        assert.equal(again.status, 200);
        assert.equal(again.body.created, 0);
        assert.equal(again.body.addedSyllabi, 0);
        if (process.env.INVENTORY_SIMPLE_XLSX_TEST_PATH) {
          const simple = await apiOwner.call(
            "meta-ads/inventory/file",
            "POST",
            {
              name: "lista-simple.xlsx",
              content: (
                await readFile(process.env.INVENTORY_SIMPLE_XLSX_TEST_PATH)
              ).toString("base64"),
            },
          );
          assert.equal(simple.status, 200);
          assert.equal(simple.body.rows.length, pkg.items.length);
          assert(
            simple.body.rows.every(
              (r: any) => !r.syllabi?.length && r.sheets === "",
            ),
          );
          const beforeSimple = await inventoryCategories(actor, target.id),
            savedSimple = await apiOwner.call(
              "meta-ads/inventory/import",
              "POST",
              {
                listId: target.id,
                revision: beforeSimple.revision,
                rows: simple.body.rows,
              },
            );
          assert.equal(savedSimple.status, 200);
          assert.equal(savedSimple.body.addedSyllabi, 0);
          assert.equal(savedSimple.body.created, 0);
          assert.equal(
            (await inventoryCategories(actor, target.id)).items.reduce(
              (n, i) => n + i.syllabi.length,
              0,
            ),
            pkg.items.reduce((n, i) => n + i.syllabi.length, 0),
          );
        }

        assert.equal(
          await db.metaAlias.count({ where: { inventorySheetId: target.id } }),
          0,
        );
      },
    );
  if (process.env.INVENTORY_PACKAGE_TEST_PATH)
    await t.test(
      "Paquete privado completo y repetición HTTP sin duplicados",
      async () => {
        const pkg = catalogPackageSchema.parse(
          JSON.parse(
            await readFile(process.env.INVENTORY_PACKAGE_TEST_PATH!, "utf8"),
          ),
        );
        pkg.targetName = "Inventario QA " + tag;
        const preview = await apiOwner.call(
          "meta-ads/inventory/package/preview",
          "POST",
          pkg,
        );
        assert.equal(preview.status, 200);
        const result = await apiOwner.call(
          "meta-ads/inventory/package/import",
          "POST",
          { package: pkg, token: preview.body.token },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.created, pkg.items.length);
        const meta = await inventoryCategories(actor, result.body.listId);
        assert.equal(meta.items.length, pkg.items.length);
        assert.equal(
          meta.items.reduce((n, i) => n + i.syllabi.length, 0),
          pkg.items.reduce((n, i) => n + i.syllabi.length, 0),
        );
        assert(!JSON.stringify(meta).includes('"content":'));
        assert.equal(
          await db.metaAlias.count({
            where: { inventorySheetId: result.body.listId },
          }),
          0,
        );
        const again = await apiOwner.call(
            "meta-ads/inventory/package/preview",
            "POST",
            pkg,
          ),
          repeat = await apiOwner.call(
            "meta-ads/inventory/package/import",
            "POST",
            { package: pkg, token: again.body.token },
          );
        assert.equal(repeat.status, 200);
        assert.equal(repeat.body.created, 0);
        assert.equal(repeat.body.addedSyllabi, 0);
        if (process.env.INVENTORY_FIXTURE_PATH)
          await writeFile(
            process.env.INVENTORY_FIXTURE_PATH,
            JSON.stringify({
              owner: { id: owner.id, email: owner.email },
              listId: result.body.listId,
              listName: pkg.targetName,
              sample: pkg.items.find((i) => i.syllabi.length > 2),
              smallListId: listId,
              tag,
            }),
          );
      },
    );
  await t.test(
    "Sin cambios en ventas, hojas fuente o asignaciones comerciales",
    async () => {
      assert.deepEqual(
        {
          aliases: await db.metaAlias.count(),
          days: await db.metaEffectivenessDay.count(),
          tables: await db.metaAliasTable.count(),
        },
        financeBefore,
      );
    },
  );
  await db.$disconnect();
});
