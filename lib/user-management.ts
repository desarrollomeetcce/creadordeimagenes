import { recordActivity } from "./activity";
import { NextRequest, NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { rateLimit } from "./auth";
import { managesUsers, canManageAccount } from "./roles";
import { issuePasswordReset } from "./accounts";

const role = z.enum([
  "OWNER",
  "ADMIN",
  "USER",
  "OBSERVER",
  "SUPERVISOR",
  "ADVISOR",
]);
const status = z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);
const password = z.string().min(12).max(128);
const select = {
  id: true,
  aiAccessEnabled: true,
  archivedAt: true,
  name: true,
  email: true,
  role: true,
  status: true,
  planId: true,
  plan: { select: { name: true, customUserId: true, archivedAt: true } },
  planValidUntil: true,
} as const;
export async function userManagement(
  req: NextRequest,
  parts: string[],
  actor: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  demand(managesUsers(actor.role), "No puedes administrar usuarios.", 403);
  const send = (data: unknown, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (parts.length === 1 && req.method === "GET")
    return send(
      await db.user.findMany({
        where:
          actor.role === "OWNER"
            ? {
                archivedAt:
                  req.nextUrl.searchParams.get("archived") === "true"
                    ? { not: null }
                    : null,
              }
            : { archivedAt: null, role: { in: ["USER", "OBSERVER"] } },
        select,
        orderBy: { name: "asc" },
      }),
    );
  if (parts.length === 1 && req.method === "POST") {
    const b = z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z
          .email()
          .max(200)
          .transform((v) => v.toLowerCase()),
        password,
        role,
      })
      .strict()
      .parse(await body());
    demand(
      canManageAccount(actor.role, b.role),
      "Solo el OWNER puede crear Administradores u OWNER.",
      403,
    );
    await rateLimit(`account-create:${actor.id}`, 30);
    const hash = await argon2.hash(b.password, { type: argon2.argon2id });
    const created = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
      const issuer = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
      });
      demand(
        issuer.status === "APPROVED" && canManageAccount(issuer.role, b.role),
        "La autorización de tu cuenta cambió.",
        403,
      );
      demand(
        !(await tx.user.findUnique({ where: { email: b.email } })),
        "Ya existe una cuenta con ese correo.",
        409,
      );
      const account = await tx.user.create({
        data: {
          name: b.name,
          email: b.email,
          role: b.role,
          status: "APPROVED",
          passwordHash: hash,
        },
        select,
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "USUARIO_CREADO",
          resourceId: account.id,
          detail: { role: b.role },
        },
      });
      return account;
    });
    return send(created, 201);
  }
  if (parts.length === 3 && parts[2] === "recovery" && req.method === "POST")
    return send(await issuePasswordReset(actor, parts[1], await body()), 201);
  if (parts.length === 3 && parts[2] === "email" && req.method === "PATCH") {
    const b = z
      .object({
        email: z
          .string()
          .trim()
          .pipe(z.email().max(200))
          .transform((v) => v.toLowerCase()),
        expectedEmail: z.string().max(200),
        currentPassword: password.optional(),
      })
      .strict()
      .parse(await body());
    await rateLimit(`account-email:${actor.id}`, 10);
    const issuer = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
    demand(
      (actor.role === "OWNER" && !b.currentPassword) ||
        (!!b.currentPassword &&
          (await argon2.verify(issuer.passwordHash, b.currentPassword))),
      "Tu contraseña actual no es correcta.",
      403,
    );
    const result = await db
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
        const rows = await tx.$queryRaw<
          {
            id: string;
            role: string;
            status: string;
            email: string;
            passwordHash: string;
          }[]
        >`SELECT id, role, status, email, "passwordHash" FROM "User" WHERE id IN (${actor.id}, ${parts[1]}) ORDER BY id FOR UPDATE`;
        const current = rows.find((r) => r.id === actor.id),
          target = rows.find((r) => r.id === parts[1]);
        demand(target, "Cuenta no encontrada.", 404);
        demand(
          current?.status === "APPROVED" &&
            current.passwordHash === issuer.passwordHash &&
            canManageAccount(current.role, target.role) &&
            (actor.role !== "OWNER" || current.role === "OWNER"),
          "No puedes cambiar el correo de esta cuenta.",
          403,
        );
        demand(
          target.email === b.expectedEmail,
          "El correo cambió. Actualiza la lista antes de editarlo.",
          409,
        );
        if (target.email === b.email)
          return { ok: true, closesOwnSession: false };
        demand(
          !(await tx.user.findFirst({
            where: {
              email: { equals: b.email, mode: "insensitive" },
              id: { not: target.id },
            },
          })),
          "Ya existe una cuenta con ese correo.",
          409,
        );
        await tx.user.update({
          where: { id: target.id },
          data: { email: b.email },
        });
        await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.passwordReset.deleteMany({ where: { userId: target.id } });
        await tx.ownerRecovery.deleteMany({ where: { userId: target.id } });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "CORREO_USUARIO_ACTUALIZADO",
            resourceId: target.id,
          },
        });
        return { ok: true, closesOwnSession: actor.id === target.id };
      })
      .catch((error) => {
        if (error?.code === "P2002")
          demand(false, "Ya existe una cuenta con ese correo.", 409);
        throw error;
      });
    return send(result);
  }
  if (
    parts.length === 3 &&
    parts[2] === "recovery-email" &&
    req.method === "POST"
  ) {
    const { emailPasswordReset } = await import("./mail");
    return send(await emailPasswordReset(actor, parts[1], await body()));
  }
  if (parts.length === 3 && parts[2] === "password" && req.method === "POST") {
    demand(
      actor.role === "OWNER",
      "Solo el OWNER puede cambiar directamente otras contraseñas.",
      403,
    );
    const b = z
      .object({ currentPassword: password.optional(), newPassword: password })
      .strict()
      .parse(await body());
    await rateLimit(`owner-password:${actor.id}`, 8);
    const issuer = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (b.currentPassword)
      demand(
        await argon2.verify(issuer.passwordHash, b.currentPassword),
        "Tu contraseña actual no es correcta.",
        403,
      );
    const hash = await argon2.hash(b.newPassword, { type: argon2.argon2id });
    await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; role: string; status: string; passwordHash: string }[]
      >`SELECT id, role, status, "passwordHash" FROM "User" WHERE id IN (${actor.id}, ${parts[1]}) ORDER BY id FOR UPDATE`;
      const current = rows.find((r) => r.id === actor.id);
      demand(
        current?.role === "OWNER" &&
          current.status === "APPROVED" &&
          current.passwordHash === issuer.passwordHash,
        "La cuenta OWNER cambió. Inicia sesión nuevamente.",
        409,
      );
      demand(
        rows.some((r) => r.id === parts[1]),
        "Cuenta no encontrada.",
        404,
      );
      await tx.user.update({
        where: { id: parts[1] },
        data: { passwordHash: hash },
      });
      await tx.session.deleteMany({ where: { userId: parts[1] } });
      await tx.passwordReset.deleteMany({ where: { userId: parts[1] } });
      await tx.ownerRecovery.deleteMany({ where: { userId: parts[1] } });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "CONTRASENA_CAMBIADA_POR_OWNER",
          resourceId: parts[1],
        },
      });
    });
    return send({ ok: true, closesOwnSession: actor.id === parts[1] });
  }
  if (
    (parts.length === 2 && req.method === "DELETE") ||
    (parts.length === 3 && parts[2] === "restore" && req.method === "POST")
  ) {
    demand(
      actor.role === "OWNER",
      "Solo OWNER puede retirar o restaurar cuentas.",
      403,
    );
    const restoring = req.method === "POST";
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
      const issuer = await tx.user.findUnique({ where: { id: actor.id } }),
        target = await tx.user.findUnique({ where: { id: parts[1] } });
      demand(
        issuer?.role === "OWNER" &&
          issuer.status === "APPROVED" &&
          !issuer.archivedAt,
        "La autorización cambió.",
        403,
      );
      demand(target, "Cuenta no encontrada.", 404);
      if (
        !restoring &&
        target.role === "OWNER" &&
        target.status === "APPROVED" &&
        !target.archivedAt
      )
        demand(
          (await tx.user.count({
            where: { role: "OWNER", status: "APPROVED", archivedAt: null },
          })) > 1,
          "No puedes retirar al último OWNER activo.",
          409,
        );
      if (!restoring) {
        const grants = await tx.effectivenessGrant.findMany({
          where: { userId: target.id },
          select: { scope: true },
        });
        await tx.effectivenessGrant.deleteMany({
          where: { userId: target.id },
        });
        for (const scope of new Set(grants.map((g) => g.scope)))
          await tx.effectivenessSharing.upsert({
            where: { scope },
            create: { scope, revision: 1 },
            update: { revision: { increment: 1 } },
          });
        const meta = await tx.metaWorkspaceGrant.deleteMany({
          where: { userId: target.id },
        });
        if (meta.count)
          await tx.metaWorkspaceSharing.upsert({
            where: { id: "global" },
            create: { id: "global", revision: 1 },
            update: { revision: { increment: 1 } },
          });
      }
      await tx.user.update({
        where: { id: target.id },
        data: {
          archivedAt: restoring ? null : new Date(),
          status: "SUSPENDED",
        },
      });
      await tx.session.deleteMany({ where: { userId: target.id } });
      await tx.passwordReset.deleteMany({ where: { userId: target.id } });
      await tx.ownerRecovery.deleteMany({ where: { userId: target.id } });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: restoring ? "USUARIO_RESTAURADO" : "USUARIO_RETIRADO",
          resourceId: target.id,
        },
      });
      return {
        ok: true,
        closesOwnSession: !restoring && target.id === actor.id,
      };
    });
    return send(result);
  }
  if (parts.length === 2 && req.method === "PATCH") {
    const b = z
      .object({
        role,
        status,
        planId: z.string().min(1).max(100).nullable().optional(),
        validUntil: z.iso.datetime().nullable().optional(),
        aiAccessEnabled: z.boolean().optional(),
        expected: z
          .object({
            role,
            status,
            planId: z.string().nullable(),
            validUntil: z.iso.datetime().nullable(),
            aiAccessEnabled: z.boolean().optional(),
          })
          .optional(),
      })
      .strict()
      .parse(await body());
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
      const issuer = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
      });
      const target = await tx.user.findUnique({ where: { id: parts[1] } });
      demand(target, "Cuenta no encontrada.", 404);
      demand(
        issuer.status === "APPROVED" &&
          canManageAccount(issuer.role, target.role) &&
          canManageAccount(issuer.role, b.role),
        "Solo el OWNER puede administrar roles elevados.",
        403,
      );
      if (b.expected)
        demand(
          target.role === b.expected.role &&
            target.status === b.expected.status &&
            target.planId === b.expected.planId &&
            (b.expected.aiAccessEnabled === undefined ||
              target.aiAccessEnabled === b.expected.aiAccessEnabled) &&
            (target.planValidUntil?.toISOString() ?? null) ===
              b.expected.validUntil,
          "La cuenta cambió. Actualiza antes de guardar.",
          409,
        );
      demand(!target.archivedAt, "Restaura la ficha antes de editarla.", 409);
      const editsPlan =
        b.planId !== undefined ||
        b.validUntil !== undefined ||
        b.aiAccessEnabled !== undefined;
      if (editsPlan)
        demand(
          issuer.role === "OWNER",
          "Solo OWNER puede asignar planes.",
          403,
        );
      const planChanged =
        editsPlan &&
        ((b.planId === undefined ? target.planId : b.planId) !==
          target.planId ||
          (b.validUntil === undefined
            ? (target.planValidUntil?.toISOString() ?? null)
            : b.validUntil) !== (target.planValidUntil?.toISOString() ?? null));
      if (planChanged && b.planId) {
        const p = await tx.membershipPlan.findUnique({
          where: { id: b.planId },
        });
        demand(p && !p.archivedAt, "Plan no disponible.", 404);
        demand(
          !p.customUserId || p.customUserId === target.id,
          "Este plan personalizado pertenece a otra cuenta.",
          403,
        );
      }
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
      const permissionChanged =
        target.role !== b.role || target.status !== b.status;
      const account = await tx.user.update({
        where: { id: target.id },
        data: {
          role: b.role,
          status: b.status,
          ...(b.aiAccessEnabled !== undefined
            ? { aiAccessEnabled: b.aiAccessEnabled }
            : {}),
          ...(editsPlan
            ? {
                ...(b.planId !== undefined ? { planId: b.planId } : {}),
                ...(b.validUntil !== undefined
                  ? {
                      planValidUntil: b.validUntil
                        ? new Date(b.validUntil)
                        : null,
                    }
                  : {}),
              }
            : {}),
        },
        select,
      });
      if (permissionChanged) {
        await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.passwordReset.deleteMany({ where: { userId: target.id } });
        await tx.ownerRecovery.deleteMany({ where: { userId: target.id } });
      }
      if (planChanged)
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "PLAN_ASIGNADO",
            resourceId: target.id,
            detail: {
              plan: account.planId ?? "SIN_PLAN",
              previousPlan: target.planId ?? "SIN_PLAN",
            },
          },
        });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "USUARIO_ACTUALIZADO",
          resourceId: target.id,
        },
      });
      return {
        ok: true,
        account,
        closesOwnSession: permissionChanged && target.id === actor.id,
        reloadOwn:
          target.id === actor.id &&
          target.aiAccessEnabled !== account.aiAccessEnabled,
      };
    });
    return send(result);
  }
  demand(false, "Operación de usuarios no encontrada.", 404);
}
