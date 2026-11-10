import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test(
  "Videoclase: MP4 real en servidor, idempotencia, permisos, Vimeo TUS y recuperación sin duplicados",
  { skip: process.env.RUN_CLASSROOM_QA !== "1" },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const { db } = await import("../lib/db"),
      { lessonSchema } = await import("../lib/courses/schema"),
      { createCourse, mutateCourse, courseDetail, saveModule, deleteModule } =
        await import("../lib/courses/service"),
      { queueRender, processOneRender, renderStatus } =
        await import("../lib/courses/render-jobs"),
      {
        saveVimeo,
        queueVimeo,
        processOneVimeo,
        uploads,
        resumeVimeo,
        vimeoConnection,
      } = await import("../lib/courses/vimeo"),
      { store, load, remove } = await import("../lib/storage");
    const tag = randomUUID(),
      actor = await db.user.create({
        data: {
          name: "Classroom QA",
          email: tag + "@example.invalid",
          passwordHash: "synthetic",
          role: "OWNER",
          status: "APPROVED",
        },
      }),
      stranger = await db.user.create({
        data: {
          name: "Other",
          email: "x" + tag + "@example.invalid",
          passwordHash: "synthetic",
          role: "USER",
          status: "APPROVED",
        },
      });
    const folder = await mkdtemp(join(tmpdir(), "classroom-qa-")),
      originalFetch = globalThis.fetch,
      paths: string[] = [];
    let id = "";
    const oldConnection = await db.aICourseVimeoConnection.findUnique({
      where: { id: "global" },
    });
    await db.aICourseVimeoConnection.deleteMany();
    globalThis.fetch = async () => {
      throw Error("No external providers in QA");
    };
    try {
      const course = await createCourse(actor, {
        title: "Videoclase QA",
        settings: { style: "whiteboard" },
      });
      id = course.id;
      const before = await courseDetail(actor, id);
      const changed = await mutateCourse(actor, id, "add-module", {
        revision: before.revision,
        data: {
          title: "Matemáticas y datos",
          brief: "Ejemplo práctico",
          minutes: 1,
          style: "inherit",
        },
      });
      const detail = await courseDetail(actor, id),
        module = detail.modules[0];
      const lesson = lessonSchema.parse({
        objectives: ["Resolver y comprobar"],
        scenes: [
          {
            kind: "whiteboard",
            title: "Paso a paso",
            narration: "Primero sumamos doce y ocho, y dividimos entre cuatro.",
            steps: ["12 + 8 = 20", "20 / 4 = 5"],
            drawings: [
              { kind: "circle", x: 120, y: 80, label: "20", step: 0 },
              { kind: "arrow", x: 350, y: 100, step: 1 },
              { kind: "label", x: 600, y: 100, label: "5", step: 1 },
            ],
          },
          {
            kind: "code",
            title: "Python · explicación",
            narration: "Revisamos el código sin afirmar que ya se ejecutó.",
            steps: ["Creamos una lista", "Calculamos la suma"],
            code: "ventas = [12, 8]\nprint(sum(ventas))",
          },
          {
            kind: "spreadsheet",
            title: "Panel de datos",
            narration: "Exploramos los valores de práctica.",
            steps: ["Filas de datos", "Comparamos cantidades"],
            columns: ["Zona", "Ventas"],
            rows: [
              ["Norte", "12"],
              ["Sur", "8"],
            ],
          },
          {
            kind: "animation",
            title: "Aprender con dibujos",
            narration: "Observamos el agua y los árboles.",
            steps: ["El sol aporta energía", "Las plantas necesitan agua"],
            drawings: [
              { kind: "sun", x: 100, y: 40, motion: "float" },
              { kind: "tree", x: 320, y: 180 },
              { kind: "water", x: 600, y: 210, motion: "slide" },
              { kind: "person", x: 750, y: 180, motion: "float" },
            ],
          },
        ],
        exercise: "Calcula otra suma",
        solution: "Comprueba los pasos",
        practice: [
          {
            kind: "calculation",
            question: "12+8",
            expression: "12+8",
            explanation: "20",
          },
        ],
      });
      const m = await saveModule(actor, id, module.id, {
        revision: module.revision,
        data: { title: module.title, minutes: 1, style: "whiteboard", lesson },
      });
      const current = await db.aICourseModule.findUniqueOrThrow({
        where: { id: module.id },
      });
      await promisify(execFile)("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
        "-c:a",
        "pcm_s16le",
        join(folder, "voice.wav"),
      ]);
      const wav = await readFile(join(folder, "voice.wav"));
      for (let i = 0; i < lesson.scenes.length; i++) {
        const path = await store(wav);
        paths.push(path);
        await db.aICourseAsset.create({
          data: {
            moduleId: module.id,
            revision: current.revision,
            scene: i,
            kind: "SPEECH",
            path,
            mime: "audio/wav",
          },
        });
      }
      const request = {
        requestId: randomUUID(),
        revision: current.revision,
        resolution: "720p",
      };
      const queued = await queueRender(actor, id, module.id, request);
      assert.equal(
        (await queueRender(actor, id, module.id, request)).render?.id,
        queued.render?.id,
      );
      await assert.rejects(() => queueRender(stranger, id, module.id, request));
      await assert.rejects(() =>
        saveModule(actor, id, module.id, {
          revision: current.revision,
          data: { title: "No editar" },
        }),
      );
      const started = performance.now();
      await processOneRender();
      const elapsedMs = performance.now() - started;
      const status = await renderStatus(actor, id, module.id),
        render = status.renders[0];
      assert.equal(render.status, "COMPLETED", render.error ?? "");
      assert.equal(render.progress, 100);
      const asset = await db.aICourseAsset.findUniqueOrThrow({
        where: { id: render.assetId! },
      });
      paths.push(asset.path);
      const video = await load(asset.path);
      assert.equal(video.subarray(4, 8).toString(), "ftyp");
      await writeFile(join(folder, "video.mp4"), video);
      const probe = JSON.parse(
        (
          await promisify(execFile)("ffprobe", [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            join(folder, "video.mp4"),
          ])
        ).stdout,
      );
      assert(probe.streams.some((s: any) => s.codec_type === "audio"));
      assert(
        probe.streams.some((s: any) => s.width === 1280 && s.height === 720),
      );
      assert(Math.abs(Number(probe.format.duration) - 12) < 1);
      assert.equal(
        (
          await queueRender(actor, id, module.id, {
            ...request,
            requestId: randomUUID(),
          })
        ).render?.id,
        render.id,
      );
      let creates = 0,
        patches = 0,
        offset = 0,
        losePatch = true;
      const transferChunks: Buffer[] = [];
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.startsWith("https://api.vimeo.com/me?"))
          return Response.json({ uri: "/users/12345", name: "QA Vimeo" });
        if (url === "https://api.vimeo.com/me/videos") {
          creates++;
          assert.equal(JSON.parse(String(init?.body)).privacy.view, "nobody");
          return Response.json({
            uri: "/videos/67890",
            upload: { upload_link: "https://files.tus.vimeo.com/upload/qa" },
          });
        }
        if (url === "https://files.tus.vimeo.com/upload/qa") {
          assert(!new Headers(init?.headers).has("Authorization"));
          if (init?.method === "HEAD")
            return new Response(null, {
              status: 200,
              headers: { "Upload-Offset": String(offset) },
            });
          if (init?.method === "PATCH") {
            patches++;
            assert.equal(
              Number(new Headers(init.headers).get("Upload-Offset")),
              offset,
            );
            const chunk = Buffer.from(init.body as Uint8Array);
            transferChunks.push(chunk);
            offset += chunk.length;
            if (losePatch) {
              losePatch = false;
              throw Error("Acknowledgement lost after chunk accepted");
            }
            return new Response(null, {
              status: 204,
              headers: { "Upload-Offset": String(offset) },
            });
          }
        }
        if (
          url === "https://api.vimeo.com/videos/67890?fields=uri,upload.status"
        )
          return Response.json({
            uri: "/videos/67890",
            upload: { status: "complete" },
          });
        throw Error("Unexpected provider request");
      };
      await saveVimeo(actor, {
        token: "synthetic-vimeo-token-not-real",
        revision: 0,
      });
      const connection = await vimeoConnection(actor);
      assert(!JSON.stringify(connection).includes("encryptedToken"));
      assert(!JSON.stringify(connection).includes("synthetic-vimeo-token"));
      const upload = await queueVimeo(actor, id, module.id, {
        requestId: randomUUID(),
        renderId: render.id,
        connectionRevision: connection.connection!.revision,
        connectionGeneration: connection.connection!.generation,
      });
      await processOneVimeo();
      assert.equal(
        (await uploads(actor, id, module.id)).uploads[0].status,
        "PAUSED",
      );
      await resumeVimeo(actor, id, module.id, upload.upload!.id);
      await processOneVimeo();
      assert.equal(
        (await uploads(actor, id, module.id)).uploads[0].status,
        "COMPLETED",
      );
      assert.equal(creates, 1);
      assert.equal(patches, 1);
      assert.deepEqual(Buffer.concat(transferChunks), video);
      const { nextBuildStep } = await import("../lib/courses/builds");
      const { settingsSchema } = await import("../lib/courses/schema");
      await db.aICourse.update({
        where: { id },
        data: {
          settings: { ...settingsSchema.parse({}), exportResolution: "1080p" },
        },
      });
      const build = await db.aICourseBuild.create({
        data: {
          courseId: id,
          actorId: actor.id,
          requestId: randomUUID(),
          resources: [
            { kind: "video", modules: "all", count: 1, instructions: "" },
          ],
          credentialRevisions: {},
          moduleIds: [module.id],
          totalModules: 1,
        },
      });
      assert.equal((await nextBuildStep(build.id)).state, "NEXT");
      assert.equal((await nextBuildStep(build.id)).state, "DONE");
      const queuedHD = await db.aICourseRender.findFirstOrThrow({
        where: { moduleId: module.id, resolution: "1080p" },
      });
      assert.equal(queuedHD.status, "PENDING");
      await processOneRender();
      const hd = await db.aICourseRender.findUniqueOrThrow({
        where: { id: queuedHD.id },
      });
      assert.equal(hd.status, "COMPLETED", hd.error ?? "");
      paths.push(
        (
          await db.aICourseAsset.findUniqueOrThrow({
            where: { id: hd.assetId! },
          })
        ).path,
      );
      // A lost response to video creation must never trigger another automatic POST.
      globalThis.fetch = async (input, init) => {
        if (String(input) === "https://api.vimeo.com/me/videos") {
          creates++;
          throw Error("Lost creation response");
        }
        throw Error("No unexpected calls");
      };
      await queueVimeo(actor, id, module.id, {
        requestId: randomUUID(),
        renderId: hd.id,
        connectionRevision: connection.connection!.revision,
        connectionGeneration: connection.connection!.generation,
      });
      await processOneVimeo();
      assert.equal(
        (await uploads(actor, id, module.id)).uploads[0].status,
        "NEEDS_REVIEW",
      );
      await processOneVimeo();
      assert.equal(creates, 2);
      assert.equal(await db.aICourseTask.count({ where: { courseId: id } }), 0);
      console.log(
        JSON.stringify({
          durationSeconds: probe.format.duration,
          renderMs: elapsedMs,
          bytes: video.length,
          render: render.status,
          vimeoCreates: creates,
          patches,
          paidAICalls: 0,
        }),
      );
      if (process.env.KEEP_CLASSROOM_QA === "1") {
        const raw = randomUUID(),
          { createHash } = await import("node:crypto");
        await db.session.create({
          data: {
            id: createHash("sha256").update(raw).digest("hex"),
            userId: actor.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        await writeFile(
          "/tmp/classroom-fixture.json",
          JSON.stringify({
            owner: actor.id,
            courseId: id,
            moduleId: module.id,
            revision: current.revision,
            assetId: asset.id,
            session: raw,
          }),
        );
        await writeFile("/tmp/classroom-sample.mp4", video);
        id = "";
      }
    } finally {
      globalThis.fetch = originalFetch;
      if (id) {
        await db.aICourseAsset.deleteMany({
          where: { module: { courseId: id } },
        });
        await db.aICourseModule.deleteMany({ where: { courseId: id } });
        await db.aICourse.delete({ where: { id } });
        await db.user.delete({ where: { id: actor.id } });
        for (const path of paths) await remove(path).catch(() => {});
      }
      await db.user.delete({ where: { id: stranger.id } });
      await db.aICourseVimeoConnection.deleteMany();
      if (oldConnection)
        await db.aICourseVimeoConnection.create({ data: oldConnection });
      await rm(folder, { recursive: true, force: true });
      await db.$disconnect();
    }
  },
);
