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
import {
  store,
  load,
  remove,
  fileStream,
  maxUploadBytes,
  storageStatus,
} from "@/lib/storage";
export const runtime = "nodejs";
export const maxDuration = 300;
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
    editable: z.boolean().optional(),
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
    if (route === "auth/status" && method === "GET") {
      if (!process.env.DATABASE_URL)
        return send(
          {
            error:
              "La plataforma está publicada, pero todavía falta conectar su base de datos. No hay una cuenta de prueba creada en esta instalación.",
          },
          503,
        );
      try {
        const needsSetup = (await db.user.count()) === 0;
        if (
          needsSetup &&
          (!process.env.BOOTSTRAP_TOKEN ||
            process.env.BOOTSTRAP_TOKEN.length < 32)
        )
          return send(
            {
              error:
                "La base de datos está conectada. Falta completar la instalación segura antes de crear tu cuenta OWNER.",
            },
            503,
          );
        return send({ needsSetup });
      } catch {
        return send(
          {
            error:
              "No se pudo acceder a los datos de la plataforma. Falta conectar la base de datos o preparar sus tablas; vuelve a intentar cuando termine la instalación.",
          },
          503,
        );
      }
    }
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
        await session(user.id, user.passwordHash);
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
        await session(user.id, user.passwordHash);
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
    if (route === "auth/reset-password" && method === "POST") {
      const { resetPassword } = await import("@/lib/accounts");
      return send(await resetPassword(await body(req)));
    }
    const user = await actor();
    if (route === "capabilities" && method === "GET")
      return send({ maxUploadBytes: maxUploadBytes() });
    if (route === "system/cleanup" && method === "POST") {
      ownerOnly(user);
      const { cleanupExpired, recoverInterrupted } =
        await import("@/scripts/worker");
      return send({
        expired: await cleanupExpired(),
        interrupted: await recoverInterrupted(),
      });
    }
    if (route === "system/storage" && method === "GET") {
      ownerOnly(user);
      return send(await storageStatus());
    }
    if (
      parts[0] === "jobs" &&
      parts[1] &&
      parts[2] === "process" &&
      parts.length === 3 &&
      method === "POST"
    ) {
      const { processJob } = await import("@/lib/jobs");
      return send(await processJob(user, parts[1]));
    }
    if (route === "auth/change-password" && method === "POST") {
      const { changePassword } = await import("@/lib/accounts");
      const result = await changePassword(user, await body(req));
      (await cookies()).delete("session");
      return send(result);
    }
    if (
      parts[0] === "users" &&
      parts[1] &&
      parts[2] === "recovery" &&
      parts.length === 3 &&
      method === "POST"
    ) {
      const { issuePasswordReset } = await import("@/lib/accounts");
      return send(
        await issuePasswordReset(user, parts[1], await body(req)),
        201,
      );
    }
    if (
      parts[0] === "projects" &&
      parts[1] &&
      parts[2] === "brand" &&
      parts.length === 3
    ) {
      const project = await projectAccess(
        user,
        parts[1],
        method === "GET" ? "VIEW" : "EDIT",
      );
      const { readBrand, saveBrand } = await import("@/lib/brand");
      if (method === "GET")
        return send({
          kit: await readBrand(project.id),
          canEdit:
            user.role === "OWNER" ||
            project.ownerId === user.id ||
            project.members.some(
              (m) =>
                m.userId === user.id &&
                ["EDIT", "MANAGE"].includes(m.permission),
            ),
        });
      if (method === "PUT")
        return send(await saveBrand(user, project.id, await body(req)));
    }
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
    if (["library", "presets", "budgets"].includes(parts[0])) {
      const { productivityRoutes } = await import("@/lib/productivity");
      const response = await productivityRoutes(req, parts, user, () =>
        body(req),
      );
      if (response) return response;
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
            selected: z
              .array(z.string().min(1).max(100))
              .min(1)
              .max(200)
              .optional(),
          })
          .parse(await body(req));
        const { generateBatch } = await import("@/lib/generation");
        const jobs = await generateBatch(user.id, id, b.requestId, b.selected);
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
                include: {
                  _count: {
                    select: { variations: { where: { deletedAt: null } } },
                  },
                },
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
        include: {
          category: { include: { project: true } },
          variations: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              model: true,
              permanent: true,
              favorite: true,
              expired: true,
              expiresAt: true,
              revision: true,
              reviewStatus: true,
            },
          },
        },
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
        const { previewSubproduct } = await import("@/lib/generation");
        const preview = await previewSubproduct(id);
        return send({
          ...preview.instructions,
          settings: preview.settings,
          brand: preview.brand,
          attachments: preview.attachments.map(
            ({ id, name, purpose, text, mime }) => ({
              id,
              name,
              purpose,
              text,
              mime,
            }),
          ),
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
            .enum(["project", "category", "subproduct", "variation"])
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
          Number(req.headers.get("content-length") ?? 0) <=
            maxUploadBytes() + 500000,
          `El archivo supera ${maxUploadBytes() / 1000000} MB.`,
          413,
        );
        const multipart = await bounded(req, maxUploadBytes() + 500000);
        const form = await new Response(new Uint8Array(multipart), {
          headers: { "Content-Type": req.headers.get("content-type") ?? "" },
        }).formData();
        const scope = z
            .enum(["project", "category", "subproduct", "variation"])
            .parse(form.get("scope")),
          id = String(form.get("resourceId") ?? "");
        await resourceAccess(user, scope, id, "EDIT");
        const file = form.get("file");
        demand(
          file instanceof File &&
            file.size > 0 &&
            file.size <= maxUploadBytes(),
          `Selecciona un archivo de hasta ${maxUploadBytes() / 1000000} MB.`,
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
      if (parts[1] && method === "GET") {
        const a = await db.attachment.findUnique({ where: { id: parts[1] } });
        demand(a, "Archivo no encontrado.", 404);
        await resourceAccess(user, a.scope, a.resourceId);
        return new NextResponse(fileStream(await load(a.path)), {
          headers: {
            "Content-Type": a.mime,
            "Content-Disposition": a.mime.startsWith("image/")
              ? "inline"
              : "attachment",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (parts[1] && method === "DELETE") {
        const a = await db.attachment.findUnique({ where: { id: parts[1] } });
        demand(a, "Adjunto no encontrado.", 404);
        await resourceAccess(user, a.scope, a.resourceId, "EDIT");
        demand(
          !(await db.brandLogo.findFirst({ where: { attachmentId: a.id } })),
          "Este logo forma parte de la identidad de marca. Retíralo de la identidad antes de eliminarlo.",
          409,
        );
        const used = await db.imageVersion.findFirst({
          where: {
            document: {
              path: ["layers"],
              array_contains: [{ type: "logo", attachmentId: a.id }],
            },
            variation: { expired: false },
          },
        });
        demand(
          !used,
          "Este logo está en uso por un afiche o sus versiones. Conserva el recurso mientras exista ese historial.",
          409,
        );
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
      const edited = await db.imageVersion.findMany({
        where: { sourceJobId: { in: jobs.map((j) => j.id) } },
        select: {
          sourceJobId: true,
          variation: { select: { id: true, expired: true, deletedAt: true } },
        },
      });
      return send(
        jobs.map((j) => {
          const result =
            j.variation ??
            edited.find((v) => v.sourceJobId === j.id)?.variation ??
            null;
          return {
            ...j,
            variation:
              result && !("deletedAt" in result && result.deletedAt)
                ? { id: result.id, expired: result.expired }
                : null,
            reservedMicros: String(j.reservedMicros),
          };
        }),
      );
    }
    if (route === "gallery" && method === "GET") {
      const { collectionGallery } = await import("@/lib/collections");
      return send(await collectionGallery(user, req.nextUrl.searchParams));
    }
    if (route === "exports" && method === "POST") {
      const { exportCollection } = await import("@/lib/collections");
      return await exportCollection(user, await body(req));
    }
    if (route === "variations/bulk-regenerate" && method === "POST") {
      const b = z
        .object({
          ids: z.array(z.string()).min(1).max(200),
          prompt: z.string().max(12000).default(""),
          requestId: z.uuid(),
          confirmCharge: z.literal(true),
          reviewedInstructions: z.literal(true),
        })
        .parse(await body(req));
      const { regenerateSelected } = await import("@/lib/bulk-variations");
      return send(
        { jobs: await regenerateSelected(user, b.ids, b.requestId, b.prompt) },
        202,
      );
    }
    if (parts[0] === "variations" && parts[1]) {
      const { variationRoutes } = await import("@/lib/variation-routes");
      const response = await variationRoutes(req, parts, user, () => body(req));
      if (response) return response;
    }
    if (parts[0] === "jobs" && parts[1] && method === "POST") {
      const { cancelJob, retryJob } = await import("@/lib/jobs");
      if (parts[2] === "cancel") return send(await cancelJob(user, parts[1]));
      if (parts[2] === "retry") {
        const b = z
          .object({
            requestId: z.uuid(),
            confirmCharge: z.literal(true),
            confirmUncertain: z.boolean().default(false),
          })
          .parse(await body(req));
        const jobs = await retryJob(
          user,
          parts[1],
          b.requestId,
          b.confirmUncertain,
        );
        return send({ jobs: jobs.map((j) => j.id) }, 202);
      }
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
      if (method === "GET" && parts.length === 2) {
        demand(
          !v.deletedAt &&
            !v.deletedAt &&
            !v.expired &&
            (v.permanent || v.expiresAt > new Date()),
          "El archivo temporal ya caducó.",
          410,
        );
        const jpg = req.nextUrl.searchParams.get("format") === "jpg";
        let bytes = await load(v.path);
        if (req.nextUrl.searchParams.get("thumbnail") === "true")
          bytes = await (
            await import("sharp")
          )
            .default(bytes, { limitInputPixels: 20000000 })
            .resize({
              width: 640,
              height: 640,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer();
        const output = jpg
          ? await (await import("@/lib/render")).jpeg(bytes)
          : bytes;
        return new NextResponse(fileStream(output), {
          headers: {
            "Content-Type": jpg ? "image/jpeg" : "image/png",
            "Content-Disposition": `${req.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="afiche_${v.id}.${jpg ? "jpg" : "png"}"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (method === "PATCH" && parts.length === 2) {
        const b = z
          .object({
            permanent: z.boolean().optional(),
            favorite: z.boolean().optional(),
            reviewStatus: z
              .enum(["PENDING", "APPROVED", "REJECTED"])
              .optional(),
          })
          .strict()
          .parse(await body(req));
        demand(
          !v.deletedAt &&
            !v.expired &&
            (v.permanent || v.expiresAt > new Date()),
          "La imagen ya caducó.",
          410,
        );
        if (b.permanent !== undefined) {
          const { retainVariation } = await import("@/lib/productivity");
          await retainVariation(user, v.id, b.permanent);
        }
        const { permanent: _permanent, ...metadata } = b;
        const changed = await db.variation.updateMany({
          where: { id: v.id, deletedAt: null, expired: false },
          data: metadata,
        });
        demand(changed.count, "El afiche ya no está disponible.", 409);
        await audit(
          user.id,
          b.reviewStatus ? "AFICHE_" + b.reviewStatus : "AFICHE_ACTUALIZADO",
          v.id,
        );
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
        await tx.passwordReset.deleteMany({ where: { userId: target.id } });
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
