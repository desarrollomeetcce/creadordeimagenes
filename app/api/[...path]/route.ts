import {libraryJobAccess} from "@/lib/library-access";
import {libraryImageVisibility} from "@/lib/library-visibility";
import { instructionPolicySchema,instructionFlags,publicInstructionPolicy } from "@/lib/instruction-policy";
import { recordActivity } from "@/lib/activity";
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
  categoryFilter,
  subproductFilter,
  fullProjectFilter,
  accessFlags,
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
  instructionPolicy: instructionPolicySchema.optional(),
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
    designMode:z.enum(["professional","editable"]).optional(),
    reasoningLevel:z.enum(["low","medium","high"]).optional(),
  })
  .strict();
const micros = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(BigInt);
const configSchema = z.object({
  provider: z.string().max(80),
  apiKey: z.string().trim().min(10).max(1000).optional(),
  imageModel: z.string().max(100).nullable().optional(),
  creativeModel: z.string().max(100).nullable().optional(),
  creativeProvider: z.string().max(80).nullable().optional(),
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
async function audit(
  actorId: string,
  action: string,
  resourceId?: string,
  detail: Record<string, string | number | string[]> = {},
) {
  await recordActivity(db, { data: { actorId, action, resourceId, detail } });
}
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const parts = (await params).path,
      route = parts.join("/"),
      method = req.method;
    const paymentNotification =
      method === "POST" &&
      ["payments/webhook/mercadopago", "payments/webhook/paypal"].includes(
        route,
      );
    if (req.method !== "GET" && !paymentNotification) {
      demand(
        req.headers.get("origin") ===
          (process.env.APP_ORIGIN ?? "http://localhost:3000"),
        "Origen no autorizado.",
        403,
      );
    }
    const send = (value: unknown, status = 200) =>
      NextResponse.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    if (paymentNotification)
      return send(
        await (
          await import("@/lib/plan-payments")
        ).paymentWebhook(
          parts[2],
          req.headers,
          req.nextUrl.searchParams,
          await body(req),
        ),
      );
    if (route === "site/public" && method === "GET")
      return send(await (await import("@/lib/site-content")).publicSite());
    if (route === "plans/public" && method === "GET")
      return send(
        await (await import("@/lib/membership-plans")).plansCatalog(),
      );
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
    if (route === "auth/emergency-recovery" && method === "POST") {
      const { recoverOwner } = await import("@/lib/owner-recovery");
      const result = await recoverOwner(await body(req));
      (await cookies()).delete("session");
      return send(result);
    }
    const user = await actor();
    if (route === "privacy/visual-audit" && method === "GET") {
      const { visualAuditNotice } = await import("@/lib/visual-audit");
      return send(await visualAuditNotice());
    }
    if (parts[0] === "visual-audit") {
      ownerOnly(user);
      const {
        auditPolicy,
        saveAuditPolicy,
        listAuditThumbnails,
        auditThumbnailImage,
        removeAuditThumbnail,
        cleanupAuditThumbnails,
      } = await import("@/lib/visual-audit");
      if (route === "visual-audit/policy" && method === "GET")
        return send(await auditPolicy(user));
      if (route === "visual-audit/policy" && method === "PUT")
        return send(await saveAuditPolicy(user, await body(req)));
      if (route === "visual-audit" && method === "GET")
        return send(await listAuditThumbnails(user, req.nextUrl.searchParams));
      if (route === "visual-audit/cleanup" && method === "POST")
        return send({ removed: await cleanupAuditThumbnails() });
      if (parts.length === 3 && parts[2] === "image" && method === "GET")
        return await auditThumbnailImage(user, parts[1]);
      if (parts.length === 2 && method === "DELETE")
        return send(
          await removeAuditThumbnail(user, parts[1], await body(req)),
        );
      throw new AppError("Ruta de auditoría visual no disponible.", 404);
    }
    if (parts[0] === "mail") {
      ownerOnly(user);
      const { mailStatus, saveMail, deleteMail, verifyMail, testMail } =
        await import("@/lib/mail");
      if (route === "mail" && method === "GET")
        return send(await mailStatus(user));
      if (route === "mail" && method === "PUT")
        return send(await saveMail(user, await body(req)));
      if (route === "mail" && method === "DELETE")
        return send(await deleteMail(user, await body(req)));
      if (route === "mail/verify" && method === "POST")
        return send(await verifyMail(user, await body(req)));
      if (route === "mail/test" && method === "POST")
        return send(await testMail(user, await body(req)));
      throw new AppError("Ruta de correo no disponible.", 404);
    }
    if (route === "auth/owner-recovery") {
      ownerOnly(user);
      const { ownerRecoveryStatus, manageOwnerRecovery } =
        await import("@/lib/owner-recovery");
      if (method === "GET") return send(await ownerRecoveryStatus(user));
      if (method === "POST" || method === "DELETE")
        return send(
          await manageOwnerRecovery(user, await body(req), method === "DELETE"),
        );
    }
    if (parts[0] === "payments") {
      const pay = await import("@/lib/plan-payments");
      if (route === "payments/options" && method === "GET")
        return send(await pay.paymentOptions());
      if (route === "payments/purchases" && method === "GET")
        return send(await pay.myPurchases(user));
      if (route === "payments/purchases" && method === "POST") {
        await rateLimit("checkout:" + user.id, 10);
        return send(await pay.createPlanPurchase(user, await body(req)), 201);
      }
      if (
        parts[1] === "purchases" &&
        parts.length === 4 &&
        method === "POST" &&
        ["refresh", "capture"].includes(parts[3])
      ) {
        await rateLimit("payment-check:" + user.id, 20);
        return send(
          await pay.refreshPurchase(user, parts[2], parts[3] === "capture"),
        );
      }
      ownerOnly(user);
      if (route === "payments/connections" && method === "GET")
        return send(await pay.paymentConnections(user));
      if (route === "payments/connections" && method === "PUT")
        return send(await pay.savePaymentConnection(user, await body(req)));
      if (
        parts[1] === "connections" &&
        parts.length === 3 &&
        method === "DELETE"
      )
        return send(await pay.deletePaymentConnection(user, parts[2]));
      if (
        parts[1] === "connections" &&
        parts.length === 4 &&
        parts[3] === "verify" &&
        method === "POST"
      )
        return send(await pay.verifyPaymentConnection(user, parts[2]));
    }
    if (parts[0] === "site") {
      ownerOnly(user);
      const site = await import("@/lib/site-content");
      if (route === "site/admin" && method === "GET")
        return send(await site.publicSite());
      if (parts.length === 2 && method === "PUT")
        return send(
          await site.saveSiteSection(user, parts[1], await body(req)),
        );
    }
    if (parts[0] === "plans") {
      const plans = await import("@/lib/membership-plans");
      if (route === "plans/me" && method === "GET")
        return send(await plans.membershipStatus(user));
      if (route === "plans/available" && method === "GET")
        return send(await plans.purchasablePlans(user));
      ownerOnly(user);
      if (route === "plans/custom" && method === "POST")
        return send(await plans.createCustomPlan(user, await body(req)), 201);
      if (parts.length === 2 && method === "DELETE")
        return send(await plans.archivePlan(user, parts[1]));
      if (route === "plans" && method === "GET")
        return send(await plans.plansCatalog(true));
      if (parts.length === 2 && method === "PUT")
        return send(await plans.updatePlan(user, parts[1], await body(req)));
    }
    if (
      parts[0] === "users" &&
      parts.length === 3 &&
      parts[2] === "plan" &&
      method === "PUT"
    )
      return send(
        await (
          await import("@/lib/membership-plans")
        ).assignPlan(user, parts[1], await body(req)),
      );
    if (parts[0] === "users") {
      const { userManagement } = await import("@/lib/user-management");
      return await userManagement(req, parts, user, () => body(req));
    }
    if (user.role === "OBSERVER") {
      demand(
        method === "GET" ||
          route === "exports" ||
          ["auth/logout", "auth/change-password"].includes(route),
        "El rol Observador solo permite ver y descargar.",
        403,
      );
      demand(
        !["jobs", "audit", "usage", "system", "ai", "budgets"].includes(
          parts[0],
        ),
        "Esta sección no está disponible para Observador.",
        403,
      );
    }

    if (
      parts[0] === "usage" &&
      parts.length === 3 &&
      parts[2] === "reconcile" &&
      method === "POST"
    ) {
      ownerOnly(user);
      const { reconcileCost } = await import("@/lib/cost-reconciliation");
      return send(await reconcileCost(user, parts[1], await body(req)));
    }
    if (route === "hierarchy/options" && method === "GET") {
      const { hierarchyOptions } = await import("@/lib/hierarchy-filters");
      return send(await hierarchyOptions(user, req.nextUrl.searchParams));
    }
    if (route === "jobs/archive-many" && method === "POST") {
      const b = z
        .object({
          ids: z.array(z.string().min(1).max(100)).min(1).max(200),
          restore: z.boolean().default(false),
        })
        .strict()
        .parse(await body(req));
      const { archiveSelectedJobs } = await import("@/lib/job-management");
      return send(await archiveSelectedJobs(user, b.ids, b.restore));
    }
    if (
      parts[0] === "jobs" &&
      parts[2] === "approve" &&
      parts.length === 3 &&
      method === "POST"
    )
      return send(
        await (
          await import("@/lib/preview-approval")
        ).approveJob(user, parts[1]),
      );
    if (parts[0] === "orders")
      return await (
        await import("@/lib/order-routes")
      ).orderRoutes(req, parts, user, () => body(req));
    if (route === "jobs/list" && method === "GET") {
      const { listJobs } = await import("@/lib/job-management");
      return send(await listJobs(user, req.nextUrl.searchParams));
    }
    if (
      parts[0] === "jobs" &&
      parts[2] === "archive" &&
      parts.length === 3 &&
      method === "POST"
    ) {
      const b = z
        .object({ restore: z.boolean().default(false) })
        .parse(await body(req));
      const { archiveJob } = await import("@/lib/job-management");
      return send(await archiveJob(user, parts[1], b.restore));
    }
    if (route === "jobs/stop-many" && method === "POST") {
      const b = z
        .object({ ids: z.array(z.string().min(1)).min(1).max(200) })
        .parse(await body(req));
      const { stopSelectedJobs } = await import("@/lib/job-management");
      return send(await stopSelectedJobs(user, b.ids));
    }
    if (route === "jobs/cancel-many" && method === "POST") {
      const b = z
        .object({ ids: z.array(z.string().min(1)).min(1).max(200) })
        .strict()
        .parse(await body(req));
      const { cancelSelectedJobs } = await import("@/lib/job-management");
      return send(await cancelSelectedJobs(user, b.ids));
    }
    if (parts[0] === "jobs" && parts[1] === "background") {
      const { backgroundRoutes } = await import("@/lib/background-routes");
      return await backgroundRoutes(req, parts, user, () => body(req));
    }
    if (route === "capabilities" && method === "GET")
      return send({ maxUploadBytes: maxUploadBytes() });
    if (route === "system/statistics" && method === "GET") {
      const { statistics } = await import("@/lib/statistics");
      return send(await statistics(user, req.nextUrl.searchParams.get("days")));
    }
    if (route === "system/maintenance" && method === "GET") {
      ownerOnly(user);
      const { maintenanceStatus } = await import("@/lib/maintenance");
      return send(await maintenanceStatus());
    }
    if (route === "system/cleanup" && method === "POST") {
      ownerOnly(user);
      const { runMaintenance } = await import("@/lib/maintenance");
      return send(await runMaintenance("MANUAL", user.id));
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
          sourcePolicy:project.instructionPolicy,
          canEdit:
            user.role !== "OBSERVER" &&
            (user.role === "OWNER" ||
              project.ownerId === user.id ||
              (user.role === "ADMIN" && project.allAdministrators) ||
              project.members.some((m) => m.userId === user.id)),
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
      if (route === "ai/billing-key") {
        const billing = await import("@/lib/billing-credentials");
        const provider = req.nextUrl.searchParams.get("provider") ?? "openai";
        if (method === "GET")
          return send(await billing.billingCredentialStatus(user, provider));
        if (method === "PUT")
          return send(
            await billing.saveBillingCredential(user, await body(req)),
          );
        if (method === "DELETE")
          return send(await billing.deleteBillingCredential(user, provider));
      }
      if (route === "ai/costs" && method === "GET") {
        const { readDailyCosts } = await import("@/lib/billing-credentials");
        await rateLimit("billing:" + user.id, 15);
        return send(
          await readDailyCosts(
            user,
            req.nextUrl.searchParams.get("provider") ?? "openai",
            req.nextUrl.searchParams.get("from") ?? "",
            req.nextUrl.searchParams.get("to") ?? "",
          ),
        );
      }
      if (route === "ai/connections" && method === "GET")
        return send(
          await (
            await import("@/lib/provider-connections")
          ).connections(
            user,
            req.nextUrl.searchParams.get("provider") ?? undefined,
          ),
        );
      if (route === "ai/connections" && method === "PUT")
        return send(
          await (
            await import("@/lib/provider-connections")
          ).saveConnection(user, await body(req)),
        );
      if (
        parts[1] === "connections" &&
        parts.length === 3 &&
        method === "DELETE"
      )
        return send(
          await (
            await import("@/lib/provider-connections")
          ).deleteConnection(user, parts[2]),
        );
      if (
        parts[1] === "connections" &&
        parts.length === 4 &&
        parts[3] === "verify" &&
        method === "POST"
      ) {
        await rateLimit("verify-provider:" + user.id, 15);
        const query = z
          .object({ query: z.string().trim().max(100).optional() })
          .strict()
          .parse(await body(req));
        return send(
          await (
            await import("@/lib/provider-connections")
          ).verifyConnection(user, parts[2], query.query),
        );
      }
      if (route === "ai/config" && method === "GET")
        return send({
          configuration: await (
            await import("@/lib/provider-settings")
          ).aiConfigurationView(req.nextUrl.searchParams.get("meta") === "1"),
          providers,
          testBudget: await (
            await import("@/lib/reservation-budget")
          ).testBudgetStatus(user.id),
          latestTest: await (
            await import("@/lib/provider-settings")
          ).latestConnectionTest(),
        });
      if (route === "ai/budgets" && method === "PUT") {
        const b = configSchema
          .pick({
            monthlyLimitMicros: true,
            dailyLimitMicros: true,
            operationLimitMicros: true,
            imageReserveMicros: true,
            maxGenerations: true,
          })
          .strict()
          .parse(await body(req));
        return send(
          await (
            await import("@/lib/provider-settings")
          ).saveAIBudgets(user, b),
        );
      }
      if (route === "ai/models" && method === "PUT")
        return send(
          await (
            await import("@/lib/provider-settings")
          ).saveAIConfiguration(
            user,
            configSchema.parse(await body(req)),
            true,
          ),
        );
      if (route === "ai/config" && method === "PUT")
        return send(
          await (
            await import("@/lib/provider-settings")
          ).saveAIConfiguration(user, configSchema.parse(await body(req))),
        );
      if (route === "ai/config" && method === "DELETE") {
        const current = await db.providerConfiguration.findUnique({
          where: { id: "global" },
        });
        if (current)
          await (
            await import("@/lib/provider-connections")
          ).deleteConnection(user, current.provider);
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
                mode: "Imagen + Texto",
                renderMode: "flat",
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
          select: {
            id: true,
            name: true,
            ownerId: true,
            deletedAt: true,
            updatedAt: true,
            owner: { select: { name: true } },
            _count: { select: { categories: { where: categoryFilter(user) } } },
          },
          orderBy: { updatedAt: "desc" },
        }),
      );
    if(route==="quick-start"&&method==="POST"){const {quickStart}=await import("@/lib/quick-start");return send(await quickStart(user,await body(req)),201);}
    if(route==="quick-start"&&method==="GET"){const {quickStartOptions}=await import("@/lib/quick-start");return send(await quickStartOptions(user));}
    if (route === "projects" && method === "POST") {
      const b = content.parse(await body(req));
      const p = await db.project.create({ data: { ...b, ownerId: user.id } });
      await audit(user.id, "PROYECTO_CREADO", p.id);
      return send(p, 201);
    }
    if(parts[0]==="brands"){const {brandDirectoryRoutes}=await import("@/lib/brand-directory");const result=await brandDirectoryRoutes(req,parts,user,()=>body(req));if(result)return result;}
    if (parts[0] === "subproducts" && parts[1] && parts[2] === "review" && parts.length === 3) {
      const {readReview,saveReview}=await import("@/lib/instruction-review");
      if(method==="GET")return send(await readReview(user,parts[1]));
      if(method==="POST")return send(await saveReview(user,parts[1],await body(req)));
    }
    if (parts[0] === "categories" && (parts[1] === "trash" || parts[2] === "restore" || method === "DELETE")) {
      const {productTrashRoutes}=await import("@/lib/product-trash");
      const result=await productTrashRoutes(req,parts,user);if(result)return result;
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
      if (parts[2] === "members") {
        const { projectMembers } = await import("@/lib/project-members");
        demand(parts.length <= 4, "Ruta no encontrada.", 404);
        return await projectMembers(req, id, parts[3], user, () => body(req));
      }
      await projectAccess(user, id, method === "GET" ? "NAVIGATE" : "EDIT");
      if (parts.length === 2 && method === "GET") {
        const flags = await accessFlags(user, "project", id, id);
        const p = await db.project.findUniqueOrThrow({
          where: { id },
          include: {
            categories: {
              where: categoryFilter(user),
              include: {
                _count: {
                  select: { subproducts: { where: subproductFilter(user) } },
                },
              },
            },
          },
        });
        return send({
          ...p,
          ...flags,
          instructionPolicy:flags.fullAccess?p.instructionPolicy:{},
          prompt: flags.fullAccess ? p.prompt : "",
          description: flags.fullAccess ? p.description : "",
          categories: await Promise.all(
            p.categories.map(async (c) => ({
              id: c.id,
              name: c.name,
              _count: c._count,
              prompt: (await accessFlags(user, "category", c.id, id)).fullAccess
                ? c.prompt
                : "",
            })),
          ),
        });
      }
      if (parts.length === 2 && method === "PATCH") {
        const b = content.parse(await body(req));
        await db.$transaction(async (tx) => {
          const current=await tx.project.findUniqueOrThrow({where:{id}});
          await tx.project.update({ where: { id }, data: {...b,...(b.instructionPolicy?{instructionPolicy:{...(current.instructionPolicy as object),...instructionFlags(b.instructionPolicy)}}:{})} });
          await tx.promptVersion.create({
            data: {
              scope: "project",
              resourceId: id,
              prompt: b.prompt,
              actorId: user.id,
            },
          });
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action: "PROYECTO_ACTUALIZADO",
              resourceId: id,
            },
          });
        });
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
        const created = await db.$transaction(async (tx) => {
          const product = await tx.category.create({
            data: { name: b.name, prompt: b.prompt, projectId: id },
          });
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action: "PRODUCTO_CREADO",
              resourceId: product.id,
            },
          });
          return product;
        });
        return send(created, 201);
      }
    }
    if (
      ["categories", "subproducts"].includes(parts[0]) &&
      parts[1] &&
      parts[2] === "members" &&
      parts.length <= 4
    ) {
      const { scopedMembers } = await import("@/lib/project-members");
      return await scopedMembers(
        req,
        parts[0] === "categories" ? "category" : "subproduct",
        parts[1],
        parts[3],
        user,
        () => body(req),
      );
    }
    if (route === "subproducts/bulk-delete" && method === "POST") {
      const b = z
        .object({ ids: z.array(z.string().min(1).max(100)).min(1).max(200) })
        .strict()
        .parse(await body(req));
      const { removeSubproducts } = await import("@/lib/subproduct-removal");
      return send(await removeSubproducts(user, b.ids));
    }
    if (parts[0] === "categories" && parts[1]) {
      const id = parts[1];
      await resourceAccess(
        user,
        "category",
        id,
        method === "GET" && (parts.length === 2 || parts[2] === "image-counts")
          ? "NAVIGATE"
          : method === "GET"
            ? "VIEW"
            : parts[2] === "generate"
              ? "GENERATE"
              : "EDIT",
      );
      if (
        parts.length === 4 &&
        parts[2] === "subproducts" &&
        parts[3] === "trash" &&
        method === "GET"
      ) {
        const { deletedSubproducts } =
          await import("@/lib/subproduct-recovery");
        return send(
          await deletedSubproducts(user, id, req.nextUrl.searchParams),
        );
      }
      if(parts[2]==="image-counts"&&method==="GET"){
        const subs=await db.subproduct.findMany({where:{categoryId:id,...subproductFilter(user)},select:{id:true}});
        const subIds=subs.map(sub=>sub.id),includeStatistics=req.nextUrl.searchParams.get("statistics")==="true";
        const [counts,statistics]=await Promise.all([
          db.variation.groupBy({by:["subproductId"],where:{...libraryImageVisibility(user),subproductId:{in:subIds}},_count:true}),
          includeStatistics?(await import("@/lib/subproduct-statistics")).subproductStatistics(user,subIds,req.nextUrl.searchParams):null,
        ]);
        const countMap=new Map(counts.map(row=>[row.subproductId,row._count]));
        return send(subs.map(sub=>({id:sub.id,count:countMap.get(sub.id)??0,...(statistics?{statistics:statistics.get(sub.id)}:{})})));
      }
      if (parts[2] === "preview" && method === "GET") {
        const { clientSubproductPreview } = await import("@/lib/generation");
        const subs = await db.subproduct.findMany({
          where: { categoryId: id, ...subproductFilter(user) },
        });
        const previews = [];
        for (const sub of subs) {
          const p = await clientSubproductPreview(user,sub.id);
          previews.push({
            id: sub.id,
            name: sub.name,
            text: p.instructions.text,
            warnings: p.instructions.warnings,
            advisories:p.instructions.advisories,
            settings: p.settings,
            needsSettings: p.needsSettings,
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
            previewFirst: z.boolean().default(false),
            selected: z
              .array(z.string().min(1).max(100))
              .min(1)
              .max(200)
              .optional(),
          })
          .parse(await body(req));
        const { generateBatch } = await import("@/lib/generation");
        const jobs = await generateBatch(
          user.id,
          id,
          b.requestId,
          b.selected,
          b.previewFirst,
        );
        await audit(user.id, "GENERACION_MASIVA_AUTORIZADA", id, {
          jobIds: jobs.map((j) => j.id),
          count: jobs.length,
        });
        return send(
          {
            jobs: jobs.map((j) => j.id),
            runnable: jobs
              .filter((j) => {
                const snapshot = j.snapshot as Record<string, unknown>;
                return (
                  j.status === "PENDING" &&
                  (snapshot.previewFirst !== true || snapshot.index === 0)
                );
              })
              .map((j) => j.id),
          },
          202,
        );
      }
      if (parts.length === 2 && method === "GET") {
        const c = await db.category.findUniqueOrThrow({
          where: { id },
          include: {
            project: { select: { id: true, name: true } },
            subproducts: {
              where: subproductFilter(user),
              include: {
                _count: {
                  select: { variations: { where: libraryImageVisibility(user) } },
                },
              },
            },
          },
        });
        const flags = await accessFlags(user, "category", id, c.projectId);
        const {subproductsInCreationOrder}=await import("@/lib/subproduct-order");
        c.subproducts=await subproductsInCreationOrder(id,c.subproducts);
        return send({
          ...c,
          ...flags,
          instructionPolicy:flags.fullAccess?c.instructionPolicy:{},
          prompt: flags.fullAccess ? c.prompt : "",
          settings: flags.fullAccess ? c.settings : {},
          subproducts: await Promise.all(
            c.subproducts.map(async (sub) => ({
              ...sub,
              instructionPolicy:publicInstructionPolicy(sub.instructionPolicy),
              inheritedSettings: effectiveSettings(
                c.settings,
                {},
                c.applySettingsToAll,
              ),
              forceOwn: !c.applySettingsToAll,
              ...(await accessFlags(user, "subproduct", sub.id, c.projectId)),
            })),
          ),
        });
      }
      if (parts.length === 2 && method === "PATCH") {
        const b = z
          .object({
            name: z.string().trim().min(1).max(200),
            prompt: z.string().max(30000),
            settings,
            applyPromptToAll: z.boolean().optional(),
            applySettingsToAll: z.boolean().optional(),
            instructionPolicy: instructionPolicySchema.optional(),
          })
          .parse(await body(req));
        const s = effectiveSettings(b.settings, {});
        validateDistribution(s);
        await db.$transaction(async (tx) => {
          const current=await tx.category.findUniqueOrThrow({where:{id}});
          await tx.category.update({where:{id},data:{...b,settings:b.settings,...(b.instructionPolicy?{instructionPolicy:{...(current.instructionPolicy as object),...instructionFlags(b.instructionPolicy)}}:{})}});
          await tx.promptVersion.create({
            data: {
              scope: "category",
              resourceId: id,
              prompt: b.prompt,
              actorId: user.id,
            },
          });
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action: "PRODUCTO_ACTUALIZADO",
              resourceId: id,
            },
          });
        });
        return send({ ok: true });
      }
      if (parts[2] === "subproducts" && method === "POST") {
        const b = z
          .object({
            names: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
          })
          .parse(await body(req));
        const rows = await db.$transaction(async (tx) => {
          const rows = [];
          for (const name of b.names)
            rows.push(
              await tx.subproduct.create({ data: { name, categoryId: id } }),
            );
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action: "SUBPRODUCTOS_CREADOS",
              resourceId: id,
              detail: {
                subproductIds: rows.map((s) => s.id),
                count: rows.length,
              },
            },
          });
          return rows;
        });
        return send(rows, 201);
      }
    }
    if (parts[0] === "subproducts" && parts[1]) {
      const id = parts[1];
      if (parts.length === 3 && parts[2] === "restore" && method === "POST") {
        const { restoreSubproduct } = await import("@/lib/subproduct-recovery");
        return send(await restoreSubproduct(user, id));
      }
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
      if (parts.length === 2 && method === "DELETE") {
        const { removeSubproducts } = await import("@/lib/subproduct-removal");
        return send(await removeSubproducts(user, [id]));
      }
      if (parts.length === 2 && method === "GET") {
        return send({
          ...sub,
          instructionPolicy:publicInstructionPolicy(sub.instructionPolicy),
          ...(await accessFlags(
            user,
            "subproduct",
            id,
            sub.category.projectId,
          )),
          category: {
            id: sub.category.id,
            name: sub.category.name,
            projectId: sub.category.projectId,
            project: {
              id: sub.category.project.id,
              name: sub.category.project.name,
            },
          },
        });
      }
      if (parts.length === 2 && method === "PATCH") {
        const b = z
          .object({
            name: z.string().trim().min(1).max(200),
            prompt: z.string().max(30000),
            settings,
            instructionPolicy: instructionPolicySchema.optional(),
          })
          .parse(await body(req));
        validateDistribution(
          effectiveSettings(
            sub.category.settings,
            b.settings,
            sub.category.applySettingsToAll,
          ),
        );
        await db.$transaction(async (tx) => {
          const current=await tx.subproduct.findUniqueOrThrow({where:{id}});
          await tx.subproduct.update({where:{id},data:{...b,settings:b.settings,...(b.instructionPolicy?{instructionPolicy:{...(current.instructionPolicy as object),...instructionFlags(b.instructionPolicy)}}:{})}});
          await tx.promptVersion.create({
            data: {
              scope: "subproduct",
              resourceId: id,
              prompt: b.prompt,
              actorId: user.id,
            },
          });
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action: "SUBPRODUCTO_ACTUALIZADO",
              resourceId: id,
            },
          });
        });
        return send({ ok: true });
      }
      if (parts[2] === "instructions" && method === "GET") {
        const { clientSubproductPreview } = await import("@/lib/generation");
        const preview = await clientSubproductPreview(user,id);
        return send({
          ...preview.instructions,
          settings: preview.settings,
          needsSettings: preview.needsSettings,
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
        const b = z.union([
          z.object({confirmCharge:z.literal(true),reviewedInstructions:z.literal(true),requestId:z.uuid(),previewFirst:z.boolean().default(false)}).strict(),
          z.object({confirmCharge:z.literal(true),quickGeneration:z.literal(true),requestId:z.uuid(),previewFirst:z.boolean().default(true)}).strict(),
        ]).parse(await body(req));
        const c = await configured();
        const s = effectiveSettings(
          sub.category.settings,
          sub.settings,
          sub.category.applySettingsToAll,
        );
        demand(
          sub.category.applySettingsToAll ||
            Object.keys(sub.settings as object).length > 0,
          "Define la configuración particular de este subproducto antes de generar.",
        );
        validateDistribution(s);
        const { generateBatch } = await import("@/lib/generation");
        const jobs = await generateBatch(
          user.id,
          sub.categoryId,
          b.requestId,
          [id],
          b.previewFirst,
        );
        await audit(user.id, "GENERACION_AUTORIZADA", id, {
          jobIds: jobs.map((j) => j.id),
          count: jobs.length,
          source: "quickGeneration" in b ? "generacion_rapida" : "revision",
        });
        return send(
          {
            jobs: jobs.map((j) => j.id),
            runnable: jobs
              .filter((j) => {
                const snapshot = j.snapshot as Record<string, unknown>;
                return (
                  j.status === "PENDING" &&
                  (snapshot.previewFirst !== true || snapshot.index === 0)
                );
              })
              .map((j) => j.id),
          },
          202,
        );
      }
    }
    if (parts[0] === "attachments") {
      if (parts.length === 1 && method === "GET") {
        const scope = z
            .enum(["project", "category", "subproduct", "variation", "preset"])
            .parse(req.nextUrl.searchParams.get("scope")),
          id = req.nextUrl.searchParams.get("id") ?? "";
        await resourceAccess(user, scope, id);
        return send(
          await db.attachment.findMany({
            where: {
              scope,
              resourceId: id,
              ...(req.nextUrl.searchParams.get("includeArchived") === "true"
                ? {}
                : { archivedAt: null }),
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              mime: true,
              purpose: true,
              size: true,
              archivedAt: true,
              replacesId: true,
            },
          }),
        );
      }
      if (
        method === "POST" &&
        (parts.length === 1 || (parts.length === 3 && parts[2] === "replace"))
      ) {
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
        const { saveAttachment } = await import("@/lib/attachments");
        const item = await saveAttachment(user, {
          scope,
          resourceId: id,
          file,
          purpose: form.get("purpose"),
          ...(parts[1] ? { replacesId: parts[1] } : {}),
        });
        return send(item, 201);
      }
      if (parts.length === 3 && parts[2] === "thumbnail" && method === "GET") {
        const { attachmentThumbnail } = await import("@/lib/attachments");
        return await attachmentThumbnail(user, parts[1]);
      }
      if (parts.length === 2 && method === "GET") {
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
      if (parts.length === 2 && method === "DELETE") {
        const { deleteAttachment } = await import("@/lib/attachments");
        return send(await deleteAttachment(user, parts[1]));
      }
    }
    if (route === "jobs" && method === "GET") {
      const jobs = await db.generationJob.findMany({
        where: {
          ...(user.role === "OWNER" ? {} : { actorId: user.id }),
          archivedAt: null,
        },
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
          designMode:z.enum(["professional","editable"]).default("professional"),
          reasoningLevel:z.enum(["low","medium","high"]).default("medium"),
          requestId: z.uuid(),
          confirmCharge: z.literal(true),
          reviewedInstructions: z.literal(true),
        })
        .parse(await body(req));
      const { regenerateSelected } = await import("@/lib/bulk-variations");
      return send(
        { jobs: await regenerateSelected(user, b.ids, b.requestId, b.prompt,b.designMode,b.reasoningLevel) },
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
        await libraryJobAccess(
          user,
          v.job,
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
        const thumbnail = req.nextUrl.searchParams.get("thumbnail") === "true";
        const etag = `"preview-${v.id}-${v.revision}-${jpg ? "jpg" : "webp"}"`;
        if (thumbnail && req.headers.get("if-none-match") === etag)
          return new NextResponse(null, {
            status: 304,
            headers: {
              ETag: etag,
              "Cache-Control": "private, max-age=0, must-revalidate",
            },
          });
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
            .webp({ quality: 65 })
            .toBuffer();
        const output = jpg
          ? await (await import("@/lib/render")).jpeg(bytes)
          : bytes;
        return new NextResponse(fileStream(output), {
          headers: {
            "Content-Type": jpg
              ? "image/jpeg"
              : thumbnail
                ? "image/webp"
                : "image/png",
            "Content-Disposition": `${req.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="afiche_${v.id}.${jpg ? "jpg" : "png"}"`,
            "Cache-Control": thumbnail
              ? "private, max-age=0, must-revalidate"
              : "private, no-store",
            ...(thumbnail ? { ETag: etag } : {}),
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
    if (route === "audit/history" && method === "GET") {
      const { activityHistory } = await import("@/lib/activity");
      return send(await activityHistory(user, req.nextUrl.searchParams));
    }
    if (route === "audit" && method === "GET")
      return send(
        await db.auditEvent.findMany({
          where: user.role === "OWNER" ? {} : { actorId: user.id },
          select: {
            id: true,
            actorId: true,
            action: true,
            resourceId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      );
    if (
      ["usage/list", "usage/export", "usage/summary"].includes(route) &&
      method === "GET"
    ) {
      const { usageReport, usageCsv } = await import("@/lib/usage-report");
      return route === "usage/export"
        ? await usageCsv(user, req.nextUrl.searchParams)
        : send(
            await usageReport(
              user,
              req.nextUrl.searchParams,
              route === "usage/summary",
            ),
          );
    }
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
