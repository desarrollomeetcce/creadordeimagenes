import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { remove } from "../lib/storage";
import {
  courseList,
  createCourse,
  courseDetail,
  courseOverview,
  courseTasks,
  mutateCourse,
  saveModule,
  queueTask,
  processCourseTask,
} from "../lib/courses/service";
import {
  credential,
  discover,
  requireModel,
  speech,
  saveCredential,
} from "../lib/courses/providers";
import {
  courseConnections,
  useSharedCredential,
} from "../lib/courses/shared-credentials";
import { submitVideo, pollVideo } from "../lib/courses/video";
import { resumeVideo } from "../lib/courses/video-jobs";
import { settingsSchema, lessonSchema } from "../lib/courses/schema";
import { fakeVideoModel } from "./helpers/ai-video-fixture";
test("Ajustes unificados, carpetas, catálogos y video asíncrono aislado", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    u = { id: "media-" + tag, role: "OWNER" },
    original = globalThis.fetch,
    oldCredentials = await db.aICourseCredential.findMany(),
    oldProfiles = await db.providerConnection.findMany({
      where: { provider: { in: ["google", "fal"] } },
    });
  await db.user.create({
    data: {
      id: u.id,
      email: u.id + "@example.test",
      name: "QA Media",
      passwordHash: "synthetic",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  let submits = 0,
    polls = 0,
    paid = 0,
    ready = false,
    failPoll = false;
  const mp4 = Buffer.from("000000186674797069736f6d0000000069736f6d", "hex");
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      headers = new Headers(init?.headers);
    if (url.startsWith("https://api.fal.ai/v1/models?")) {
      assert.equal(headers.get("Authorization"), "Key synthetic-fal-media");
      return Response.json({
        models: [
          fakeVideoModel(),
          fakeVideoModel("fal-ai/kling-video/v3/pro/text-to-video"),
          fakeVideoModel("fal-ai/ltx-2.3/text-to-video"),
        ],
        has_more: false,
      });
    }
    if (
      url.startsWith("https://generativelanguage.googleapis.com/v1beta/models?")
    ) {
      assert.equal(headers.get("x-goog-api-key"), "synthetic-google-media");
      return Response.json({
        models: [
          {
            name: "models/gemini-3.8-flash-tts",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-omni-1.1-flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/veo-3.1-generate-preview",
            supportedGenerationMethods: ["predictLongRunning"],
          },
          {
            name: "models/gemini-3.1-flash-image",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    }
    if (
      url === "https://generativelanguage.googleapis.com/v1beta/interactions"
    ) {
      const b = JSON.parse(String(init?.body));
      assert.equal(b.response_format.type, "video");
      assert.equal(b.response_format.delivery, "uri");
      return Response.json({
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "video",
                mime_type: "video/mp4",
                uri: "https://generativelanguage.googleapis.com/v1beta/files/qa-google:download?alt=media",
              },
            ],
          },
        ],
      });
    }
    if (
      url === "https://generativelanguage.googleapis.com/v1beta/files/qa-google"
    )
      return Response.json({ state: "ACTIVE" });
    if (url.includes("/files/qa-google:download"))
      return new Response(mp4, { headers: { "Content-Type": "video/mp4" } });
    if (url.includes("/v1beta/voices?"))
      return Response.json({ voices: [{ id: "Kore", display_name: "Kore" }] });
    if (url.includes("gemini-3.8-flash-tts:generateContent")) {
      paid++;
      const body = JSON.parse(String(init?.body));
      assert.equal(
        body.generationConfig.speechConfig.voiceConfig.voice,
        "Kore",
      );
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/wav",
                    data: Buffer.from("RIFFsyntheticWAVE").toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      });
    }
    if (url === "https://queue.fal.run/fal-ai/wan/v2.7/text-to-video") {
      assert.equal(init?.method, "POST");
      submits++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.duration, "5");
      assert.equal(body.resolution, "720p");
      return Response.json({
        request_id: "qa-" + tag,
        status_url:
          "https://queue.fal.run/fal-ai/wan/requests/qa-" + tag + "/status",
        response_url: "https://queue.fal.run/fal-ai/wan/requests/qa-" + tag,
      });
    }
    if (url.endsWith("/status") && url.startsWith("https://queue.fal.run/")) {
      polls++;
      if (failPoll) return new Response("", { status: 503 });
      return Response.json({ status: ready ? "COMPLETED" : "IN_PROGRESS" });
    }
    if (url.startsWith("https://queue.fal.run/") && url.includes("/requests/"))
      return Response.json({ video: { url: "https://v3.fal.media/qa.mp4" } });
    if (url === "https://v3.fal.media/qa.mp4") {
      assert(!headers.has("Authorization"));
      return new Response(mp4, { headers: { "Content-Type": "video/mp4" } });
    }
    throw Error("Real traffic prohibited: unexpected synthetic endpoint");
  };
  let cid = "";
  try {
    await t.test(
      "Crear carpeta requiere solo metadatos y pegar temario crea módulos sin llamadas IA",
      async () => {
        const c = await createCourse(u, {
          title: "Excel y Power BI",
          kind: "program",
          description: "Curso para directores de escuela",
          settings: {
            audience: "other",
            audienceDetail: "Directores de escuela",
          },
        });
        cid = c.id;
        let d = await courseDetail(u, cid);
        assert.equal(d.prompt, "");
        assert.equal(d.modules.length, 0);
        const l = (await courseList(u)).find((c) => c.id === cid)!;
        assert.equal(l.description, "Curso para directores de escuela");
        assert.equal(
          (l.settings as any).audienceDetail,
          "Directores de escuela",
        );
        await mutateCourse(u, cid, "import-modules", {
          revision: d.revision,
          data: {
            text: "Módulo 1: Excel\nTablas y fórmulas\nMódulo 2: Power BI\nInformes",
          },
        });
        d = await courseDetail(u, cid);
        assert.equal(d.modules.length, 2);
        assert.equal(d.modules[0].brief, "Tablas y fórmulas");
        assert.equal(submits + paid, 0);
      },
    );
    await t.test(
      "Claves compartidas por referencia: Google sirve voz, imagen y video; excluye modelos retirados",
      async () => {
        for (const [provider, key] of [
          ["google", "synthetic-google-media"],
          ["fal", "synthetic-fal-media"],
        ])
          await db.providerConnection.upsert({
            where: { provider },
            create: {
              provider,
              encryptedKey: encryptKey(key),
              maskedKey: "••••media",
            },
            update: {
              encryptedKey: encryptKey(key),
              maskedKey: "••••media",
              revision: { increment: 1 },
            },
          });
        await useSharedCredential("gemini");
        await discover("gemini");
        const c = await credential("gemini");
        assert.equal(c.key, "synthetic-google-media");
        const row = await db.aICourseCredential.findUniqueOrThrow({
          where: { provider: "gemini" },
        });
        assert.equal(row.encryptedKey, null);
        const models = row.models as any[];
        assert(
          models.some(
            (m) => m.kind === "video" && m.id === "gemini-omni-1.1-flash",
          ),
        );
        assert(models.some((m) => m.kind === "speech"));
        assert(models.some((m) => m.kind === "image"));
        assert(!models.some((m) => m.id === "veo-3.1-generate-preview"));
        const publicRows = JSON.stringify(await courseConnections());
        assert(!publicRows.includes("encryptedKey"));
        assert(!publicRows.includes("synthetic-google-media"));
        const audio = await speech(
          "gemini",
          "gemini-3.8-flash-tts",
          "Kore",
          "Hola",
        );
        assert.equal(audio.mime, "audio/wav");
        assert.equal(paid, 1);
      },
    );
    await t.test(
      "Claves anteriores se conservan hasta elegir compartir; cambio de clave invalida catálogo",
      async () => {
        await saveCredential({
          provider: "gemini",
          key: "synthetic-legacy-google",
        });
        assert.equal(
          (await credential("gemini")).key,
          "synthetic-legacy-google",
        );
        await useSharedCredential("gemini");
        await discover("gemini");
        await db.providerConnection.update({
          where: { provider: "google" },
          data: { revision: { increment: 1 } },
        });
        await assert.rejects(
          () => requireModel("gemini", "gemini-omni-1.1-flash", "video"),
          /Consulta los modelos/,
        );
        const row = (await courseConnections()).find(
          (c) => c.provider === "gemini",
        )!;
        assert.equal((row.models as any[]).length, 0);
      },
    );
    await t.test(
      "Video se envía una vez; polling guarda MP4 y no filtra seguimiento a la interfaz",
      async () => {
        await useSharedCredential("fal");
        await discover("fal");
        let d = await courseDetail(u, cid);
        const m = d.modules[0],
          lesson = lessonSchema.parse({
            objectives: ["Aprender"],
            scenes: [
              {
                title: "Escena",
                kind: "story",
                narration: "Explicación",
                steps: ["Paso uno"],
              },
            ],
            exercise: "Practica",
            solution: "Solución",
          });
        await saveModule(u, cid, m.id, {
          revision: m.revision,
          data: {
            title: m.title,
            brief: m.brief,
            minutes: 5,
            style: "story",
            lesson,
          },
        });
        d = await courseDetail(u, cid);
        await mutateCourse(u, cid, "save", {
          revision: d.revision,
          data: {
            title: d.title,
            kind: d.kind,
            description: d.description,
            prompt: d.prompt,
            settings: {
              ...settingsSchema.parse(d.settings),
              videoProvider: "fal",
              videoModel: "fal-ai/wan/v2.7/text-to-video",
              videoResolution: "720p",
              videoDuration: 5,
            },
          },
        });
        d = await courseDetail(u, cid);
        const body = {
          requestId: randomUUID(),
          kind: "VIDEO",
          revision: d.revision,
          moduleId: m.id,
          scene: 0,
          prompt: "Historia educativa",
        };
        const job = await queueTask(u, cid, body, async () => {});
        assert.equal(await processCourseTask(job.id), "WAIT");
        assert.equal(submits, 1);
        const tasks = JSON.stringify(await courseTasks(u, cid));
        assert(!tasks.includes("queue.fal.run"));
        assert(!tasks.includes("leaseToken"));
        await Promise.all([
          processCourseTask(job.id),
          processCourseTask(job.id),
        ]);
        assert.equal(submits, 1);
        ready = true;
        const r = await db.aICourseTask.findUniqueOrThrow({
          where: { id: job.id },
        });
        await db.aICourseTask.update({
          where: { id: job.id },
          data: {
            input: {
              ...(r.input as any),
              remote: { ...(r.input as any).remote, pollAfter: 0 },
            },
          },
        });
        await processCourseTask(job.id);
        const saved = await db.aICourseAsset.findFirstOrThrow({
          where: { moduleId: m.id, kind: "VIDEO" },
        });
        assert.equal(saved.mime, "video/mp4");
        await processCourseTask(job.id);
        assert.equal(submits, 1);
        assert.equal(
          (await db.aICourseTask.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "COMPLETED",
        );
      },
    );
    await t.test(
      "Recuperar un video tras fallo de lectura reutiliza el seguimiento sin reenviar generación",
      async () => {
        let c = await courseDetail(u, cid),
          m = c.modules[0];
        await saveModule(u, cid, m.id, {
          revision: m.revision,
          data: {
            title: m.title,
            brief: m.brief,
            minutes: m.minutes,
            style: m.style as any,
            lesson: m.lesson,
          },
        });
        c = await courseDetail(u, cid);
        const job = await queueTask(
          u,
          cid,
          {
            requestId: randomUUID(),
            kind: "VIDEO",
            revision: c.revision,
            moduleId: m.id,
            scene: 0,
            prompt: "Otra escena",
          },
          async () => {},
        );
        await processCourseTask(job.id);
        const before = submits;
        failPoll = true;
        await processCourseTask(job.id);
        assert(
          (await courseTasks(u, cid)).find((t) => t.id === job.id)?.canResume,
        );
        let dispatched = 0;
        await resumeVideo(u, cid, job.id, async () => {
          dispatched++;
        });
        assert.equal(dispatched, 1);
        failPoll = false;
        ready = true;
        await processCourseTask(job.id);
        assert.equal(submits, before);
        assert.equal(
          (await db.aICourseTask.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "COMPLETED",
        );
      },
    );
    await t.test(
      "Google video usa Interactions con parámetros documentados y descarga privada",
      async () => {
        await discover("gemini");
        const c = await credential("gemini"),
          s = settingsSchema.parse({
            videoProvider: "gemini",
            videoModel: "gemini-omni-1.1-flash",
            videoDuration: 6,
            videoResolution: "720p",
          });
        const r = await submitVideo(s, "Escena educativa", c.revision);
        assert.equal(r.kind, "file");
        const bytes = await pollVideo(s, r, c.revision);
        assert.equal(bytes?.subarray(4, 8).toString(), "ftyp");
      },
    );
    await t.test(
      "Permisos y reintentos conservan cargos; ninguna consulta crea otro video",
      async () => {
        const d = await courseDetail(u, cid);
        await db.user.update({
          where: { id: u.id },
          data: { aiAccessEnabled: false },
        });
        await assert.rejects(() => courseOverview(u, cid), /OWNER/);
        assert.equal(submits, 2);
        await db.user.update({
          where: { id: u.id },
          data: { aiAccessEnabled: true },
        });
      },
    );
  } finally {
    globalThis.fetch = original;
    for (const a of await db.aICourseAsset.findMany({
      where: { module: { courseId: cid } },
    }))
      await remove(a.path);
    await db.aICourseAsset.deleteMany({ where: { module: { courseId: cid } } });
    await db.aICourseMaterial.deleteMany({
      where: { module: { courseId: cid } },
    });
    await db.aICourseTask.deleteMany({ where: { courseId: cid } });
    await db.aICourseModule.deleteMany({ where: { courseId: cid } });
    await db.aICourse.deleteMany({ where: { id: cid } });
    await db.rateLimit.deleteMany({ where: { key: "courses:" + u.id } });
    await db.user.deleteMany({ where: { id: u.id } });
    await db.aICourseCredential.deleteMany();
    for (const c of oldCredentials)
      await db.aICourseCredential.create({
        data: { ...c, models: c.models as any, voices: c.voices as any },
      });
    await db.providerConnection.deleteMany({
      where: { provider: { in: ["google", "fal"] } },
    });
    for (const p of oldProfiles)
      await db.providerConnection.create({
        data: { ...p, models: p.models as any },
      });
    await db.$disconnect();
  }
});
