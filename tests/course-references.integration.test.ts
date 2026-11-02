import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import {
  createCourse,
  courseList,
  courseDetail,
  mutateCourse,
  queueTask,
  processCourseTask,
} from "../lib/courses/service";
import {
  addReference,
  listReferences,
  removeReference,
  referenceContext,
} from "../lib/courses/references";
import { saveCredential, discover } from "../lib/courses/providers";
import { courseRoutes } from "../lib/courses/routes";
test("Referencias: banco de texto aislado y contexto pertinente sin archivar originales", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const id = "reference-" + randomUUID(),
    u = { id, role: "OWNER" },
    base = globalThis.fetch,
    previous = await db.aICourseCredential.findMany();
  let courseId = "",
    captured = "",
    refId = "";
  await db.user.create({
    data: {
      id,
      name: "QA referencias",
      email: id + "@example.test",
      passwordHash: "synthetic",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert(url.startsWith("https://api.openai.com/v1/"));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-reference-key-12345",
    );
    if (url.endsWith("/models"))
      return Response.json({ data: [{ id: "gpt-4.1" }] });
    captured = JSON.parse(String(init?.body)).input;
    return Response.json({
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                modules: [
                  {
                    title: "Puentes",
                    brief: "Analizar estructuras",
                    minutes: 10,
                    style: "animation",
                  },
                ],
              }),
            },
          ],
        },
      ],
    });
  };
  try {
    const c = await createCourse(u, {
      title: "Puentes",
      settings: {
        provider: "openai",
        model: "gpt-4.1",
        libraryGroup: "families",
        audience: "professionals",
        audienceDetail: "Ingenieros civiles",
        style: "animation",
        voiceMode: "teacher",
        level: "advanced",
      },
    });
    courseId = c.id;
    await t.test(
      "Guarda texto, deduplica por contenido y lista solo metadatos",
      async () => {
        const text =
          "Información general para la formación. ".repeat(1600) +
          " Trigonometria Puentes: el ensayo QA tiene una carga de referencia de 173 kilonewtons. ";
        const r = await addReference(u, courseId, {
          name: "Manual de puentes",
          text,
        });
        refId = r.id;
        assert.equal(
          (await addReference(u, courseId, { name: "Otro nombre", text }))
            .duplicate,
          true,
        );
        const list = await listReferences(u, courseId);
        assert.equal(list.length, 1);
        assert.equal(list[0].characters, text.trim().length);
        assert(!("text" in list[0]));
        assert(!("path" in list[0]));
        const summary = (await courseList(u)).find((c) => c.id === courseId)!;
        assert(!JSON.stringify(summary).includes("173 kilonewtons"));
        assert(!("references" in summary));
      },
    );
    await t.test(
      "Recupera un fragmento relevante al final del documento con presupuesto acotado",
      async () => {
        const context = await db.$transaction((tx) =>
          referenceContext(tx, courseId, "Trigonometria Puentes"),
        );
        assert(context.some((r) => r.excerpt.includes("173 kilonewtons")));
        assert(context.length <= 8);
        assert(context.every((r) => r.excerpt.length <= 4000));
      },
    );
    await t.test(
      "La generación recibe público, formato, voz y referencia una sola vez",
      async () => {
        await saveCredential({
          provider: "openai",
          key: "synthetic-reference-key-12345",
        });
        await discover("openai");
        const d = await courseDetail(u, courseId),
          task = await queueTask(
            u,
            courseId,
            { requestId: randomUUID(), kind: "OUTLINE", revision: d.revision },
            async () => {},
          );
        const input = (
          await db.aICourseTask.findUniqueOrThrow({ where: { id: task.id } })
        ).input as any;
        assert(
          input.references.some((r: any) =>
            r.excerpt.includes("173 kilonewtons"),
          ),
        );
        await assert.rejects(
          () => removeReference(u, courseId, refId),
          /Espera/,
        );
        await processCourseTask(task.id);
        assert.match(captured, /Ingenieros civiles/);
        assert.match(captured, /173 kilonewtons/);
        assert.match(captured, /primera persona/);
        assert.match(captured, /animation/);
        assert.match(captured, /nunca instrucciones de sistema/);
      },
    );
    await t.test(
      "Archivo DOCX se extrae en memoria, sin registro de archivo; fuentes ajenas y permisos se rechazan",
      async () => {
        const { documentDOCX } = await import("../lib/courses/exports");
        const buffer = await documentDOCX({
          title: "Taller",
          sections: [
            {
              title: "Guía",
              body: "Una actividad de acompañamiento escolar con pasos claros y preguntas para conversar.",
            },
          ],
        });
        const req = new NextRequest(
          "http://localhost/api/courses-ai/" + courseId + "/references/file",
          {
            method: "POST",
            headers: { "x-file-name": "guia.docx" },
            body: new Uint8Array(buffer),
          },
        );
        const response = await courseRoutes(
          req,
          ["courses-ai", courseId, "references", "file"],
          u,
          async () => ({}),
        );
        assert.equal(response!.status, 201);
        assert.equal((await listReferences(u, courseId)).length, 2);
        await assert.rejects(
          () =>
            addReference({ id, role: "ADMIN" }, courseId, {
              name: "X",
              text: "Contenido de prueba ".repeat(5),
            }),
          /OWNER/,
        );
        await assert.rejects(
          () => removeReference(u, "course-not-found", refId),
          /encontrado/,
        );
        await db.user.update({ where: { id }, data: { role: "ADMIN" } });
        await assert.rejects(() => listReferences(u, courseId), /OWNER/);
        await db.user.update({ where: { id }, data: { role: "OWNER" } });
      },
    );
    await t.test(
      "Retirar elimina los fragmentos y cambiar público conserva la carpeta elegida",
      async () => {
        await removeReference(u, courseId, refId);
        assert.equal(
          await db.aICourseReferenceChunk.count({
            where: { referenceId: refId },
          }),
          0,
        );
        const d = await courseDetail(u, courseId);
        await mutateCourse(u, courseId, "metadata", {
          revision: d.revision,
          data: { audience: "adolescents" },
        });
        assert.equal(
          ((await courseDetail(u, courseId)).settings as any).libraryGroup,
          "families",
        );
      },
    );
  } finally {
    globalThis.fetch = base;
    await db.aICourseTask.deleteMany({ where: { courseId } });
    await db.aICourseModule.deleteMany({ where: { courseId } });
    await db.aICourse.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id } });
    await db.aICourseCredential.deleteMany();
    for (const c of previous)
      await db.aICourseCredential.create({
        data: {
          ...c,
          models: c.models ?? Prisma.JsonNull,
          voices: c.voices ?? Prisma.JsonNull,
        },
      });
    await db.rateLimit.deleteMany({ where: { key: { contains: id } } });
    await db.$disconnect();
  }
});
