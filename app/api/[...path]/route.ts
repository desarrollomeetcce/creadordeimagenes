import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "@/lib/db";
import { AppError, demand } from "@/lib/errors";
import {
  actor,
  session,
  ownerOnly,
  rateLimit,
  equalSecret,
  tokenHash,
  projectAccess,
  projectFilter,
  resourceAccess,
} from "@/lib/auth";
import { encryptKey, maskKey } from "@/lib/crypto";
import {
  safeConfiguration,
  connectionCheck,
  configured,
  reserveJobs,
} from "@/lib/ai";
import { providers, adapter, type ModelCapability } from "@/lib/providers";
import {
  defaults,
  effectiveSettings,
  resolveInstructions,
  validateDistribution,
} from "@/lib/inheritance";
import { seedPrompt } from "@/lib/seed-prompt";
import { store, load, remove } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const credentials = z.object({
  email: z
    .email()
    .max(200)
    .transform((x) => x.toLowerCase()),
  password: z.string().min(12).max(128),
  name: z.string().min(1).max(100).optional(),
  token: z.string().optional(),
});
const content = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().max(30000).default(""),
  description: z.string().max(2000).default(""),
});
const settings = z
  .object({
    count: z.number().int().min(1).max(12).optional(),
    textCount: z.number().int().min(0).max(12).optional(),
    imageTextCount: z.number().int().min(0).max(12).optional(),
    imageCount: z.number().int().min(0).max(12).optional(),
    format: z
      .enum(["1:1", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16"])
      .optional(),
    style: z.string().max(300).optional(),
  })
  .strict();
const micros = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(BigInt);
const configSchema = z.object({
  provider: z.string().max(80),
  apiKey: z.string().min(10).max(1000).optional(),
  imageModel: z.string().max(100).nullable().optional(),
  creativeModel: z.string().max(100).nullable().optional(),
  alternatives: z.array(z.string().max(100)).max(5).default([]),
  quality: z.string().max(30),
  resolution: z.string().max(30),
  monthlyLimitMicros: micros,
  dailyLimitMicros: micros,
  operationLimitMicros: micros,
  imageReserveMicros: micros,
  maxGenerations: z.number().int().min(1).max(1000),
});
async function bounded(req: NextRequest, max: number) {
  demand(
    Number(req.headers.get("content-length") ?? 0) <= max,
    "La solicitud es demasiado grande.",
    413,
  );
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AppError("La solicitud es demasiado grande.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function body(req: NextRequest) {
  const raw = (await bounded(req, 100000)).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("La solicitud JSON no es válida.");
  }
}
async function audit(actorId: string, action: string, resourceId?: string) {
  await db.auditEvent.create({ data: { actorId, action, resourceId } });
}
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (req.method !== "GET") {
      demand(
        req.headers.get("origin") ===
          (process.env.APP_ORIGIN ?? "http://localhost:3000"),
        "Origen no autorizado.",
        403,
      );
    }
    const parts = (await params).path,
      route = parts.join("/"),
      method = req.method;
    const send = (value: unknown, status = 200) =>
      NextResponse.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    if (route === "auth/status" && method === "GET")
      return send({ needsSetup: (await db.user.count()) === 0 });
    if (
      ["auth/setup", "auth/register", "auth/login"].includes(route) &&
      method === "POST"
    ) {
      const b = credentials.parse(await body(req));
      await rateLimit("auth:global", 200);
      await rateLimit("auth:" + tokenHash(b.email));
      if (route === "auth/login") {
        const user = await db.user.findUnique({ where: { email: b.email } });
        const dummy =
          "$argon2id$v=19$m=65536,t=3,p=4$C2X8lQ97naJ+dA6gNHSPZg$zrMnmAObyP0Qw11BYl6LBjx2wTmbqkGJT0yXHXXF0ms";
        const ok = await argon2
          .verify(user?.passwordHash ?? dummy, b.password)
          .catch(() => false);
        demand(user && ok, "Correo o contraseña incorrectos.", 401);
        demand(
          user.status === "APPROVED",
          "Tu cuenta todavía no está aprobada o está suspendida.",
          403,
        );
        await session(user.id);
        await audit(user.id, "INICIO_SESION");
        return send({ ok: true });
      }
      const passwordHash = await argon2.hash(b.password, {
        type: argon2.argon2id,
      });
      if (route === "auth/setup") {
        demand(
          process.env.BOOTSTRAP_TOKEN &&
            process.env.BOOTSTRAP_TOKEN.length >= 32 &&
            b.token &&
            equalSecret(b.token, process.env.BOOTSTRAP_TOKEN),
          "Token de instalación inválido.",
          403,
        );
        const user = await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
          demand(
            (await tx.user.count()) === 0,
            "La instalación inicial ya está completada.",
            409,
          );
          const u = await tx.user.create({
            data: {
              email: b.email,
              name: b.name ?? "Owner",
              passwordHash,
              role: "OWNER",
              status: "APPROVED",
            },
          });
          await tx.project.upsert({
            where: { seedKey: "cursos-diplomados" },
            update: {},
            create: {
              seedKey: "cursos-diplomados",
              name: "Cursos y Diplomados",
              description:
                "Proyecto destinado a la generación de imágenes y afiches publicitarios para cursos, diplomados, especializaciones y otros programas de capacitación de Cámara Nacional de Negocios",
              prompt: seedPrompt,
              ownerId: u.id,
            },
          });
          return u;
        });
        await session(user.id);
        await audit(user.id, "INSTALACION_INICIAL");
        return send({ ok: true }, 201);
      }
      demand(
        !(await db.user.findUnique({ where: { email: b.email } })),
        "No se pudo registrar esta cuenta.",
        409,
      );
      await db.user.create({
        data: { email: b.email, name: b.name ?? b.email, passwordHash },
      });
      return send(
        {
          message:
            "Solicitud registrada. Espera la aprobación de un administrador.",
        },
        201,
      );
    }
    const user = await actor();
    if (route === "auth/me" && method === "GET")
      return send({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    if (route === "auth/logout" && method === "POST") {
      const c = await cookies(),
        raw = c.get("session")?.value;
      if (raw) await db.session.deleteMany({ where: { id: tokenHash(raw) } });
      c.delete("session");
      return send({ ok: true });
    }
    if (parts[0] === "ai") {
      ownerOnly(user);
      if (route === "ai/config" && method === "GET")
        return send({
          configuration: safeConfiguration(
            await db.providerConfiguration.findUnique({
              where: { id: "global" },
            }),
          ),
          providers,
        });
      if (route === "ai/config" && method === "PUT") {
        const b = configSchema.parse(await body(req));
        adapter(b.provider);
        const old = await db.providerConfiguration.findUnique({
          where: { id: "global" },
        });
        const changed = Boolean(b.apiKey) || old?.provider !== b.provider;
        const { apiKey, ...data } = b;
        demand(
          !changed || apiKey,
          "Introduce una clave API para configurar este proveedor.",
        );
        demand(
          !old || old.provider === b.provider || apiKey,
          "Introduce la clave del nuevo proveedor.",
        );
        if (!changed && old?.status === "VERIFIED") {
          const models = old.models as ModelCapability[];
          const image = models.find(
            (m) => m.id === b.imageModel && m.kind === "image",
          );
          if (b.imageModel)
            demand(
              image &&
                image.qualities.includes(b.quality) &&
                image.resolutions.includes(b.resolution),
              "Modelo o parámetros de imagen incompatibles.",
            );
          if (b.creativeModel)
            demand(
              models.some(
                (m) => m.id === b.creativeModel && m.kind === "creative",
              ),
              "El modelo creativo no está disponible.",
            );
          demand(
            b.alternatives.every((id) =>
              models.some((m) => m.id === id && m.kind === "image"),
            ),
            "Un modelo alternativo no está disponible.",
          );
        }
        const reset = changed
          ? {
              encryptedKey: encryptKey(apiKey!),
              maskedKey: maskKey(apiKey!),
              status: "UNVERIFIED",
              verifiedAt: null,
              verifiedRevision: null,
              models: [],
              imageModel: null,
              creativeModel: null,
              alternatives: [],
            }
          : {};
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
          await tx.providerConfiguration.upsert({
            where: { id: "global" },
            create: { ...data, ...reset },
            update: {
              ...data,
              ...reset,
              revision: { increment: 1 },
              status: "UNVERIFIED",
              verifiedAt: null,
              verifiedRevision: null,
            },
          });
        });
        await audit(user.id, "CONFIGURACION_IA_GUARDADA");
        return send(
          safeConfiguration(
            await db.providerConfiguration.findUnique({
              where: { id: "global" },
            }),
          ),
        );
      }
      if (route === "ai/config" && method === "DELETE") {
        await db.providerConfiguration.update({
          where: { id: "global" },
          data: {
            encryptedKey: null,
            maskedKey: null,
            models: [],
            imageModel: null,
            creativeModel: null,
            alternatives: [],
            status: "NOT_CONFIGURED",
            error: null,
            verifiedAt: null,
            verifiedRevision: null,
            revision: { increment: 1 },
          },
        });
        await audit(user.id, "CLAVE_IA_ELIMINADA");
        return send({ ok: true });
      }
      if (route === "ai/verify" && method === "POST") {
        await rateLimit("verify:" + user.id, 15);
        const result = await connectionCheck();
        await audit(user.id, "CONEXION_IA_VERIFICADA");
        return send(result);
      }
      if (route === "ai/test" && method === "POST") {
        const b = z
          .object({ confirmCharge: z.literal(true), requestId: z.uuid() })
          .parse(await body(req));
        const c = await configured();
        const jobs = await reserveJobs(
          user.id,
          "connection-test",
          [
            {
              key: user.id + ":test:" + b.requestId,
              snapshot: {
                prompt:
                  "Genera un afiche tipográfico que diga Prueba de conexión. No uses logos ni precios.",
                mode: "Texto",
                index: 0,
                format: "1:1",
              },
            },
          ],
          c.revision,
        );
        await audit(user.id, "PRUEBA_IA_AUTORIZADA", jobs[0].id);
        return send({ jobs: jobs.map((j) => j.id) }, 202);
      }
    }
    if (route === "projects" && method === "GET")
      return send(
        await db.project.findMany({
          where: {
            ...projectFilter(user),
            deletedAt:
              req.nextUrl.searchParams.get("trash") === "true"
                ? { not: null }
                : null,
          },
          include: {
            _count: { select: { categories: true } },
            owner: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
        }),
      );
    if (route === "projects" && method === "POST") {
      const b = content.parse(await body(req));
      const p = await db.project.create({ data: { ...b, ownerId: user.id } });
      await audit(user.id, "PROYECTO_CREADO", p.id);
      return send(p, 201);
    }
    if (parts[0] === "projects" && parts[1]) {
      const id = parts[1];
      if (parts[2] === "restore" && method === "POST") {
        const p = await projectAccess(user, id, "VIEW", true);
        demand(
          user.role === "OWNER" || p.ownerId === user.id,
          "No puedes restaurar este proyecto.",
          403,
        );
        await db.project.update({ where: { id }, data: { deletedAt: null } });
        await audit(user.id, "PROYECTO_RESTAURADO", id);
        return send({ ok: true });
      }
      await projectAccess(user, id, method === "GET" ? "VIEW" : "EDIT");
      if (parts.length === 2 && method === "GET")
        return send(
          await db.project.findUnique({
            where: { id },
            include: {
              categories: {
                include: { _count: { select: { subproducts: true } } },
              },
            },
          }),
        );
      if (parts.length === 2 && method === "PATCH") {
        const b = content.parse(await body(req));
        await db.$transaction([
          db.project.update({ where: { id }, data: b }),
          db.promptVersion.create({
            data: {
              scope: "project",
              resourceId: id,
              prompt: b.prompt,
              actorId: user.id,
            },
          }),
        ]);
        return send({ ok: true });
      }
      if (parts.length === 2 && method === "DELETE") {
        const p = await db.project.findUniqueOrThrow({ where: { id } });
        demand(
          user.role === "OWNER" || p.ownerId === user.id,
          "Solo el creador o el owner pueden eliminar este proyecto.",
          403,
        );
        await db.project.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
        await audit(user.id, "PROYECTO_PAPELERA", id);
        return send({ ok: true });
      }
      if (parts[2] === "categories" && method === "POST") {
        const b = content.parse(await body(req));
        return send(
          await db.category.create({
            data: { name: b.name, prompt: b.prompt, projectId: id },
          }),
          201,
        );
      }
      if (parts[2] === "members" && method === "POST") {
        const p = await db.project.findUniqueOrThrow({ where: { id } });
        demand(
          user.role === "OWNER" || p.ownerId === user.id,
          "Solo el creador o el owner pueden compartir.",
          403,
        );
        const b = z
          .object({
            email: z.email(),
            permission: z.enum(["VIEW", "GENERATE", "EDIT", "MANAGE"]),
          })
          .parse(await body(req));
        const target = await db.user.findUnique({
          where: { email: b.email.toLowerCase() },
        });
        demand(
          target?.status === "APPROVED",
          "Usuario aprobado no encontrado.",
        );
        await db.projectMember.upsert({
          where: { projectId_userId: { projectId: id, userId: target.id } },
          create: {
            projectId: id,
            userId: target.id,
            permission: b.permission,
          },
          update: { permission: b.permission },
        });
        await audit(user.id, "PROYECTO_COMPARTIDO", id);
        return send({ ok: true });
      }
    }
    if (parts[0] === "categories" && parts[1]) {
      const id = parts[1];
      await resourceAccess(
        user,
        "category",
        id,
        method === "GET"
          ? "VIEW"
          : parts[2] === "generate"
            ? "GENERATE"
            : "EDIT",
      );
      if (parts[2] === "preview" && method === "GET") {
        const { previewSubproduct } = await import("@/lib/generation");
        const subs = await db.subproduct.findMany({
          where: { categoryId: id },
        });
        const previews = [];
        for (const sub of subs) {
          const p = await previewSubproduct(sub.id);
          previews.push({
            id: sub.id,
            name: sub.name,
            text: p.instructions.text,
            warnings: p.instructions.warnings,
            settings: p.settings,
          });
        }
        return send(previews);
      }
      if (parts[2] === "generate" && method === "POST") {
        const b = z
          .object({
            confirmCharge: z.literal(true),
            reviewedInstructions: z.literal(true),
            requestId: z.uuid(),
          })
          .parse(await body(req));
        const { generateBatch } = await import("@/lib/generation");
        const jobs = await generateBatch(user.id, id, b.requestId);
        await audit(user.id, "GENERACION_MASIVA_AUTORIZADA", id);
        return send({ jobs: jobs.map((j) => j.id) }, 202);
      }
      if (parts.length === 2 && method === "GET")
        return send(
          await db.category.findUnique({
            where: { id },
            include: {
              project: { select: { id: true, name: true } },
              subproducts: {
                include: { _count: { select: { variations: true } } },
              },
            },
          }),
        );
      if (parts.length === 2 && method === "PATCH") {
        const b = z
          .object({
            name: z.string().trim().min(1).max(200),
            prompt: z.string().max(30000),
            settings,
          })
          .parse(await body(req));
        const s = effectiveSettings(b.settings, {});
        validateDistribution(s);
        await db.$transaction([
          db.category.update({
            where: { id },
            data: { ...b, settings: b.settings },
          }),
          db.promptVersion.create({
            data: {
              scope: "category",
              resourceId: id,
              prompt: b.prompt,
              actorId: user.id,
            },
          }),
        ]);
        return send({ ok: true });
      }
      if (parts[2] === "subproducts" && method === "POST") {
        const b = z
          .object({
            names: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
          })
          .parse(await body(req));
        const rows = await db.$transaction(
          b.names.map((name) =>
            db.subproduct.create({ data: { name, categoryId: id } }),
          ),
        );
        await audit(user.id, "SUBPRODUCTOS_CREADOS", id);
        return send(rows, 201);
      }
    }
    if (parts[0] === "subproducts" && parts[1]) {
      const id = parts[1];
      await resourceAccess(
        user,
        "subproduct",
        id,
        method === "GET"
          ? "VIEW"
          : parts[2] === "generate"
            ? "GENERATE"
            : "EDIT",
      );
      const sub = await db.subproduct.findUniqueOrThrow({
        where: { id },
        include: { category: { include: { project: true } }, variations: true },
      });
      if (parts.length === 2 && method === "GET") return send(sub);
      if (parts.length === 2 && method === "PATCH") {
        const b = z
          .object({
            name: z.string().trim().min(1).max(200),
            prompt: z.string().max(30000),
            settings,
          })
          .parse(await body(req));
        validateDistribution(
          effectiveSettings(sub.category.settings, b.settings),
        );
        await db.$transaction([
          db.subproduct.update({
            where: { id },
            data: { ...b, settings: b.settings },
          }),
          db.promptVersion.create({
            data: {
              scope: "subproduct",
              resourceId: id,
              prompt: b.prompt,
              actorId: user.id,
            },
          }),
        ]);
        return send({ ok: true });
      }
      if (parts[2] === "instructions" && method === "GET") {
        const result = resolveInstructions([
          { name: "Proyecto", prompt: sub.category.project.prompt },
          { name: "Categoría", prompt: sub.category.prompt },
          { name: "Subproducto", prompt: sub.prompt },
        ]);
        const attachments = await db.attachment.findMany({
          where: {
            OR: [
              { scope: "project", resourceId: sub.category.projectId },
              { scope: "category", resourceId: sub.categoryId },
              { scope: "subproduct", resourceId: id },
            ],
          },
          select: {
            id: true,
            name: true,
            purpose: true,
            text: true,
            mime: true,
          },
        });
        return send({
          ...result,
          settings: effectiveSettings(sub.category.settings, sub.settings),
          attachments,
        });
      }
      if (parts[2] === "generate" && method === "POST") {
        const b = z
          .object({
            confirmCharge: z.literal(true),
            reviewedInstructions: z.literal(true),
            requestId: z.uuid(),
          })
          .parse(await body(req));
        const c = await configured();
        const s = effectiveSettings(sub.category.settings, sub.settings);
        validateDistribution(s);
        const { generateBatch } = await import("@/lib/generation");
        const jobs = await generateBatch(user.id, sub.categoryId, b.requestId, [
          id,
        ]);
        await audit(user.id, "GENERACION_AUTORIZADA", id);
        return send({ jobs: jobs.map((j) => j.id) }, 202);
      }
    }
    if (parts[0] === "attachments") {
      if (parts.length === 1 && method === "GET") {
        const scope = z
            .enum(["project", "category", "subproduct"])
            .parse(req.nextUrl.searchParams.get("scope")),
          id = req.nextUrl.searchParams.get("id") ?? "";
        await resourceAccess(user, scope, id);
        return send(
          await db.attachment.findMany({
            where: { scope, resourceId: id },
            select: {
              id: true,
              name: true,
              mime: true,
              purpose: true,
              size: true,
            },
          }),
        );
      }
      if (parts.length === 1 && method === "POST") {
        demand(
          Number(req.headers.get("content-length") ?? 0) <= 11000000,
          "El archivo supera 10 MB.",
          413,
        );
        const multipart = await bounded(req, 11000000);
        const form = await new Response(new Uint8Array(multipart), {
          headers: { "Content-Type": req.headers.get("content-type") ?? "" },
        }).formData();
        const scope = z
            .enum(["project", "category", "subproduct"])
            .parse(form.get("scope")),
          id = String(form.get("resourceId") ?? "");
        await resourceAccess(user, scope, id, "EDIT");
        const file = form.get("file");
        demand(
          file instanceof File && file.size > 0 && file.size <= 10000000,
          "Selecciona un archivo de hasta 10 MB.",
        );
        const purpose = z.string().min(1).max(100).parse(form.get("purpose"));
        const { validateUpload } = await import("@/lib/uploads");
        const checked = await validateUpload(file);
        const path = await store(checked.bytes);
        const item = await db.attachment.create({
          data: {
            scope,
            resourceId: id,
            name: file.name.slice(0, 200),
            mime: checked.mime,
            purpose,
            path,
            text: checked.text,
            size: file.size,
          },
        });
        await audit(user.id, "ADJUNTO_CARGADO", item.id);
        return send({ id: item.id, name: item.name }, 201);
      }
      if (parts[1] && method === "DELETE") {
        const a = await db.attachment.findUnique({ where: { id: parts[1] } });
        demand(a, "Adjunto no encontrado.", 404);
        await resourceAccess(user, a.scope, a.resourceId, "EDIT");
        await remove(a.path);
        await db.attachment.delete({ where: { id: a.id } });
        return send({ ok: true });
      }
    }
    if (route === "jobs" && method === "GET") {
      const jobs = await db.generationJob.findMany({
        where: user.role === "OWNER" ? {} : { actorId: user.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          status: true,
          error: true,
          subproductId: true,
          projectId: true,
          createdAt: true,
          reservedMicros: true,
          variation: { select: { id: true, expired: true } },
        },
      });
      return send(
        jobs.map((j) => ({ ...j, reservedMicros: String(j.reservedMicros) })),
      );
    }
    if (route === "exports" && method === "POST") {
      const b = z
        .object({
          ids: z.array(z.string()).min(1).max(200),
          format: z.enum(["png", "jpg"]).default("png"),
        })
        .parse(await body(req));
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let total = 0;
      for (const id of [...new Set(b.ids)]) {
        const v = await db.variation.findUnique({
          where: { id },
          include: { job: true, subproduct: { select: { name: true } } },
        });
        demand(v, "Una imagen no existe.", 404);
        if (v.job.projectId === "connection-test") ownerOnly(user);
        else await projectAccess(user, v.job.projectId);
        demand(
          !v.expired && (v.permanent || v.expiresAt > new Date()),
          "Una imagen temporal ya caducó.",
          410,
        );
        let bytes = await load(v.path);
        total += bytes.length;
        demand(
          total <= 100000000,
          "La descarga supera 100 MB. Selecciona menos imágenes.",
          413,
        );
        if (b.format === "jpg")
          bytes = await (await import("@/lib/render")).jpeg(bytes);
        const name = (v.subproduct?.name ?? "Prueba")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 80);
        zip.file(`${name}_${v.id}.${b.format}`, bytes);
      }
      await audit(user.id, "DESCARGA_ZIP");
      return new NextResponse(
        new Uint8Array(
          await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }),
        ),
        {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="afiches.zip"',
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
    if (parts[0] === "variations" && parts[1]) {
      const v = await db.variation.findUnique({
        where: { id: parts[1] },
        include: { job: true },
      });
      demand(v, "Imagen no encontrada.", 404);
      if (v.job.projectId === "connection-test") ownerOnly(user);
      else
        await projectAccess(
          user,
          v.job.projectId,
          method === "GET" ? "VIEW" : "EDIT",
        );
      if (method === "GET") {
        demand(
          !v.expired && (v.permanent || v.expiresAt > new Date()),
          "El archivo temporal ya caducó.",
          410,
        );
        const jpg = req.nextUrl.searchParams.get("format") === "jpg";
        const bytes = await load(v.path);
        const output = jpg
          ? await (await import("@/lib/render")).jpeg(bytes)
          : bytes;
        return new NextResponse(new Uint8Array(output), {
          headers: {
            "Content-Type": jpg ? "image/jpeg" : "image/png",
            "Content-Disposition": `${req.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="afiche_${v.id}.${jpg ? "jpg" : "png"}"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (method === "PATCH") {
        const b = z
          .object({
            permanent: z.boolean().optional(),
            favorite: z.boolean().optional(),
          })
          .strict()
          .parse(await body(req));
        demand(
          !v.expired && (v.permanent || v.expiresAt > new Date()),
          "La imagen ya caducó.",
          410,
        );
        await db.variation.update({ where: { id: v.id }, data: b });
        return send({ ok: true });
      }
    }
    if (route === "users" && method === "GET") {
      demand(user.role !== "USER", "Acceso restringido.", 403);
      return send(
        await db.user.findMany({
          where: user.role === "ADMIN" ? { role: "USER" } : {},
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
          },
        }),
      );
    }
    if (parts[0] === "users" && parts[1] && method === "PATCH") {
      demand(user.role !== "USER", "Acceso restringido.", 403);
      const b = z
        .object({
          role: z.enum(["OWNER", "ADMIN", "USER"]),
          status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]),
        })
        .parse(await body(req));
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
        const target = await tx.user.findUniqueOrThrow({
          where: { id: parts[1] },
        });
        demand(
          user.role === "OWNER" ||
            (target.role === "USER" && b.role === "USER"),
          "Solo el OWNER puede administrar roles elevados.",
          403,
        );
        if (
          target.role === "OWNER" &&
          target.status === "APPROVED" &&
          (b.role !== "OWNER" || b.status !== "APPROVED")
        )
          demand(
            (await tx.user.count({
              where: { role: "OWNER", status: "APPROVED" },
            })) > 1,
            "No puedes desactivar al último OWNER activo.",
          );
        await tx.user.update({ where: { id: target.id }, data: b });
        await tx.session.deleteMany({ where: { userId: target.id } });
      });
      await audit(user.id, "USUARIO_ACTUALIZADO", parts[1]);
      return send({ ok: true });
    }
    if (route === "audit" && method === "GET")
      return send(
        await db.auditEvent.findMany({
          where: user.role === "OWNER" ? {} : { actorId: user.id },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      );
    if (route === "usage" && method === "GET") {
      const rows = await db.usageLedger.findMany({
        where: user.role === "OWNER" ? {} : { actorId: user.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return send(
        rows.map((r) => ({
          ...r,
          reservedMicros: String(r.reservedMicros),
          actualMicros: r.actualMicros === null ? null : String(r.actualMicros),
        })),
      );
    }
    throw new AppError("Operación no encontrada.", 404);
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Revisa los campos del formulario.",
          fields: e.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    if (e instanceof AppError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && /distribución|variaciones/.test(e.message))
      return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json(
      {
        error:
          "No se pudo completar la operación. Comprueba la base de datos y la configuración del servidor.",
      },
      { status: 500 },
    );
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
