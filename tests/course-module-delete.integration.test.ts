import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import {
  createCourse,
  mutateCourse,
  courseDetail,
  deleteModule,
} from "../lib/courses/service";
import { courseRoutes } from "../lib/courses/routes";
import { settingsSchema } from "../lib/courses/schema";
import { store, load, remove } from "../lib/storage";

test("Eliminar módulo: revisión, permisos, trabajos y limpieza sin afectar hermanos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        email: "delete-owner-" + tag + "@example.test",
        name: "QA eliminar módulo",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    admin = await db.user.create({
      data: {
        email: "delete-admin-" + tag + "@example.test",
        name: "QA sin permiso",
        passwordHash: "synthetic",
        role: "ADMIN",
        status: "APPROVED",
      },
    });
  let path = "";
  try {
    const c = await createCourse(owner, {
        title: "Curso eliminar " + tag,
        settings: {},
      }),
      foreign = await createCourse(owner, {
        title: "Otro " + tag,
        settings: {},
      });
    await mutateCourse(owner, c.id, "import-modules", {
      revision: 1,
      data: { text: "Módulo 1: Retirar\nMódulo 2: Conservar" },
    });
    await mutateCourse(owner, foreign.id, "add-module", {
      revision: 1,
      data: { title: "Ajeno" },
    });
    let d = await courseDetail(owner, c.id);
    const [target, sibling] = d.modules;
    await db.aICourse.update({
      where: { id: c.id },
      data: {
        settings: {
          ...settingsSchema.parse(d.settings),
          resources: [
            { kind: "video", modules: "all", count: 1, instructions: "" },
            {
              kind: "slides",
              modules: [target.id],
              count: 1,
              instructions: "",
            },
            {
              kind: "guide",
              modules: [target.id, sibling.id],
              count: 1,
              instructions: "",
            },
          ],
        },
      },
    });
    path = await store(Buffer.from("QA archivo del módulo"));
    await db.aICourseAsset.create({
      data: {
        moduleId: target.id,
        revision: 1,
        scene: 0,
        kind: "SPEECH",
        path,
        mime: "audio/mpeg",
      },
    });
    await db.aICourseMaterial.createMany({
      data: [
        { moduleId: target.id, title: "Material a retirar", kind: "guide" },
        { moduleId: sibling.id, title: "Material conservado", kind: "guide" },
      ],
    });
    const revision = { revision: d.revision, moduleRevision: target.revision };
    await t.test(
      "OWNER vigente y módulo del curso; rechaza ADMIN, ámbito ajeno y revisiones antiguas",
      async () => {
        await assert.rejects(
          deleteModule(admin, c.id, target.id, revision),
          (e: any) => e.status === 403,
        );
        await assert.rejects(
          deleteModule(
            owner,
            c.id,
            (await courseDetail(owner, foreign.id)).modules[0].id,
            revision,
          ),
          (e: any) => e.status === 404,
        );
        await assert.rejects(
          deleteModule(owner, c.id, target.id, { ...revision, revision: 0 }),
          (e: any) => e.status === 409,
        );
        await assert.rejects(
          deleteModule(owner, c.id, target.id, {
            ...revision,
            moduleRevision: 0,
          }),
          (e: any) => e.status === 409,
        );
        assert(
          await db.aICourseModule.findUnique({ where: { id: target.id } }),
        );
      },
    );
    await t.test(
      "Bloquea desarrollo activo y solicitudes pendientes o inciertas, sin borrar resultados",
      async () => {
        const build = await db.aICourseBuild.create({
          data: {
            courseId: c.id,
            actorId: owner.id,
            requestId: tag,
            resources: [],
            credentialRevisions: {},
            moduleIds: [target.id],
          },
        });
        await assert.rejects(
          deleteModule(owner, c.id, target.id, revision),
          (e: any) => e.status === 409,
        );
        await db.aICourseBuild.delete({ where: { id: build.id } });
        const task = await db.aICourseTask.create({
          data: {
            courseId: c.id,
            actorId: owner.id,
            requestId: tag,
            kind: "LESSON",
            status: "PENDING",
            input: { moduleId: target.id },
          },
        });
        for (const status of [
          "PENDING",
          "RUNNING",
          "RENDERING",
          "UNCERTAIN",
          "DISPATCH_UNCERTAIN",
        ]) {
          await db.aICourseTask.update({
            where: { id: task.id },
            data: { status },
          });
          await assert.rejects(
            deleteModule(owner, c.id, target.id, revision),
            (e: any) => e.status === 409,
          );
        }
        await db.aICourseTask.update({
          where: { id: task.id },
          data: { status: "COMPLETED" },
        });
      },
    );
    await t.test(
      "DELETE conserva historia, hermano y recursos globales; retira contenido, archivo y referencias del plan",
      async () => {
        const result = await courseRoutes(
          new NextRequest(
            "http://localhost/api/courses-ai/" + c.id + "/modules/" + target.id,
            { method: "DELETE" },
          ),
          ["courses-ai", c.id, "modules", target.id],
          owner,
          async () => revision,
        );
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), {
          ok: true,
          cleanupPending: false,
        });
        d = await courseDetail(owner, c.id);
        assert.equal(d.modules.length, 1);
        assert.equal(d.modules[0].id, sibling.id);
        assert.equal(d.modules[0].position, 0);
        assert.equal(d.modules[0].materials.length, 1);
        assert.equal(d.revision, revision.revision + 1);
        assert.equal(
          settingsSchema
            .parse(d.settings)
            .resources.find((r) => r.kind === "video")?.modules,
          "all",
        );
        assert(
          !settingsSchema
            .parse(d.settings)
            .resources.some((r) => r.kind === "slides"),
        );
        assert.deepEqual(
          settingsSchema
            .parse(d.settings)
            .resources.find((r) => r.kind === "guide")?.modules,
          [sibling.id],
        );
        assert.equal(
          await db.aICourseMaterial.count({ where: { moduleId: target.id } }),
          0,
        );
        assert.equal(
          await db.aICourseAsset.count({ where: { moduleId: target.id } }),
          0,
        );
        await assert.rejects(load(path));
        assert.equal(
          await db.aICourseTask.count({
            where: { courseId: c.id, status: "COMPLETED" },
          }),
          1,
        );
      },
    );
    await t.test(
      "Dos eliminaciones concurrentes no repiten cambios; borrar último módulo deja el curso disponible",
      async () => {
        const results = await Promise.allSettled(
          [1, 2].map(() =>
            deleteModule(owner, c.id, sibling.id, {
              revision: d.revision,
              moduleRevision: sibling.revision,
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          (
            results.find(
              (r) => r.status === "rejected",
            ) as PromiseRejectedResult
          ).reason.status,
          409,
        );
        const final = await courseDetail(owner, c.id);
        assert.equal(final.modules.length, 0);
        assert(
          settingsSchema
            .parse(final.settings)
            .resources.every((r) => r.modules === "all"),
        );
        assert.equal((await courseDetail(owner, foreign.id)).modules.length, 1);
      },
    );
  } finally {
    if (path) await remove(path).catch(() => {});
    const cs = await db.aICourse.findMany({
        where: { actorId: owner.id },
        select: { id: true },
      }),
      ids = cs.map((c) => c.id),
      ms = await db.aICourseModule.findMany({
        where: { courseId: { in: ids } },
        select: { id: true },
      });
    await db.aICourseAsset.deleteMany({
      where: { moduleId: { in: ms.map((m) => m.id) } },
    });
    await db.aICourseMaterial.deleteMany({
      where: { moduleId: { in: ms.map((m) => m.id) } },
    });
    await db.aICourseTask.deleteMany({ where: { courseId: { in: ids } } });
    await db.aICourseModule.deleteMany({ where: { courseId: { in: ids } } });
    await db.aICourse.deleteMany({ where: { id: { in: ids } } });
    await db.rateLimit.deleteMany({ where: { key: { contains: owner.id } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, admin.id] } } });
    await db.$disconnect();
  }
});
