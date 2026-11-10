import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";
test(
  "API de diplomados: claves de solo lectura, ámbitos, catálogo canónico, paginación y revocación",
  { skip: process.env.RUN_DIPLOMA_API_QA !== "1" },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const { db } = await import("../lib/db"),
      { createDiplomaKey, diplomaApiKeys, revokeDiplomaKey, diplomaAPI } =
        await import("../lib/diploma-api");
    const tag = randomUUID(),
      oldFetch = globalThis.fetch;
    const owner = await db.user.create({
        data: {
          email: tag + "@example.invalid",
          name: "Diploma API QA",
          passwordHash: "synthetic",
          role: "OWNER",
          status: "APPROVED",
        },
      }),
      other = await db.user.create({
        data: {
          email: "other-" + tag + "@example.invalid",
          name: "Other owner",
          passwordHash: "synthetic",
          role: "OWNER",
          status: "APPROVED",
        },
      }),
      admin = await db.user.create({
        data: {
          email: "admin-" + tag + "@example.invalid",
          name: "Admin",
          passwordHash: "synthetic",
          role: "ADMIN",
          status: "APPROVED",
        },
      });
    const a = await db.metaEffectivenessSheet.create({
        data: { name: "Diplomados " + tag, kind: "INVENTORY" },
      }),
      b = await db.metaEffectivenessSheet.create({
        data: { name: "Private " + tag, kind: "INVENTORY" },
      }),
      sales = await db.metaEffectivenessSheet.create({
        data: { name: "Financial " + tag, kind: "TOTALS" },
      }),
      table = await db.metaAliasTable.create({ data: { name: "QA " + tag } });
    const category = await db.metaInventoryCategory.create({
      data: {
        sheetId: a.id,
        name: "Ingeniería",
        kind: "PRIMARY",
        key: "ingenieria",
      },
    });
    const item = await db.metaInventoryItem.create({
      data: {
        sheetId: a.id,
        name: "Gestión Ambiental",
        syllabi: [
          {
            id: "private",
            title: "Private content",
            scope: "Internal",
            content: "SECRET_SYLLABUS",
          },
        ],
        categories: { create: { categoryId: category.id } },
      },
    });
    await db.metaInventoryItem.create({
      data: { sheetId: a.id, name: "Programación Python" },
    });
    await db.metaInventoryItem.create({
      data: { sheetId: b.id, name: "SECRET_OTHER_LIST" },
    });
    await db.metaAlias.createMany({
      data: [
        {
          inventorySheetId: a.id,
          tableId: table.id,
          name: "Gestión Ambiental",
        },
        {
          inventorySheetId: a.id,
          tableId: table.id,
          name: "Mecánica industrial",
        },
      ],
    });
    let keep = false;
    globalThis.fetch = async () => {
      throw Error("No AI/Meta/external calls allowed");
    };
    const get = (
      raw: string | undefined,
      query = "",
      mode: "diplomas" | "lists" = "diplomas",
    ) =>
      diplomaAPI(
        new NextRequest(
          "http://localhost/api/v1/" +
            (mode === "lists" ? "inventarios" : "diplomados") +
            query,
          { headers: raw ? { Authorization: "Bearer " + raw } : {} },
        ),
        mode,
      );
    try {
      await assert.rejects(() =>
        createDiplomaKey(admin, { name: "Forbidden", listIds: [a.id] }),
      );
      await assert.rejects(() =>
        createDiplomaKey(owner, { name: "Wrong kind", listIds: [sales.id] }),
      );
      const issued = await createDiplomaKey(owner, {
        name: "Other platform",
        listIds: [a.id],
      });
      assert(/^dip_[A-Za-z0-9_-]{43}$/.test(issued.token));
      const stored = await db.diplomaApiKey.findUniqueOrThrow({
        where: { id: issued.key.id },
      });
      assert.notEqual(stored.tokenHash, issued.token);
      assert.equal(
        stored.tokenHash,
        createHash("sha256").update(issued.token).digest("hex"),
      );
      assert(
        !JSON.stringify(await diplomaApiKeys(owner)).includes(issued.token),
      );
      assert(!JSON.stringify(issued.key).includes("tokenHash"));
      assert.equal((await get(undefined)).status, 401);
      assert.equal((await get("dip_" + "a".repeat(43))).status, 401);
      const lists = await (await get(issued.token, "", "lists")).json();
      assert.deepEqual(lists.data, [{ id: a.id, name: a.name }]);
      const first = await (await get(issued.token, "?limit=1")).json();
      assert.equal(first.data.length, 1);
      assert.equal(first.pagination.total, 3);
      assert.equal(first.pagination.hasMore, true);
      assert(!JSON.stringify(first).includes("SECRET"));
      assert(!JSON.stringify(first).includes("sheets"));
      const found = await (
        await get(issued.token, "?q=GESTION&category=INGENIERIA")
      ).json();
      assert.equal(found.data.length, 1);
      assert.equal(found.data[0].id, item.id);
      assert.deepEqual(found.data[0].categories.primary, ["Ingeniería"]);
      assert.equal((await get(issued.token, "?listId=" + b.id)).status, 404);
      assert.equal((await get(issued.token, "?limit=101")).status, 400);
      assert.equal(
        (await get(issued.token, "?listId=" + a.id + "&listId=" + b.id)).status,
        400,
      );
      assert.equal(
        (await (await get(issued.token, "?page=2&limit=1")).json()).pagination
          .page,
        2,
      );
      await assert.rejects(() => revokeDiplomaKey(other, issued.key.id));
      await db.rateLimit.upsert({
        where: { key: "diploma-api:" + issued.key.id },
        create: {
          key: "diploma-api:" + issued.key.id,
          count: 600,
          expiresAt: new Date(Date.now() + 900000),
        },
        update: { count: 600, expiresAt: new Date(Date.now() + 900000) },
      });
      const limited = await get(issued.token);
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("retry-after"), "900");
      await db.rateLimit.delete({
        where: { key: "diploma-api:" + issued.key.id },
      });
      await db.user.update({
        where: { id: owner.id },
        data: { role: "ADMIN" },
      });
      assert.equal((await get(issued.token)).status, 401);
      await db.user.update({
        where: { id: owner.id },
        data: { role: "OWNER" },
      });
      await db.metaEffectivenessSheet.update({
        where: { id: a.id },
        data: { archivedAt: new Date() },
      });
      assert.equal((await get(issued.token, "?listId=" + a.id)).status, 404);
      await db.metaEffectivenessSheet.update({
        where: { id: a.id },
        data: { archivedAt: null },
      });
      await db.diplomaApiKey.update({
        where: { id: issued.key.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      assert.equal((await get(issued.token)).status, 401);
      await db.diplomaApiKey.update({
        where: { id: issued.key.id },
        data: { expiresAt: null },
      });
      await revokeDiplomaKey(owner, issued.key.id);
      assert.equal((await get(issued.token)).status, 401);
      assert(
        !JSON.stringify(
          await db.auditEvent.findMany({ where: { actorId: owner.id } }),
        ).includes(issued.token),
      );
      console.log(
        "PASS scope isolation, canonical duplicate suppression, accent/case search, pagination, no syllabi/financial leakage, revoked/expired/archive/owner-role checks, rate limit and no provider calls",
      );
      if (process.env.KEEP_DIPLOMA_API_QA === "1") {
        const session = randomUUID();
        await db.session.create({
          data: {
            id: createHash("sha256").update(session).digest("hex"),
            userId: owner.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        await writeFile(
          "/tmp/diploma-api-fixture.json",
          JSON.stringify({ owner: owner.id, listId: a.id, session }),
        );
        keep = true;
      }
    } finally {
      globalThis.fetch = oldFetch;
      if (!keep) {
        await db.diplomaApiKey.deleteMany({ where: { ownerId: owner.id } });
        await db.metaAlias.deleteMany({ where: { tableId: table.id } });
        await db.metaInventoryItem.deleteMany({
          where: { sheetId: { in: [a.id, b.id] } },
        });
        await db.metaInventoryCategory.deleteMany({ where: { sheetId: a.id } });
        await db.metaAliasTable.delete({ where: { id: table.id } });
        await db.metaEffectivenessSheet.deleteMany({
          where: { id: { in: [a.id, b.id, sales.id] } },
        });
        await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
        await db.user.delete({ where: { id: owner.id } });
      }
      await db.user.deleteMany({ where: { id: { in: [other.id, admin.id] } } });
      await db.$disconnect();
    }
  },
);
