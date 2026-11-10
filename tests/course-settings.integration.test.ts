import { Prisma } from "@prisma/client";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
test(
  "Cursos: configuración técnica aislada y temario con OpenAI/Gemini conectados simultáneamente",
  { skip: process.env.RUN_COURSE_SETTINGS_QA !== "1" },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const { db } = await import("../lib/db"),
      { encryptKey } = await import("../lib/crypto"),
      { settingsSchema } = await import("../lib/courses/schema"),
      { technicalSettings } = await import("../lib/courses/technical-settings"),
      { courseRoutes } = await import("../lib/courses/routes"),
      { NextRequest } = await import("next/server"),
      { createCourse, courseDetail, queueTask, processCourseTask } =
        await import("../lib/courses/service");
    const tag = randomUUID(),
      actor = await db.user.create({
        data: {
          email: tag + "@example.invalid",
          name: "Settings QA",
          passwordHash: "synthetic",
          role: "OWNER",
          status: "APPROVED",
        },
      }),
      beforeDefaults = await db.aICourseDefaults.findUnique({
        where: { id: "global" },
      }),
      beforeCreds = await db.aICourseCredential.findMany({
        where: { provider: { in: ["openai", "gemini"] } },
      }),
      originalFetch = globalThis.fetch;
    const courses: string[] = [];
    let kept = "";
    try {
      await db.aICourseCredential.deleteMany({
        where: { provider: { in: ["openai", "gemini"] } },
      });
      for (const [provider, model] of [
        ["openai", "gpt-5-mini"],
        ["gemini", "gemini-2.5-flash"],
      ])
        await db.aICourseCredential.create({
          data: {
            provider,
            shared: false,
            encryptedKey: encryptKey(
              "synthetic-key-for-qa",
              "courses:" + provider,
            ),
            models: [{ id: model, name: model, kind: "text" }],
            verifiedAt: new Date(),
          },
        });
      const legacy = settingsSchema.parse({
        audience: "children",
        moduleCount: 12,
        minutes: 45,
        style: "animation",
        model: "gpt-5-mini",
      });
      await db.aICourseDefaults.upsert({
        where: { id: "global" },
        create: { id: "global", settings: legacy, revision: 50 },
        update: { settings: legacy, revision: 50 },
      });
      const read = async (method: string, body?: unknown) =>
        courseRoutes(
          new NextRequest("http://localhost/api/courses-ai/defaults", {
            method,
          }),
          ["courses-ai", "defaults"],
          actor,
          async () => body,
        );
      const initial = await (await read("GET")).json();
      assert.equal(initial.settings.moduleCount, 6);
      assert.equal(initial.settings.minutes, 10);
      assert.equal(initial.settings.audience, "professionals");
      const existing = await createCourse(actor, {
        title: "Existing " + tag,
        settings: legacy,
      });
      courses.push(existing.id);
      const saved = await (
        await read("POST", {
          revision: 50,
          settings: technicalSettings({
            ...legacy,
            provider: "gemini",
            model: "gemini-2.5-flash",
          }),
        })
      ).json();
      assert.equal(saved.settings.minutes, 10);
      assert.equal(
        settingsSchema.parse((await courseDetail(actor, existing.id)).settings)
          .minutes,
        45,
      );
      await assert.rejects(() =>
        read("POST", { revision: 50, settings: technicalSettings(legacy) }),
      );
      let calls = 0;
      const outline = JSON.stringify({
        modules: Array.from({ length: 12 }, (_, i) => ({
          title: "Lección " + (i + 1),
          brief: "Objetivo y práctica",
          minutes: 10,
          style: "inherit",
        })),
      });
      globalThis.fetch = async (input, init) => {
        calls++;
        const url = String(input),
          body = JSON.parse(String(init?.body));
        if (url === "https://api.openai.com/v1/responses") {
          assert.equal(body.model, "gpt-5-mini");
          assert(!body.text);
          return Response.json({
            status: "completed",
            output: [{ content: [{ type: "output_text", text: outline }] }],
            usage: { output_tokens: 20 },
          });
        }
        if (
          url ===
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        )
          return Response.json({
            candidates: [
              { finishReason: "STOP", content: { parts: [{ text: outline }] } },
            ],
            usageMetadata: { totalTokenCount: 20 },
          });
        throw Error("Unexpected provider call");
      };
      for (const [provider, model] of [
        ["openai", "gpt-5-mini"],
        ["gemini", "gemini-2.5-flash"],
      ]) {
        const c = await createCourse(actor, {
          title: provider + " " + tag,
          prompt: "Un curso profesional de Python",
          settings: settingsSchema.parse({
            provider,
            model,
            moduleCount: 12,
            minutes: 10,
          }),
        });
        courses.push(c.id);
        const detail = await courseDetail(actor, c.id);
        const task = await queueTask(
          actor,
          c.id,
          {
            requestId: randomUUID(),
            revision: detail.revision,
            kind: "OUTLINE",
          },
          async () => {},
        );
        await processCourseTask(task.id);
        const result = await db.aICourseTask.findUniqueOrThrow({
          where: { id: task.id },
        });
        assert.equal(result.status, "COMPLETED", result.error ?? "");
        assert.equal((await courseDetail(actor, c.id)).modules.length, 12);
      }
      assert.equal(calls, 2);
      if (process.env.KEEP_COURSE_SETTINGS_QA === "1") {
        const empty = await createCourse(actor, {
          title: "Outline browser " + tag,
          settings: {},
        });
        courses.push(empty.id);
        kept = empty.id;
        const session = randomUUID();
        await db.session.create({
          data: {
            id: createHash("sha256").update(session).digest("hex"),
            userId: actor.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        await writeFile(
          "/tmp/course-settings-fixture.json",
          JSON.stringify({
            actor: actor.id,
            courseId: empty.id,
            title: "Outline browser " + tag,
            session,
          }),
        );
      }
      console.log(
        "PASS technical defaults preserve existing courses; two connected providers each generate 12 modules; exactly two mocked calls, no retries",
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const id of courses.filter((id) => id !== kept)) {
        await db.aICourseTask.deleteMany({ where: { courseId: id } });
        await db.aICourseModule.deleteMany({ where: { courseId: id } });
        await db.aICourse.delete({ where: { id } });
      }
      await db.aICourseDefaults.deleteMany({ where: { id: "global" } });
      if (beforeDefaults)
        await db.aICourseDefaults.create({
          data: {
            ...beforeDefaults,
            settings:
              beforeDefaults.settings === null
                ? Prisma.JsonNull
                : beforeDefaults.settings,
          },
        });
      await db.aICourseCredential.deleteMany({
        where: { provider: { in: ["openai", "gemini"] } },
      });
      if (beforeCreds.length)
        await db.aICourseCredential.createMany({
          data: beforeCreds.map((c) => ({
            ...c,
            models: c.models === null ? Prisma.JsonNull : c.models,
            voices: c.voices === null ? Prisma.JsonNull : c.voices,
          })),
        });
      if (!kept) await db.user.delete({ where: { id: actor.id } });
      await db.$disconnect();
    }
  },
);
