import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import {
  courseList,
  createCourse,
  courseDetail,
  courseOverview,
  mutateCourse,
  saveModule,
  addMaterial,
  queueTask,
  queueTasks,
  saveMaterial,
  processCourseTask,
} from "../lib/courses/service";
import { courseRoutes } from "../lib/courses/routes";
import {
  saveCredential,
  discover,
  generateText,
  speech,
  cloneVoice,
} from "../lib/courses/providers";
import { remove } from "../lib/storage";
import { settingsSchema, lessonSchema } from "../lib/courses/schema";
test("Cursos IA: aislamiento, autorización, persistencia y proveedores sintéticos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    owner = { id: "course-owner-" + tag, role: "OWNER" },
    other = { id: "course-user-" + tag, role: "ADMIN" },
    base = globalThis.fetch;
  const previous = await db.aICourseCredential.findMany();
  let speechFails = false;
  let calls = 0,
    billable = 0,
    dispatches = 0;
  let response: unknown = {
    modules: [
      {
        title: "Sumar paso a paso",
        brief: "Niños: aprender 2 + 5",
        minutes: 5,
        style: "whiteboard",
      },
    ],
  };
  const lesson = lessonSchema.parse({
    objectives: ["Sumar"],
    scenes: [
      {
        title: "Sumamos",
        kind: "whiteboard",
        narration: "Vamos a sumar dos más cinco.",
        steps: ["2 + 5", "Contamos cinco más", "7"],
      },
    ],
    exercise: "3+4",
    solution: "7",
  });
  await db.user.createMany({
    data: [
      {
        ...owner,
        name: "QA cursos",
        email: owner.id + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
      {
        ...other,
        name: "QA sin permiso",
        email: other.id + "@example.test",
        passwordHash: "synthetic",
        role: "ADMIN",
        status: "APPROVED",
      },
    ] as any,
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://generativelanguage.googleapis.com/v1beta/")) {
      assert.equal(
        new Headers(init?.headers).get("x-goog-api-key"),
        "synthetic-gemini-key-12345",
      );
      if (url.includes("models?"))
        return Response.json({
          models: [
            {
              name: "models/gemini-test",
              displayName: "Gemini test",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        });
      billable++;
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(lesson) }] },
          },
        ],
        usageMetadata: { totalTokenCount: 20 },
      });
    }
    if (url.startsWith("https://api.anthropic.com/v1/")) {
      assert.equal(
        new Headers(init?.headers).get("x-api-key"),
        "synthetic-anthropic-key-12345",
      );
      if (url.includes("models?"))
        return Response.json({
          data: [{ id: "claude-test", display_name: "Claude test" }],
        });
      billable++;
      return Response.json({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(lesson) }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    }
    if (url.startsWith("https://api.elevenlabs.io/v1/")) {
      assert.equal(
        new Headers(init?.headers).get("xi-api-key"),
        "synthetic-elevenlabs-key-12345",
      );
      if (url.endsWith("/models"))
        return Response.json([
          {
            model_id: "eleven_test",
            name: "Eleven test",
            can_do_text_to_speech: true,
          },
        ]);
      if (url.endsWith("/voices"))
        return Response.json({
          voices: [{ voice_id: "voice-test", name: "Voz de prueba" }],
        });
      billable++;
      if (url.endsWith("/voices/add")) {
        assert(init?.body instanceof FormData);
        assert.equal(init.body.get("name"), "Voz autorizada QA");
        return Response.json({
          voice_id: "voice-cloned-test",
          requires_verification: true,
        });
      }
      return new Response(new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]), {
        headers: { "Content-Type": "audio/mpeg" },
      });
    }
    assert(
      url.startsWith("https://api.openai.com/v1/"),
      "Only synthetic OpenAI requests allowed",
    );
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-courses-key-12345",
    );
    calls++;
    if (url.endsWith("/models"))
      return Response.json({
        data: [
          { id: "gpt-4.1" },
          { id: "tts-1" },
          { id: "undocumented-danger" },
        ],
      });
    billable++;
    if (url.endsWith("/audio/speech")) {
      if (speechFails) return new Response("limit", { status: 429 });
      return new Response(new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]), {
        headers: { "Content-Type": "audio/mpeg" },
      });
    }
    return Response.json({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(response) }] },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });
  };
  let cid = "";
  try {
    await t.test(
      "Solo OWNER vigente; listar y abrir no hace llamadas IA",
      async () => {
        await assert.rejects(() => courseList(other), /OWNER/);
        const c = await createCourse(owner, {
          title: "QA " + tag,
          prompt: "Enseña sumas a niños con pizarra paso a paso",
          settings: {
            audience: "children",
            provider: "openai",
            model: "gpt-4.1",
          },
        });
        cid = c.id;
        await courseList(owner);
        const detail = await courseDetail(owner, cid);
        assert.equal(detail.modules.length, 0);
        assert.equal(calls, 0);
        await assert.rejects(
          () =>
            courseRoutes(
              new NextRequest("http://localhost/api/courses-ai"),
              ["courses-ai"],
              other,
              async () => ({}),
            ),
          /OWNER/,
        );
      },
    );
    await t.test(
      "Claves cifradas y catálogo real filtrado; jamás secretos al cliente",
      async () => {
        await saveCredential({
          provider: "openai",
          key: "synthetic-courses-key-12345",
        });
        const saved = await db.aICourseCredential.findUniqueOrThrow({
          where: { provider: "openai" },
        });
        assert(!saved.encryptedKey.includes("synthetic"));
        const catalog = await discover("openai");
        assert.deepEqual(
          catalog.voices.map((v) => v.id),
          ["alloy", "echo", "fable", "nova", "onyx", "shimmer"],
        );
        const r = await courseRoutes(
          new NextRequest("http://localhost/api/courses-ai/providers"),
          ["courses-ai", "providers"],
          owner,
          async () => ({}),
        );
        const body = JSON.stringify(await r.json());
        assert(!body.includes("encryptedKey"));
        assert(!body.includes("synthetic"));
        assert(!body.includes("undocumented-danger"));
        assert(body.includes("gpt-4.1"));
        assert.equal(billable, 0);
      },
    );
    await t.test(
      "Doble clic idempotente; temario generado una vez y sin sobrescribir módulos",
      async () => {
        const c = await courseDetail(owner, cid),
          b = {
            requestId: randomUUID(),
            kind: "OUTLINE",
            revision: c.revision,
          };
        const dispatch = async () => {
          dispatches++;
        };
        const [a, d] = await Promise.all([
          queueTask(owner, cid, b, dispatch),
          queueTask(owner, cid, b, dispatch),
        ]);
        assert.equal(a.id, d.id);
        assert.equal(dispatches, 1);
        await Promise.all([processCourseTask(a.id), processCourseTask(a.id)]);
        assert.equal(billable, 1);
        const next = await courseDetail(owner, cid);
        assert.equal(next.modules.length, 1);
        assert(
          next.tasks.every((t) => !("leaseToken" in t) && !("input" in t)),
        );
        await assert.rejects(
          () =>
            queueTask(
              owner,
              cid,
              { ...b, requestId: randomUUID(), revision: next.revision },
              dispatch,
            ),
          /ya existe/,
        );
      },
    );
    await t.test(
      "Desarrollar solo el módulo elegido; rechaza edición concurrente",
      async () => {
        let c = await courseDetail(owner, cid);
        const m = c.modules[0];
        response = lesson;
        const job = await queueTask(
          owner,
          cid,
          {
            requestId: randomUUID(),
            kind: "LESSON",
            revision: c.revision,
            moduleId: m.id,
          },
          async () => {},
        );
        await assert.rejects(
          () =>
            saveModule(owner, cid, m.id, {
              revision: m.revision,
              data: { title: "Cambio", minutes: 5, style: "slides" },
            }),
          /Espera/,
        );
        await processCourseTask(job.id);
        c = await courseDetail(owner, cid);
        assert.equal((c.modules[0].lesson as any).scenes[0].steps[2], "7");
        assert.equal(c.modules[0].revision, 2);
        assert.equal(billable, 2);
        await assert.rejects(
          () =>
            saveModule(owner, cid, m.id, {
              revision: 1,
              data: { title: "Viejo" },
            }),
          /cambió/,
        );
      },
    );
    await t.test(
      "Recursos independientes, exportaciones sin respuesta y sin nueva IA",
      async () => {
        let c = await courseDetail(owner, cid),
          m = c.modules[0];
        const mat = await addMaterial(owner, cid, m.id, {
          title: "Taller uno",
          kind: "workshop",
          instructions: "Dos sumas",
        });
        const mat2 = await addMaterial(owner, cid, m.id, {
          title: "Taller dos",
          kind: "workshop",
        });
        response = {
          sections: [{ title: "Actividad", body: "2 + 5 = ____" }],
          answerKey: "RESPUESTA7",
        };
        const job = await queueTask(
          owner,
          cid,
          {
            requestId: randomUUID(),
            kind: "MATERIAL",
            revision: (await courseDetail(owner, cid)).revision,
            moduleId: m.id,
            materialId: mat.id,
          },
          async () => {},
        );
        await processCourseTask(job.id);
        c = await courseDetail(owner, cid);
        assert.equal(c.modules[0].materials.length, 2);
        assert.deepEqual(
          c.modules[0].materials.find((x) => x.id === mat2.id)?.content,
          {},
        );
        const compact = await courseOverview(owner, cid);
        assert(compact.modules[0].lessonReady);
        assert(!("lesson" in compact.modules[0]));
        assert(!("materials" in compact.modules[0]));
        const before = billable;
        const r = await courseRoutes(
          new NextRequest(
            "http://localhost/api/courses-ai/" +
              cid +
              "/modules/" +
              m.id +
              "/export?format=html&material=" +
              mat.id,
          ),
          ["courses-ai", cid, "modules", m.id, "export"],
          owner,
          async () => ({}),
        );
        const html = await r.text();
        assert(html.includes("2 + 5"));
        assert(!html.includes("RESPUESTA7"));
        assert.equal(billable, before);
      },
    );
    await t.test(
      "Rechaza módulo ajeno y permiso revocado antes de generar",
      async () => {
        const c = await courseDetail(owner, cid);
        await assert.rejects(
          () =>
            queueTask(
              owner,
              cid,
              {
                requestId: randomUUID(),
                kind: "LESSON",
                revision: c.revision,
                moduleId: "foreign",
              },
              async () => {},
            ),
          /Selecciona/,
        );
        const job = await queueTask(
          owner,
          cid,
          {
            requestId: randomUUID(),
            kind: "LESSON",
            revision: c.revision,
            moduleId: c.modules[0].id,
          },
          async () => {},
        );
        await db.user.update({
          where: { id: owner.id },
          data: { role: "ADMIN" },
        });
        const before = billable;
        await processCourseTask(job.id);
        assert.equal(billable, before);
        assert.equal(
          (await db.aICourseTask.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "CANCELLED",
        );
        await assert.rejects(() => courseList(owner), /OWNER/);
        await db.user.update({
          where: { id: owner.id },
          data: { role: "OWNER" },
        });
      },
    );
    await t.test(
      "JSON inválido conserva contenido anterior, uso recibido y no reintenta al consultar",
      async () => {
        const c = await courseDetail(owner, cid),
          before = JSON.stringify(c.modules[0].lesson);
        response = { unexpected: "invalid" };
        const job = await queueTask(
          owner,
          cid,
          {
            requestId: randomUUID(),
            kind: "LESSON",
            revision: c.revision,
            moduleId: c.modules[0].id,
          },
          async () => {},
        );
        await processCourseTask(job.id);
        const after = await courseDetail(owner, cid);
        assert.equal(JSON.stringify(after.modules[0].lesson), before);
        assert.equal(
          after.tasks.find((t) => t.id === job.id)?.status,
          "NEEDS_REVIEW",
        );
        const saved = await db.aICourseTask.findUniqueOrThrow({
          where: { id: job.id },
        });
        assert.equal((saved.usage as any).output_tokens, 20);
        const n = billable;
        await processCourseTask(job.id);
        await courseDetail(owner, cid);
        assert.equal(billable, n);
      },
    );
    await t.test(
      "Narración por escena conserva archivo, evita duplicación y respeta límites sin reintentar",
      async () => {
        let c = await courseDetail(owner, cid);
        const settings = {
          ...settingsSchema.parse(c.settings),
          voiceProvider: "openai",
          voiceModel: "tts-1",
          voiceId: "alloy",
        };
        await mutateCourse(owner, cid, "save", {
          revision: c.revision,
          data: { title: c.title, kind: c.kind, prompt: c.prompt, settings },
        });
        c = await courseDetail(owner, cid);
        const moduleId = c.modules[0].id;
        const job = await queueTask(
          owner,
          cid,
          {
            requestId: randomUUID(),
            kind: "SPEECH",
            moduleId,
            scene: 0,
            revision: c.revision,
          },
          async () => {},
        );
        await processCourseTask(job.id);
        c = await courseDetail(owner, cid);
        assert.equal(c.modules[0].assets.length, 1);
        const audio = c.modules[0].assets[0];
        assert(!("path" in audio));
        const r = await courseRoutes(
          new NextRequest("http://localhost/api/courses-ai/assets/" + audio.id),
          ["courses-ai", "assets", audio.id],
          owner,
          async () => ({}),
        );
        assert.equal(r.headers.get("content-type"), "audio/mpeg");
        assert.equal((await r.arrayBuffer()).byteLength, 10);
        await assert.rejects(
          () =>
            queueTask(
              owner,
              cid,
              {
                requestId: randomUUID(),
                kind: "SPEECH",
                moduleId,
                scene: 0,
                revision: c.revision,
              },
              async () => {},
            ),
          /ya está generado/,
        );
        await saveModule(owner, cid, moduleId, {
          revision: c.modules[0].revision,
          data: {
            title: c.modules[0].title,
            brief: c.modules[0].brief,
            minutes: 5,
            style: "whiteboard",
            lesson,
          },
        });
        c = await courseDetail(owner, cid);
        speechFails = true;
        const failed = await queueTask(
          owner,
          cid,
          {
            requestId: randomUUID(),
            kind: "SPEECH",
            moduleId,
            scene: 0,
            revision: c.revision,
          },
          async () => {},
        );
        await processCourseTask(failed.id);
        const before = billable;
        await processCourseTask(failed.id);
        await courseDetail(owner, cid);
        assert.equal(billable, before);
        assert.equal(
          (
            await db.aICourseTask.findUniqueOrThrow({
              where: { id: failed.id },
            })
          ).status,
          "NEEDS_REVIEW",
        );
        assert.equal(await db.aICourseAsset.count({ where: { moduleId } }), 1);
      },
    );

    await t.test(
      "Materiales se corrigen sin IA con revisión y lote atómico no pierde módulos al terminar rápido",
      async () => {
        let c = await courseDetail(owner, cid);
        const m = c.modules[0],
          mat = m.materials[0],
          before = billable;
        await saveMaterial(owner, cid, m.id, mat.id, {
          revision: mat.revision,
          data: {
            title: "Taller corregido",
            kind: "workshop",
            instructions: "Practicar",
            content: {
              sections: [{ title: "Actividad corregida", body: "5 + 2 = ___" }],
              answerKey: "7",
            },
          },
        });
        assert.equal(billable, before);
        await assert.rejects(
          () =>
            saveMaterial(owner, cid, m.id, mat.id, {
              revision: mat.revision,
              data: { title: "Viejo", kind: "workshop" },
            }),
          /cambió/,
        );
        for (const title of ["Módulo lote A", "Módulo lote B"]) {
          c = await courseDetail(owner, cid);
          await mutateCourse(owner, cid, "add-module", {
            revision: c.revision,
            data: { title, minutes: 5, style: "slides" },
          });
        }
        c = await courseDetail(owner, cid);
        const targets = c.modules.slice(1).map((m) => ({ moduleId: m.id }));
        const body = {
          requestId: randomUUID(),
          kind: "LESSON",
          revision: c.revision,
          targets,
        };
        let dispatched = 0;
        response = lesson;
        const result = await queueTasks(owner, cid, body, async (ids) => {
          dispatched++;
          assert.equal(ids.length, 2);
          assert.equal(
            await db.aICourseTask.count({
              where: { id: { in: ids }, status: "PENDING" },
            }),
            2,
          );
          for (const id of ids) await processCourseTask(id);
        });
        assert.equal(dispatched, 1);
        assert.equal(billable, before + 2);
        const again = await queueTasks(owner, cid, body, async () => {
          throw Error("Duplicate dispatch");
        });
        assert.deepEqual(again.ids, result.ids);
        assert.equal(billable, before + 2);
        c = await courseDetail(owner, cid);
        assert(
          c.modules.every((m) => lessonSchema.safeParse(m.lesson).success),
        );
        const n = await db.aICourseTask.count({ where: { courseId: cid } });
        await assert.rejects(
          () =>
            queueTasks(
              owner,
              cid,
              {
                requestId: randomUUID(),
                kind: "LESSON",
                revision: c.revision,
                targets,
              },
              async () => {},
            ),
          /pendientes/,
        );
        assert.equal(
          await db.aICourseTask.count({ where: { courseId: cid } }),
          n,
        );
      },
    );
    await t.test(
      "Gemini, Claude y ElevenLabs usan sus APIs, catálogos y claves aisladas sin tráfico real",
      async () => {
        for (const provider of ["gemini", "anthropic", "elevenlabs"]) {
          await saveCredential({
            provider,
            key: "synthetic-" + provider + "-key-12345",
          });
          await discover(provider);
        }
        for (const [provider, model] of [
          ["gemini", "gemini-test"],
          ["anthropic", "claude-test"],
        ]) {
          const r = await generateText(
            provider,
            model,
            "Desarrolla un módulo en JSON",
          );
          assert(lessonSchema.safeParse(JSON.parse(r.text)).success);
        }
        const audio = await speech(
          "elevenlabs",
          "eleven_test",
          "voice-test",
          "Hola, aprendamos a sumar.",
        );
        assert.equal(audio.length, 10);
        const cloned = await cloneVoice(
          "Voz autorizada QA",
          new File([new Uint8Array([1, 2, 3])], "voz.wav", {
            type: "audio/wav",
          }),
        );
        assert.equal(cloned.requiresVerification, true);
        const row = await db.aICourseCredential.findUniqueOrThrow({
          where: { provider: "elevenlabs" },
        });
        assert((row.voices as any[]).some((v) => v.id === "voice-cloned-test"));
        await assert.rejects(
          () => speech("elevenlabs", "unknown", "voice-test", "Hola"),
          /elige uno disponible/,
        );
      },
    );
    await t.test(
      "Un cambio de clave detiene trabajos pendientes antes de gastar con otra cuenta",
      async () => {
        const c = await courseDetail(owner, cid);
        const task = await queueTask(
          owner,
          cid,
          {
            requestId: randomUUID(),
            kind: "LESSON",
            revision: c.revision,
            moduleId: c.modules[0].id,
          },
          async () => {},
        );
        const before = billable;
        await saveCredential({
          provider: "openai",
          key: "synthetic-courses-key-12345",
        });
        await discover("openai");
        await processCourseTask(task.id);
        assert.equal(billable, before);
        assert.match(
          (await db.aICourseTask.findUniqueOrThrow({ where: { id: task.id } }))
            .error ?? "",
          /clave cambió/,
        );
      },
    );
    await t.test(
      "Archivo preserva módulos, materiales y trabajos; sin tocar otros módulos",
      async () => {
        const c = await courseDetail(owner, cid);
        await mutateCourse(owner, cid, "archive", { revision: c.revision });
        await assert.rejects(() => courseDetail(owner, cid), /no encontrado/);
        assert.equal(
          await db.aICourseModule.count({ where: { courseId: cid } }),
          3,
        );
        assert.equal(
          await db.aICourseMaterial.count({
            where: { module: { courseId: cid } },
          }),
          2,
        );
      },
    );
  } finally {
    globalThis.fetch = base;
    if (cid) {
      for (const a of await db.aICourseAsset.findMany({
        where: { module: { courseId: cid } },
      }))
        await remove(a.path);
      await db.aICourseAsset.deleteMany({
        where: { module: { courseId: cid } },
      });
      await db.aICourseMaterial.deleteMany({
        where: { module: { courseId: cid } },
      });
      await db.aICourseTask.deleteMany({ where: { courseId: cid } });
      await db.aICourseModule.deleteMany({ where: { courseId: cid } });
      await db.aICourse.deleteMany({ where: { id: cid } });
    }
    await db.rateLimit.deleteMany({ where: { key: "courses:" + owner.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await db.aICourseCredential.deleteMany();
    for (const p of previous)
      await db.aICourseCredential.create({
        data: { ...p, models: p.models as any, voices: p.voices as any },
      });
    await db.$disconnect();
  }
});
