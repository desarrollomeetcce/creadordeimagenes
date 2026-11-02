import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  createCourse,
  courseDetail,
  mutateCourse,
} from "../lib/courses/service";
test("Cabecera de curso: edición parcial, revisión y permisos sin IA", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const id = "header-" + randomUUID(),
    u = { id, role: "OWNER" },
    original = globalThis.fetch;
  let courseId = "";
  await db.user.create({
    data: {
      id,
      name: "QA cabecera",
      email: id + "@example.test",
      passwordHash: "synthetic",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  globalThis.fetch = async () => {
    throw Error("No provider calls permitted");
  };
  try {
    const c = await createCourse(u, {
      title: "Excel avanzado",
      kind: "diploma",
      description: "Descripción previa",
      prompt: "Prompt privado del curso",
      settings: {
        audience: "other",
        audienceDetail: "Directores",
        model: "test-model",
        videoModel: "test-video",
        imageQuality: "high",
      },
    });
    courseId = c.id;
    let d = await courseDetail(u, courseId);
    const initial = JSON.stringify(d.settings);
    await t.test(
      "Nombre solo no repone valores por defecto ni modifica prompt/proveedores",
      async () => {
        await mutateCourse(u, courseId, "metadata", {
          revision: d.revision,
          data: { title: "Power BI avanzado" },
        });
        d = await courseDetail(u, courseId);
        assert.equal(d.title, "Power BI avanzado");
        assert.equal(d.kind, "diploma");
        assert.equal(d.description, "Descripción previa");
        assert.equal(d.prompt, "Prompt privado del curso");
        assert.equal(JSON.stringify(d.settings), initial);
      },
    );
    await t.test(
      "Descripción/tipo/público se guardan por separado conservando parámetros IA",
      async () => {
        for (const data of [
          { description: "Nueva descripción" },
          { kind: "program" },
          { audience: "families" },
          { audienceDetail: "Padres de primaria" },
        ]) {
          await mutateCourse(u, courseId, "metadata", {
            revision: d.revision,
            data,
          });
          d = await courseDetail(u, courseId);
        }
        assert.equal(d.kind, "program");
        assert.equal(d.description, "Nueva descripción");
        assert.equal((d.settings as any).audience, "families");
        assert.equal((d.settings as any).audienceDetail, "Padres de primaria");
        assert.equal((d.settings as any).videoModel, "test-video");
        assert.equal((d.settings as any).imageQuality, "high");
        assert.equal(d.prompt, "Prompt privado del curso");
      },
    );
    await t.test(
      "Rechaza revisión desactualizada, campos ajenos y vacío sin escrituras",
      async () => {
        const revision = d.revision;
        await assert.rejects(
          () =>
            mutateCourse(u, courseId, "metadata", {
              revision: revision - 1,
              data: { title: "Viejo" },
            }),
          /cambió/,
        );
        await assert.rejects(() =>
          mutateCourse(u, courseId, "metadata", {
            revision,
            data: { prompt: "No permitido" },
          }),
        );
        await assert.rejects(() =>
          mutateCourse(u, courseId, "metadata", { revision, data: {} }),
        );
        await assert.rejects(() =>
          mutateCourse(u, courseId, "metadata", {
            revision,
            data: { title: "   " },
          }),
        );
        assert.equal((await courseDetail(u, courseId)).revision, revision);
      },
    );
    await t.test(
      "Concurrentes no pisan cambios y una cuenta revocada no puede editar",
      async () => {
        const result = await Promise.allSettled(
          [{ title: "Título A" }, { description: "Descripción B" }].map(
            (data) =>
              mutateCourse(u, courseId, "metadata", {
                revision: d.revision,
                data,
              }),
          ),
        );
        assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(result.filter((r) => r.status === "rejected").length, 1);
        d = await courseDetail(u, courseId);
        await db.user.update({ where: { id }, data: { role: "ADMIN" } });
        await assert.rejects(
          () =>
            mutateCourse(u, courseId, "metadata", {
              revision: d.revision,
              data: { title: "Sin permiso" },
            }),
          /OWNER/,
        );
      },
    );
  } finally {
    globalThis.fetch = original;
    await db.aICourse.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
