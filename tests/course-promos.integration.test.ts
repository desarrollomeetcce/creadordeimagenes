import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import {
  createCourse,
  courseDetail,
  mutateCourse,
  processCourseTask,
  deleteModule,
  saveModule,
  queueTask,
} from "../lib/courses/service";
import {
  startPromos,
  nextPromoTask,
  interruptPromos,
  stopPromos,
  promoDetail,
} from "../lib/courses/promos";
import {
  saveCredential,
  discover,
  generateText,
  speech,
  cloneVoice,
} from "../lib/courses/providers";
import { courseRoutes } from "../lib/courses/routes";
import { remove } from "../lib/storage";
test("Proveedores y clips opcionales: catálogos reales simulados, una llamada por tarea y resultados persistentes", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    old = await db.aICourseCredential.findMany(),
    original = globalThis.fetch,
    u = await db.user.create({
      data: {
        email: "promo-" + tag + "@example.test",
        name: "QA clips",
        role: "OWNER",
        status: "APPROVED",
        passwordHash: "synthetic",
      },
    });
  let fail = false,
    cloned = false;
  const calls: string[] = [],
    prompts: string[] = [];
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#554488" },
  })
    .png()
    .toBuffer();
  const wav = Buffer.alloc(44);
  wav.write("RIFF");
  wav.write("WAVE", 8);
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      headers = new Headers(init?.headers);
    if (url === "https://api.openai.com/v1/models")
      return Response.json({ data: [{ id: "gpt-4.1" }, { id: "tts-1" }] });
    if (url === "https://api.mistral.ai/v1/models")
      return Response.json({
        data: [
          {
            id: "mistral-small-latest",
            capabilities: { completion_chat: true },
          },
          { id: "embed", capabilities: { completion_chat: false } },
        ],
      });
    if (url === "https://api.cartesia.ai/models") {
      assert.equal(headers.get("Cartesia-Version"), "2026-08-14");
      return Response.json({
        data: [
          { id: "sonic-3.6", capability: "tts" },
          { id: "ink", capability: "stt" },
        ],
      });
    }
    if (url.startsWith("https://api.cartesia.ai/voices?"))
      return Response.json(
        new URL(url).searchParams.has("starting_after")
          ? { data: [{ id: "voice-2", name: "Voz dos" }], has_more: false }
          : {
              data: [{ id: "voice-1", name: "Voz uno" }],
              has_more: true,
              next_page: "voice-1",
            },
      );
    if (url === "https://api.elevenlabs.io/v1/models")
      return Response.json([
        {
          model_id: "eleven_multilingual_v2",
          name: "Multilingual",
          can_do_text_to_speech: true,
        },
      ]);
    if (url === "https://api.elevenlabs.io/v1/voices")
      return Response.json({
        voices: [
          { voice_id: "original", name: "Original" },
          ...(cloned ? [{ voice_id: "own-voice", name: "Mi voz" }] : []),
        ],
      });
    if (url === "https://api.elevenlabs.io/v1/voices/add") {
      cloned = true;
      calls.push(url);
      return Response.json({
        voice_id: "own-voice",
        requires_verification: false,
      });
    }
    if (
      url.startsWith("https://generativelanguage.googleapis.com/v1beta/models?")
    )
      return Response.json({
        models: [
          {
            name: "models/gemini-3.8-flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-nano-banana-2.1",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3.8-flash-lite-tts",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3-pro-image-preview",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-omni-1.1-flash",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    if (
      url.startsWith("https://generativelanguage.googleapis.com/v1beta/voices?")
    )
      return Response.json({
        voices: [{ id: "google-voice", display_name: "Voz Google" }],
      });
    if (url.startsWith("https://api.fal.ai/v1/models?")) {
      const image =
        new URL(url).searchParams.get("category") === "text-to-image";
      const model = {
        endpoint_id: "fal-ai/flux-2/schnell",
        metadata: { display_name: "FLUX r\u00e1pido" },
        openapi: {
          components: {
            schemas: {
              Input: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: { type: "string" },
                  image_size: { type: "string", enum: ["landscape_16_9"] },
                },
              },
              Output: {
                type: "object",
                properties: { images: { type: "array" } },
              },
            },
          },
        },
      };
      return Response.json({ models: image ? [model] : [], has_more: false });
    }
    if (url === "https://api.cartesia.ai/tts/bytes") {
      calls.push(url);
      const b = JSON.parse(String(init?.body));
      assert.equal(b.voice, "voice-2");
      assert.equal(b.output_format.container, "wav");
      return new Response(wav, { headers: { "Content-Type": "audio/wav" } });
    }
    if (url === "https://api.mistral.ai/v1/chat/completions") {
      calls.push(url);
      const b = JSON.parse(String(init?.body));
      assert.equal(b.response_format.type, "json_object");
      return Response.json({
        choices: [
          { finish_reason: "stop", message: { content: '{"ok":true}' } },
        ],
        usage: { total_tokens: 20 },
      });
    }
    if (url === "https://api.openai.com/v1/responses") {
      calls.push(url);
      const prompt = JSON.parse(String(init?.body)).input;
      prompts.push(prompt);
      if (fail) return new Response("Synthetic unavailable", { status: 503 });
      return Response.json({
        status: "completed",
        usage: { output_tokens: 15 },
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  objectives: ["Descubre lo que aprenderás"],
                  scenes: [
                    {
                      title: "Aprende con ejemplos",
                      kind: "slides",
                      narration: "Conoce el programa y empieza a aprender.",
                      steps: ["Aprendizaje práctico", "Conoce el programa"],
                    },
                  ],
                  exercise: "",
                  solution: "",
                  references: [],
                }),
              },
            ],
          },
        ],
      });
    }
    if (url === "https://api.openai.com/v1/audio/speech") {
      calls.push(url);
      return new Response(wav, { headers: { "Content-Type": "audio/wav" } });
    }
    if (url === "https://queue.fal.run/fal-ai/flux-2/schnell") {
      calls.push(url);
      return Response.json({
        request_id: "image-1",
        status_url:
          "https://queue.fal.run/fal-ai/flux-2/requests/image-1/status",
        response_url: "https://queue.fal.run/fal-ai/flux-2/requests/image-1",
      });
    }
    if (url === "https://queue.fal.run/fal-ai/flux-2/requests/image-1/status")
      return Response.json({ status: "COMPLETED" });
    if (url === "https://queue.fal.run/fal-ai/flux-2/requests/image-1")
      return Response.json({
        images: [{ url: "https://fal.media/synthetic.png" }],
      });
    if (url === "https://fal.media/synthetic.png")
      return new Response(png, { headers: { "Content-Type": "image/png" } });
    throw Error(
      "Unexpected synthetic route " +
        new URL(url).hostname +
        new URL(url).pathname,
    );
  };
  let courseId = "";
  const drive = async (id: string) => {
    for (let n = 0; n < 12; n++) {
      const next = await nextPromoTask(id);
      if (next.state === "DONE" || next.state === "FAIL") return next.state;
      if (next.taskId) await processCourseTask(next.taskId);
    }
    throw Error("Plan did not terminate");
  };
  try {
    await t.test(
      "Catálogos amplían texto, voz e imagen, incluyen Nano Banana y FLUX y excluyen retirados",
      async () => {
        for (const provider of [
          "openai",
          "mistral",
          "cartesia",
          "elevenlabs",
          "gemini",
          "fal",
        ])
          await saveCredential({
            provider,
            key: "synthetic-" + provider + "-key-123456",
          });
        const m = await discover("mistral");
        assert.equal(m.models.length, 1);
        assert.equal(
          (await generateText("mistral", "mistral-small-latest", "JSON")).text,
          '{"ok":true}',
        );
        const c = await discover("cartesia");
        assert.equal(c.models.length, 1);
        assert.equal(c.voices.length, 2);
        assert.equal(
          (await speech("cartesia", "sonic-3.6", "voice-2", "Hola")).mime,
          "audio/wav",
        );
        const g = await discover("gemini");
        assert(
          g.models.some(
            (m) =>
              m.id === "gemini-nano-banana-2.1" &&
              m.name.includes("Nano Banana"),
          ),
        );
        assert(!g.models.some((m) => m.id === "gemini-3-pro-image-preview"));
        assert(g.models.some((m) => m.kind === "speech"));
        const f = await discover("fal");
        assert.equal(f.models[0].kind, "image");
        assert.equal(f.models[0].image?.binding?.sizeField, "image_size");
        await discover("openai");
      },
    );
    await t.test(
      "Voz clonada se importa y sigue elegible en el catálogo de la cuenta",
      async () => {
        await discover("elevenlabs");
        const v = await cloneVoice(
          "Mi voz",
          new File([wav], "voz.wav", { type: "audio/wav" }),
        );
        assert.equal(v.id, "own-voice");
        assert(
          (await discover("elevenlabs")).voices.some(
            (v) => v.id === "own-voice",
          ),
        );
      },
    );
    await t.test(
      "FLUX genera con el esquema consultado y una sola solicitud",
      async () => {
        const c = await createCourse(u, {
          title: "Imagen QA " + tag,
          settings: {
            imageProvider: "fal",
            imageModel: "fal-ai/flux-2/schnell",
          },
        });
        await mutateCourse(u, c.id, "add-module", {
          revision: 1,
          data: { title: "Ilustración" },
        });
        let d = await courseDetail(u, c.id),
          m = d.modules[0];
        await saveModule(u, c.id, m.id, {
          revision: m.revision,
          data: {
            title: m.title,
            lesson: {
              objectives: ["Aprender"],
              scenes: [
                {
                  title: "Visual",
                  kind: "story",
                  narration: "Un ejemplo.",
                  steps: ["Paso"],
                  illustrationPrompt: "Dibujo educativo",
                },
              ],
              exercise: "",
              solution: "",
              references: [],
            },
          },
        });
        d = await courseDetail(u, c.id);
        const before = calls.filter((x) =>
          x.startsWith("https://queue.fal.run/"),
        ).length;
        const task = await queueTask(
          u,
          c.id,
          {
            requestId: randomUUID(),
            revision: d.revision,
            kind: "IMAGE",
            moduleId: m.id,
            scene: 0,
          },
          async () => {},
        );
        await processCourseTask(task.id);
        const imageTask = await db.aICourseTask.findUniqueOrThrow({
          where: { id: task.id },
        });
        assert.equal(imageTask.status, "COMPLETED", imageTask.error ?? "");
        assert.equal(
          calls.filter((x) => x.startsWith("https://queue.fal.run/")).length,
          before + 1,
        );
        assert.equal(
          await db.aICourseAsset.count({ where: { moduleId: m.id } }),
          1,
        );
      },
    );
    const c = await createCourse(u, {
      title: "Diplomado QA " + tag,
      prompt: "PROMPT_DEL_DIPLOMADO",
      settings: {
        model: "gpt-4.1",
        provider: "openai",
        voiceProvider: "openai",
        voiceModel: "tts-1",
        voiceId: "alloy",
        exportAspect: "9:16",
      },
    });
    courseId = c.id;
    await mutateCourse(u, c.id, "import-modules", {
      revision: 1,
      data: { text: "Módulo 1: Fundamentos\nMódulo 2: Aplicación" },
    });
    let d = await courseDetail(u, c.id),
      coursePromo = "",
      dispatches = 0;
    await t.test(
      "La cola pública no permite crear tareas internas de clips",
      async () => {
        const d = await courseDetail(u, c.id);
        for (const promoId of [undefined, "invented-promo"]) {
          await assert.rejects(
            queueTask(
              u,
              c.id,
              {
                requestId: randomUUID(),
                revision: d.revision,
                kind: "PROMO_SCRIPT",
                ...(promoId ? { promoId } : {}),
              },
              async () => {},
            ),
            /Inicia los clips/,
          );
        }
      },
    );
    await t.test(
      "Crear plan no llama al proveedor y doble envío despacha solo una vez",
      async () => {
        const input = {
          requestId: randomUUID(),
          revision: d.revision,
          scope: "course",
          seconds: 30,
          cta: "CTA_LITERAL",
        };
        const before = calls.length;
        const first = await startPromos(u, c.id, input, async () => {
          dispatches++;
        });
        coursePromo = first.ids[0];
        assert.equal(
          (
            await startPromos(u, c.id, input, async () => {
              dispatches++;
            })
          ).ids[0],
          coursePromo,
        );
        assert.equal(dispatches, 1);
        assert.equal(calls.length, before);
        await assert.rejects(
          mutateCourse(u, c.id, "metadata", {
            revision: d.revision,
            data: { title: "No" },
          }),
          (e: any) => e.status === 409,
        );
      },
    );
    await t.test(
      "Tráiler durable produce guion y voz una vez; lectura y repetición no regeneran",
      async () => {
        const before = calls.length;
        assert.equal(await drive(coursePromo), "DONE");
        const p = await promoDetail(u, c.id, coursePromo);
        assert.equal(p.status, "COMPLETED");
        assert.equal(p.assets.length, 1);
        assert.equal(p.settings.exportAspect, "9:16");
        assert(!JSON.stringify(p).includes("synthetic-"));
        assert.equal(calls.length, before + 2);
        assert(
          prompts.some(
            (p) =>
              p.includes("CTA_LITERAL") &&
              p.includes("Fundamentos") &&
              p.includes("Aplicación"),
          ),
        );
        await drive(coursePromo);
        assert.equal(calls.length, before + 2);
        const r = await courseRoutes(
          new NextRequest(
            "http://localhost/api/courses-ai/assets/" + p.assets[0].id,
          ),
          ["courses-ai", "assets", p.assets[0].id],
          u,
          async () => ({}),
        );
        assert.equal(r.status, 200);
        assert.equal((await r.arrayBuffer()).byteLength, 44);
      },
    );
    await t.test(
      "Avances por módulo conservan sus ámbitos y el tráiler global sobrevive borrar un módulo",
      async () => {
        d = await courseDetail(u, c.id);
        const r = await startPromos(
          u,
          c.id,
          {
            requestId: randomUUID(),
            revision: d.revision,
            scope: "modules",
            modules: "all",
            seconds: 20,
            cta: "Conoce el módulo",
          },
          async () => {},
        );
        assert.equal(r.ids.length, 2);
        for (const id of r.ids) assert.equal(await drive(id), "DONE");
        const mods = await db.aICoursePromo.findMany({
          where: { id: { in: r.ids } },
          select: { moduleId: true },
        });
        assert.equal(new Set(mods.map((m) => m.moduleId)).size, 2);
        d = await courseDetail(u, c.id);
        await deleteModule(u, c.id, d.modules[0].id, {
          revision: d.revision,
          moduleRevision: d.modules[0].revision,
        });
        assert.equal(
          (await promoDetail(u, c.id, coursePromo)).status,
          "COMPLETED",
        );
        assert.equal(
          await db.aICoursePromo.count({ where: { id: { in: r.ids } } }),
          1,
        );
      },
    );
    await t.test(
      "Detener pendientes cancela sin llamada y fallar no repite cargos",
      async () => {
        d = await courseDetail(u, c.id);
        const r = await startPromos(
          u,
          c.id,
          {
            requestId: randomUUID(),
            revision: d.revision,
            scope: "course",
            seconds: 20,
            cta: "CTA",
          },
          async () => {},
        );
        const p = await db.aICoursePromo.findUniqueOrThrow({
            where: { id: r.ids[0] },
          }),
          before = calls.length;
        await stopPromos(u, c.id, p.batchId);
        assert.equal(await drive(p.id), "DONE");
        assert.equal(calls.length, before);
        d = await courseDetail(u, c.id);
        const failed = await startPromos(
          u,
          c.id,
          {
            requestId: randomUUID(),
            revision: d.revision,
            scope: "course",
            seconds: 20,
            cta: "CTA",
          },
          async () => {},
        );
        fail = true;
        assert.equal(await drive(failed.ids[0]), "FAIL");
        fail = false;
        await interruptPromos(failed.ids);
        const after = calls.length;
        await drive(failed.ids[0]);
        assert.equal(calls.length, after);
        assert.equal(
          (await promoDetail(u, c.id, failed.ids[0])).status,
          "NEEDS_REVIEW",
        );
      },
    );
    await t.test(
      "Permiso actual y clave snapshot se revalidan antes de una llamada",
      async () => {
        d = await courseDetail(u, c.id);
        const r = await startPromos(
            u,
            c.id,
            {
              requestId: randomUUID(),
              revision: d.revision,
              scope: "course",
              seconds: 20,
              cta: "CTA",
            },
            async () => {},
          ),
          before = calls.length;
        await db.user.update({
          where: { id: u.id },
          data: { status: "SUSPENDED" },
        });
        await assert.rejects(
          nextPromoTask(r.ids[0]),
          (e: any) => e.status === 403,
        );
        await db.user.update({
          where: { id: u.id },
          data: { status: "APPROVED" },
        });
        await saveCredential({
          provider: "openai",
          key: "synthetic-openai-replacement-123456",
        });
        await assert.rejects(
          nextPromoTask(r.ids[0]),
          (e: any) => e.status === 409,
        );
        await interruptPromos(r.ids);
        assert.equal(calls.length, before);
      },
    );
  } finally {
    globalThis.fetch = original;
    const cs = await db.aICourse.findMany({
        where: { actorId: u.id },
        select: { id: true },
      }),
      ids = cs.map((c) => c.id),
      ms = await db.aICourseModule.findMany({
        where: { courseId: { in: ids } },
        select: { id: true },
      }),
      mids = ms.map((m) => m.id);
    const assets = [
      ...(await db.aICoursePromoAsset.findMany({
        where: { promo: { courseId: { in: ids } } },
        select: { path: true },
      })),
      ...(await db.aICourseAsset.findMany({
        where: { moduleId: { in: mids } },
        select: { path: true },
      })),
    ];
    for (const a of assets) await remove(a.path);
    await db.aICourseAsset.deleteMany({ where: { moduleId: { in: mids } } });
    await db.aICourseTask.deleteMany({ where: { courseId: { in: ids } } });
    await db.aICourseModule.deleteMany({ where: { courseId: { in: ids } } });
    await db.aICourse.deleteMany({ where: { id: { in: ids } } });
    await db.rateLimit.deleteMany({ where: { key: { contains: u.id } } });
    await db.user.delete({ where: { id: u.id } });
    await db.aICourseCredential.deleteMany();
    if (old.length)
      await db.aICourseCredential.createMany({
        data: old.map((c) => ({
          ...c,
          models: c.models ?? Prisma.JsonNull,
          voices: c.voices ?? Prisma.JsonNull,
        })),
      });
    await db.$disconnect();
  }
});
