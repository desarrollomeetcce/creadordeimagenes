import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { demand } from "../errors";
import { rateLimit } from "../auth";
import { load } from "../storage";
import { z } from "zod";
import {
  courseOwner,
  courseList,
  courseDetail,
  courseOverview,
  courseModule,
  courseTasks,
  createCourse,
  mutateCourse,
  saveModule,
  saveMaterial,
  addMaterial,
  queueTask,
  queueTasks,
} from "./service";
import { saveCredential, discover, providerSchema } from "./providers";
import { lessonSchema, materialOutput } from "./schema";
import {
  lessonDocument,
  documentHTML,
  documentDOCX,
  documentPPTX,
  csv,
} from "./exports";
export async function courseRoutes(
  req: NextRequest,
  parts: string[],
  u: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  await courseOwner(u);
  const p = parts.slice(1),
    method = req.method;
  const send = (v: unknown, status = 200) =>
    NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
  if (p.length === 0 && method === "GET") return send(await courseList(u));
  if (p.length === 0 && method === "POST")
    return send(await createCourse(u, await body()), 201);
  if (p[0] === "providers") {
    if (p.length === 1 && method === "GET")
      return send(
        await db.aICourseCredential.findMany({
          select: {
            provider: true,
            maskedKey: true,
            models: true,
            voices: true,
            verifiedAt: true,
          },
        }),
      );
    if (p.length === 1 && method === "POST")
      return send(await saveCredential(await body()));
    if (p.length === 3 && p[2] === "discover" && method === "POST") {
      await rateLimit("courses:catalog:" + u.id, 12);
      return send(await discover(providerSchema.parse(p[1])));
    }
  }
  if (p[0] === "assets" && p.length === 2 && method === "GET") {
    const a = await db.aICourseAsset.findFirst({
      where: { id: p[1], module: { course: { archivedAt: null } } },
    });
    demand(a, "Recurso no encontrado.", 404);
    const bytes = await load(a.path);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": a.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const id = p[0];
  if (p.length === 2 && p[1] === "tasks" && method === "GET")
    return send(await courseTasks(u, id));
  if (p.length === 1 && method === "GET")
    return send(await courseOverview(u, id));
  if (p.length === 2 && method === "POST") {
    if (p[1] === "batch")
      return send(await queueTasks(u, id, await body()), 202);
    if (p[1] === "tasks")
      return send(await queueTask(u, id, await body()), 202);
    if (["save", "archive", "add-module", "reorder"].includes(p[1]))
      return send(await mutateCourse(u, id, p[1], await body()));
  }
  if (p[1] === "modules" && p[2]) {
    if (p.length === 5 && p[3] === "materials" && method === "PATCH")
      return send(await saveMaterial(u, id, p[2], p[4], await body()));
    if (p.length === 3 && method === "GET")
      return send(await courseModule(u, id, p[2]));
    if (p.length === 3 && method === "PATCH")
      return send(await saveModule(u, id, p[2], await body()));
    if (p[3] === "materials" && method === "POST")
      return send(await addMaterial(u, id, p[2], await body()), 201);
    if (p[3] === "export" && method === "GET") {
      const m = await courseModule(u, id, p[2]);
      demand(m, "Módulo no encontrado.", 404);
      const materialId = req.nextUrl.searchParams.get("material");
      const material = materialId
        ? m.materials.find((m) => m.id === materialId)
        : null;
      demand(!materialId || material, "Material no encontrado.", 404);
      const format = z
          .enum(["html", "docx", "pptx", "json", "csv", "code"])
          .parse(req.nextUrl.searchParams.get("format") ?? "html"),
        answers = req.nextUrl.searchParams.get("answers") === "1";
      const title = material?.title ?? m.title;
      const doc = material
        ? { title, ...materialOutput.parse(material.content) }
        : lessonDocument(title, lessonSchema.parse(m.lesson));
      let bytes: Buffer, mime: string, ext: string;
      if (format === "html") {
        bytes = Buffer.from(
          documentHTML(doc, answers, material?.kind === "slides"),
        );
        mime = "text/html; charset=utf-8";
        ext = "html";
      } else if (format === "pptx") {
        const slides = material
          ? doc
          : {
              title: m.title,
              sections: lessonSchema.parse(m.lesson).scenes.map((s) => ({
                title: s.title,
                body: s.steps.join("\n") + (s.code ? "\n\n" + s.code : ""),
              })),
            };
        bytes = await documentPPTX(slides);
        mime =
          "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        ext = "pptx";
      } else if (format === "docx") {
        bytes = await documentDOCX(doc, answers);
        mime =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        ext = "docx";
      } else if (format === "json") {
        bytes = Buffer.from(
          JSON.stringify(material ? doc : { title, lesson: m.lesson }, null, 2),
        );
        mime = "application/json";
        ext = "json";
      } else {
        const lesson = lessonSchema.parse(m.lesson);
        if (format === "csv") {
          const scenes = lesson.scenes.filter((s) => s.columns.length);
          demand(scenes.length, "No hay tablas en este módulo.");
          bytes = Buffer.from(
            scenes.map((s) => csv(s.columns, s.rows)).join("\r\n\r\n"),
          );
          mime = "text/csv; charset=utf-8";
          ext = "csv";
        } else {
          bytes = Buffer.from(
            lesson.scenes
              .filter((s) => s.code)
              .map((s) => s.code)
              .join("\n\n"),
          );
          demand(bytes.length, "No hay código en este módulo.");
          mime = "text/plain; charset=utf-8";
          ext = "txt";
        }
      }
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="curso.${ext}"; filename*=UTF-8''${encodeURIComponent(title + "." + ext)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          ...(format === "html"
            ? {
                "Content-Security-Policy":
                  "default-src 'none'; style-src 'unsafe-inline'; sandbox allow-modals",
              }
            : {}),
        },
      });
    }
  }
  return send({ error: "Ruta de Cursos IA no encontrada." }, 404);
}
