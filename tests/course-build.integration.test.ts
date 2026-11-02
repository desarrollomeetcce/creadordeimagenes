import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import {
  createCourse,
  courseDetail,
  mutateCourse,
  processCourseTask,
} from "../lib/courses/service";
import {
  startBuild,
  nextBuildStep,
  finishBuildTask,
  stopBuild,
  interruptBuild,
} from "../lib/courses/builds";
import { saveCredential, discover } from "../lib/courses/providers";
import { remove } from "../lib/storage";
test("Curso completo: temario pegado, recursos por módulo y ejecución durable sin duplicar cargos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    u = { id: "build-" + tag, role: "OWNER" as const },
    previous = await db.aICourseCredential.findMany(),
    original = globalThis.fetch;
  let courseId = "",
    calls = 0,
    fail = false,
    dispatched = 0;
  const prompts: string[] = [];
  await db.user.create({
    data: {
      ...u,
      name: "QA curso completo",
      email: u.id + "@example.test",
      status: "APPROVED",
      passwordHash: "synthetic",
    },
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert(url.startsWith("https://api.openai.com/v1/"));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-build-key-12345",
    );
    if (url.endsWith("/models"))
      return Response.json({ data: [{ id: "gpt-4.1" }, { id: "tts-1" }] });
    calls++;
    if (fail) return new Response("Synthetic interruption", { status: 503 });
    if (url.endsWith("/audio/speech"))
      return new Response(new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0]), {
        headers: { "Content-Type": "audio/mpeg" },
      });
    const prompt = JSON.parse(String(init?.body)).input;
    prompts.push(prompt);
    const output = prompt.includes("Crea este material independiente")
      ? {
          sections: [
            {
              title: "Taller",
              body: "Ejercicio completo con espacio para resolver.",
            },
          ],
          answerKey: "Respuesta revisable",
        }
      : {
          objectives: ["Resolver sumas"],
          scenes: [
            {
              title: "Primer paso",
              kind: "whiteboard",
              narration: "Primero explicamos el procedimiento.",
              steps: ["2 + 5", "7"],
            },
          ],
          exercise: "Resuelve 3+4",
          solution: "7",
          references: [],
        };
    return Response.json({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(output) }] },
      ],
    });
  };
  try {
    await saveCredential({
      provider: "openai",
      key: "synthetic-build-key-12345",
    });
    await discover("openai");
    const c = await createCourse(u, {
      title: "Diplomado QA " + tag,
      prompt: "PROMPT_GLOBAL_PARA_TODOS_LOS_MODULOS",
      settings: {
        provider: "openai",
        model: "gpt-4.1",
        voiceProvider: "openai",
        voiceModel: "tts-1",
        voiceId: "alloy",
      },
    });
    courseId = c.id;
    let d = await courseDetail(u, courseId);
    await mutateCourse(u, courseId, "import-modules", {
      revision: d.revision,
      data: {
        text: "Paso 1: Fundamentos\nEjemplos básicos.\nPaso 2: Práctica\nAplicación guiada.",
      },
    });
    d = await courseDetail(u, courseId);
    const resources = [
        { kind: "video", modules: "all", count: 1, instructions: "" },
        { kind: "audio", modules: "all", count: 1, instructions: "" },
        { kind: "slides", modules: "all", count: 1, instructions: "" },
        {
          kind: "workshop",
          modules: [d.modules[0].id],
          count: 2,
          instructions: "Variantes diferentes de ejercicios",
        },
      ],
      requestId = randomUUID();
    let buildId = "";
    await t.test(
      "Un clic y doble envío generan un solo plan, bloquean edición y conservan el temario",
      async () => {
        const a = await startBuild(
          u,
          courseId,
          { requestId, revision: d.revision, resources },
          async () => {
            dispatched++;
          },
        );
        buildId = a.id;
        assert.equal(
          (
            await startBuild(
              u,
              courseId,
              { requestId, revision: d.revision, resources },
              async () => {
                dispatched++;
              },
            )
          ).id,
          a.id,
        );
        assert.equal(dispatched, 1);
        assert.equal(calls, 0);
        await assert.rejects(
          () =>
            mutateCourse(u, courseId, "metadata", {
              revision: d.revision,
              data: { title: "No cambiar" },
            }),
          /desarrollo/,
        );
        assert.equal(d.modules.length, 2);
      },
    );
    await t.test(
      "Desarrolla ambos módulos con prompt global, dos talleres solo en el primero y voz sin duplicar video/audio",
      async () => {
        for (let i = 0; i < 40; i++) {
          const n = await nextBuildStep(buildId);
          if (n.state === "DONE") break;
          if (n.taskId) {
            await processCourseTask(n.taskId);
            await finishBuildTask(buildId, n.taskId);
          }
        }
        const b = await db.aICourseBuild.findUniqueOrThrow({
          where: { id: buildId },
        });
        assert.equal(b.status, "COMPLETED");
        assert.equal(b.moduleIndex, 2);
        const after = await courseDetail(u, courseId);
        assert(after.modules.every((m) => m.lesson));
        assert.equal(
          after.modules[0].materials.filter((m) => m.kind === "workshop")
            .length,
          2,
        );
        assert.equal(
          after.modules[1].materials.filter((m) => m.kind === "workshop")
            .length,
          0,
        );
        assert(
          after.modules.every((m) =>
            m.materials.some((a) => a.kind === "slides"),
          ),
        );
        assert.equal(
          await db.aICourseAsset.count({
            where: { module: { courseId }, kind: "SPEECH" },
          }),
          2,
        );
        assert.equal(calls, 6);
        assert(
          prompts.every((p) =>
            p.includes("PROMPT_GLOBAL_PARA_TODOS_LOS_MODULOS"),
          ),
        );
      },
    );
    await t.test(
      "Nuevo desarrollo reutiliza lo ya generado sin llamadas IA",
      async () => {
        const before = calls,
          d = await courseDetail(u, courseId),
          r = await startBuild(
            u,
            courseId,
            { requestId: randomUUID(), revision: d.revision, resources },
            async () => {},
          );
        for (let i = 0; i < 10; i++) {
          const n = await nextBuildStep(r.id);
          if (n.state === "DONE") break;
          assert(!n.taskId);
        }
        assert.equal(calls, before);
        assert.equal(
          (await db.aICourseBuild.findUniqueOrThrow({ where: { id: r.id } }))
            .status,
          "COMPLETED",
        );
      },
    );
    await t.test(
      "Soporta más de24 módulos, sin exigir configurar cada uno",
      async () => {
        const x = await createCourse(u, {
          title: "Cien módulos QA " + tag,
          settings: { provider: "openai", model: "gpt-4.1" },
        });
        const sample = (
          await db.aICourseModule.findFirstOrThrow({ where: { courseId } })
        ).lesson as Prisma.InputJsonValue;
        await db.aICourseModule.createMany({
          data: Array.from({ length: 100 }, (_, i) => ({
            courseId: x.id,
            title: "Módulo " + i,
            position: i,
            minutes: 5,
            style: "slides",
            lesson: sample,
          })),
        });
        const r = await startBuild(
          u,
          x.id,
          { requestId: randomUUID(), revision: 1, resources: [] },
          async () => {},
        );
        for (let i = 0; i < 102; i++) {
          if ((await nextBuildStep(r.id)).state === "DONE") break;
        }
        assert.equal(
          (await db.aICourseBuild.findUniqueOrThrow({ where: { id: r.id } }))
            .moduleIndex,
          100,
        );
        await db.aICourseModule.deleteMany({ where: { courseId: x.id } });
        await db.aICourse.delete({ where: { id: x.id } });
      },
    );
    await t.test(
      "Detener antes de la siguiente solicitud no consume API; permisos revocados se rechazan",
      async () => {
        const d = await courseDetail(u, courseId),
          r = await startBuild(
            u,
            courseId,
            { requestId: randomUUID(), revision: d.revision, resources: [] },
            async () => {},
          );
        await stopBuild(u, courseId);
        assert.equal((await nextBuildStep(r.id)).state, "DONE");
        assert.equal(
          (await db.aICourseBuild.findUniqueOrThrow({ where: { id: r.id } }))
            .status,
          "CANCELLED",
        );
        await db.user.update({ where: { id: u.id }, data: { role: "ADMIN" } });
        await assert.rejects(
          () =>
            startBuild(
              u,
              courseId,
              { requestId: randomUUID(), revision: d.revision, resources: [] },
              async () => {},
            ),
          /OWNER/,
        );
        await db.user.update({ where: { id: u.id }, data: { role: "OWNER" } });
      },
    );
    await t.test(
      "Desarrollar selección no genera ni modifica los otros módulos y aplica estilo global",
      async () => {
        const x = await createCourse(u, {
          title: "Selección " + tag,
          prompt: "GLOBAL_SELECCION",
          settings: { model: "gpt-4.1", style: "code", mixStyles: true },
        });
        await mutateCourse(u, x.id, "import-modules", {
          revision: 1,
          data: { text: "Módulo 1: Uno\nMódulo 2: Dos\nMódulo 3: Tres" },
        });
        let d = await courseDetail(u, x.id);
        const r = await startBuild(
          u,
          x.id,
          {
            requestId: randomUUID(),
            revision: d.revision,
            modules: [d.modules[1].id],
            resources: [
              {
                kind: "infographic",
                modules: [d.modules[1].id],
                count: 1,
                instructions: "Resumen visual",
              },
            ],
          },
          async () => {},
        );
        const before = calls;
        for (let i = 0; i < 12; i++) {
          const n = await nextBuildStep(r.id);
          if (n.state === "DONE") break;
          if (n.taskId) {
            await processCourseTask(n.taskId);
            await finishBuildTask(r.id, n.taskId);
          }
        }
        d = await courseDetail(u, x.id);
        assert.equal(
          (await db.aICourseBuild.findUniqueOrThrow({ where: { id: r.id } }))
            .status,
          "COMPLETED",
        );
        assert.equal(calls, before + 2);
        assert.equal(d.modules[0].revision, 1);
        assert.equal(d.modules[2].revision, 1);
        assert.equal(d.modules[1].materials[0].kind, "infographic");
        assert(
          prompts.some(
            (p) =>
              p.includes("GLOBAL_SELECCION") &&
              p.includes('"style":"code"') &&
              p.includes("Puedes combinar escenas"),
          ),
        );
      },
    );
    await t.test(
      "Un error de proveedor detiene el plan sin repetir la solicitud",
      async () => {
        const x = await createCourse(u, {
          title: "Interrupción QA " + tag,
          settings: { provider: "openai", model: "gpt-4.1" },
        });
        await mutateCourse(u, x.id, "add-module", {
          revision: 1,
          data: { title: "Módulo pendiente" },
        });
        const d = await courseDetail(u, x.id),
          r = await startBuild(
            u,
            x.id,
            { requestId: randomUUID(), revision: d.revision, resources: [] },
            async () => {},
          );
        const n = await nextBuildStep(r.id);
        assert(n.taskId);
        fail = true;
        const before = calls;
        await processCourseTask(n.taskId);
        await finishBuildTask(r.id, n.taskId);
        assert.equal(
          (await db.aICourseBuild.findUniqueOrThrow({ where: { id: r.id } }))
            .status,
          "NEEDS_REVIEW",
        );
        assert.equal((await nextBuildStep(r.id)).state, "DONE");
        assert.equal(calls, before + 1);
        fail = false;
        await db.aICourseTask.deleteMany({ where: { courseId: x.id } });
        await db.aICourseModule.deleteMany({ where: { courseId: x.id } });
        await db.aICourse.delete({ where: { id: x.id } });
      },
    );
  } finally {
    globalThis.fetch = original;
    const cs = await db.aICourse.findMany({
        where: { actorId: u.id },
        select: { id: true },
      }),
      ids = cs.map((c) => c.id),
      mods = await db.aICourseModule.findMany({
        where: { courseId: { in: ids } },
        select: { id: true },
      });
    for (const a of await db.aICourseAsset.findMany({
      where: { moduleId: { in: mods.map((m) => m.id) } },
    }))
      await remove(a.path).catch(() => {});
    await db.aICourseAsset.deleteMany({
      where: { moduleId: { in: mods.map((m) => m.id) } },
    });
    await db.aICourseMaterial.deleteMany({
      where: { moduleId: { in: mods.map((m) => m.id) } },
    });
    await db.aICourseTask.deleteMany({ where: { courseId: { in: ids } } });
    await db.aICourseModule.deleteMany({ where: { courseId: { in: ids } } });
    await db.aICourse.deleteMany({ where: { actorId: u.id } });
    await db.rateLimit.deleteMany({ where: { key: { contains: u.id } } });
    await db.user.delete({ where: { id: u.id } });
    await db.aICourseCredential.deleteMany();
    for (const c of previous)
      await db.aICourseCredential.create({
        data: {
          ...c,
          models: c.models ?? Prisma.JsonNull,
          voices: c.voices ?? Prisma.JsonNull,
        },
      });
    await db.$disconnect();
  }
});
