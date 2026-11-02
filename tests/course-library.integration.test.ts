import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { readLibrary, changeLibrary } from "../lib/courses/library";
import {
  createCourse,
  courseDetail,
  mutateCourse,
} from "../lib/courses/service";
import { settingsSchema } from "../lib/courses/schema";
test("Biblioteca: categorías, orden y páginas ligeras sin afectar cursos o proveedores", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    u = { id: "library-" + tag, role: "OWNER" as const },
    before = await db.aICourseLibrary.findUnique({ where: { id: "global" } }),
    fetchOriginal = globalThis.fetch;
  let custom = "";
  await db.user.create({
    data: {
      ...u,
      name: "QA biblioteca",
      email: u.id + "@example.test",
      passwordHash: "synthetic",
      status: "APPROVED",
    },
  });
  globalThis.fetch = async () => {
    throw Error("No external calls permitted");
  };
  try {
    await t.test(
      "Crear categoría conserva las previas, rechaza duplicados y revisiones obsoletas",
      async () => {
        const c = (await readLibrary(u, new URLSearchParams())) as any;
        assert(!("courses" in c));
        const d = await changeLibrary(u, {
          action: "create",
          revision: c.revision,
          name: "Técnicos QA " + tag,
          color: "#79a7ee",
        });
        custom = d.createdId!;
        assert.equal(d.groups.length, c.groups.length + 1);
        assert.equal(d.groups.at(-1)!.title, "Técnicos QA " + tag);
        await assert.rejects(
          () =>
            changeLibrary(u, {
              action: "create",
              revision: c.revision,
              name: "Conflicto",
            }),
          /cambiaron/,
        );
        await assert.rejects(
          () =>
            changeLibrary(u, {
              action: "create",
              revision: d.revision,
              name: "TÉCNICOS QA " + tag,
            }),
          /existe/,
        );
      },
    );
    await t.test(
      "Orden guardado incluye todas las categorías; concurrentes no se pisan",
      async () => {
        const c = (await readLibrary(u, new URLSearchParams())) as any,
          ids = c.groups.map((g: any) => g.id).reverse();
        const r = await changeLibrary(u, {
          action: "reorder",
          revision: c.revision,
          ids,
        });
        assert.deepEqual(
          r.groups.map((g) => g.id),
          ids,
        );
        await assert.rejects(
          () =>
            changeLibrary(u, {
              action: "reorder",
              revision: r.revision,
              ids: [...ids.slice(1), ids[1]],
            }),
          /una sola vez/,
        );
        const results = await Promise.allSettled(
          ["Extra A ", "Extra B "].map((name) =>
            changeLibrary(u, {
              action: "create",
              revision: r.revision,
              name: name + tag,
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      },
    );
    await t.test(
      "Creación en categoría personalizada valida pertenencia; público sigue independiente",
      async () => {
        await assert.rejects(
          () =>
            createCourse(u, {
              title: "Inválido",
              settings: { libraryGroup: "custom:" + randomUUID() },
            }),
          /categoría/,
        );
        const c = await createCourse(u, {
          title: "Curso personalizado " + tag,
          settings: {
            libraryGroup: custom,
            audience: "other",
            audienceDetail: "Técnicos deportivos",
          },
        });
        let d = await courseDetail(u, c.id);
        await mutateCourse(u, c.id, "metadata", {
          revision: d.revision,
          data: { audience: "adolescents" },
        });
        d = await courseDetail(u, c.id);
        assert.equal((d.settings as any).libraryGroup, custom);
        await db.aICourse.delete({ where: { id: c.id } });
      },
    );
    await t.test(
      "Más de 50 cursos: páginas sin pérdidas, sin contenido de módulos/proveedores en la lista",
      async () => {
        const s = settingsSchema.parse({
          libraryGroup: custom,
          audience: "professionals",
          model: "PRIVATE_MODEL_SENTINEL",
        });
        await db.aICourse.createMany({
          data: Array.from({ length: 54 }, (_, i) => ({
            id: tag + "-" + String(i).padStart(3, "0"),
            actorId: u.id,
            title: "QA programa " + i,
            description: "Resumen",
            prompt: "PRIVATE_PROMPT_SENTINEL",
            settings: s,
            archivedAt: i === 53 ? new Date() : null,
          })),
        });
        await db.aICourseModule.create({
          data: {
            courseId: tag + "-000",
            title: "Módulo",
            brief: "PRIVATE_MODULE_SENTINEL",
            minutes: 10,
            style: "slides",
            position: 0,
          },
        });
        const a = (await readLibrary(
            u,
            new URLSearchParams({ group: custom, page: "1" }),
          )) as any,
          b = (await readLibrary(
            u,
            new URLSearchParams({ group: custom, page: "2" }),
          )) as any;
        assert.equal(a.total, 53);
        assert.equal(a.courses.length, 50);
        assert.equal(b.courses.length, 3);
        assert.equal(
          new Set([...a.courses, ...b.courses].map((c: any) => c.id)).size,
          53,
        );
        assert(!JSON.stringify([a, b]).includes("PRIVATE_"));
        assert.equal(
          [...a.courses, ...b.courses].find((c: any) => c.id === tag + "-000")
            ._count.modules,
          1,
        );
        const clamped = (await readLibrary(
          u,
          new URLSearchParams({ group: custom, page: "999" }),
        )) as any;
        assert.equal(clamped.page, 2);
        const one = (await readLibrary(
          u,
          new URLSearchParams({ courseId: tag + "-000" }),
        )) as any;
        assert.equal(one.course.id, tag + "-000");
        assert(!JSON.stringify(one).includes("PRIVATE_"));
      },
    );
    await t.test(
      "Mover y archivar actualiza los conteos sin borrar contenido; permisos se revalidan",
      async () => {
        const id = tag + "-000",
          d = await courseDetail(u, id);
        await mutateCourse(u, id, "metadata", {
          revision: d.revision,
          data: { libraryGroup: "adults" },
        });
        const a = (await readLibrary(
          u,
          new URLSearchParams({ group: custom }),
        )) as any;
        assert.equal(a.total, 52);
        assert.equal(
          await db.aICourseModule.count({ where: { courseId: id } }),
          1,
        );
        const now = await courseDetail(u, id);
        await mutateCourse(u, id, "archive", { revision: now.revision });
        assert.equal(
          ((await readLibrary(u, new URLSearchParams({ courseId: id }))) as any)
            .course,
          null,
        );
        await assert.rejects(
          () => readLibrary({ id: u.id, role: "ADMIN" }, new URLSearchParams()),
          /OWNER/,
        );
        await db.user.update({ where: { id: u.id }, data: { role: "ADMIN" } });
        await assert.rejects(
          () =>
            changeLibrary(u, {
              action: "create",
              revision: 0,
              name: "Denegado",
            }),
          /OWNER/,
        );
        await assert.rejects(
          () => readLibrary(u, new URLSearchParams()),
          /OWNER/,
        );
      },
    );
  } finally {
    globalThis.fetch = fetchOriginal;
    const rows = await db.aICourse.findMany({
      where: { actorId: u.id },
      select: { id: true },
    });
    await db.aICourseModule.deleteMany({
      where: { courseId: { in: rows.map((c) => c.id) } },
    });
    await db.aICourse.deleteMany({ where: { actorId: u.id } });
    await db.user.delete({ where: { id: u.id } });
    await db.aICourseLibrary.deleteMany({ where: { id: "global" } });
    if (before)
      await db.aICourseLibrary.create({
        data: { ...before, state: before.state ?? Prisma.JsonNull },
      });
    await db.$disconnect();
  }
});
