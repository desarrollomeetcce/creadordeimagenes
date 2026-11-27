import { recordActivity } from "./activity";
import { NextRequest, NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { rateLimit } from "./auth";
import { managesUsers, canManageAccount, canCreateUsers, canSetAccountPassword } from "./roles";
import { issuePasswordReset } from "./accounts";
import { linkedMessagingUser } from "./pulpo-sso";
import { signMenu } from "./pulpo-menu-token";
import { readMenuVisibility } from "./pulpo-menu-model";
import { Prisma } from "@prisma/client";
import { saveRoleMenu } from "./role-menu";
import { mirrorRoleMenu } from "./mirror-role-menu";
import { syncMessagingUser, syncMessagingRole } from "./pulpo-messaging-users";

const role = z.enum([
  "OWNER",
  "SUPERADMIN",
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
  pulpoManagedLogin: true,
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
  if (parts.length === 2 && parts[1] === "role-menus") {
    demand(actor.role === "OWNER", "Solo el Owner puede configurar menús por rol.", 403);
    if (req.method === "GET") {
      const menus = await db.roleMenu.findMany();
      return send({ menus: Object.fromEntries(menus.map(({ role, menu }) => [role, menu])) });
    }
    if (req.method === "PATCH") {
      const input = z.object({ role, menu: z.unknown(), expected: z.unknown() }).strict().parse(await body());
      const menu = readMenuVisibility(input.menu);
      const expected = readMenuVisibility(input.expected);
      demand(input.role !== "OWNER" && menu !== undefined && expected !== undefined, "Revisa el rol y las páginas seleccionadas.");
      await saveRoleMenu(actor.id, input.role, menu, expected);
      const issuer = await db.user.findFirst({
        where: { id: actor.id, role: "OWNER", archivedAt: null, status: "APPROVED" },
        select: { id: true, email: true, pulpoUserId: true },
      });
      const id = issuer && linkedMessagingUser(issuer);
      const peer = issuer && id ? await mirrorRoleMenu(id, issuer.email, { role: input.role.toLowerCase(), menu, expected }) : false;
      return send({ menu, peer });
    }
  }
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
            : { archivedAt: null, role: { in: actor.role === "SUPERADMIN" ? ["USER", "OBSERVER", "ADVISOR", "SUPERVISOR"] : ["USER", "OBSERVER"] } },
        select: { ...select, pulpoUserId: true, menuVisibility: true },
        orderBy: { name: "asc" },
      }).then((users) => users.map(({ pulpoUserId, ...user }) => ({
        ...user,
        sharedRole: Boolean(linkedMessagingUser({ ...user, pulpoUserId })),
      }))),
    );
  if (parts.length === 1 && req.method === "POST") {
    demand(canCreateUsers(actor.role), "Solo Owner y Superadministrador pueden crear usuarios.", 403);
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
      "Solo el OWNER puede crear cuentas privilegiadas.",
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
        issuer.status === "APPROVED" && !issuer.archivedAt && canCreateUsers(issuer.role) && canManageAccount(issuer.role, b.role),
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
    const messagingSync = await syncMessagingUser(actor.id, created.id, b.password);
    return send({ ...created, messagingSync }, 201);
  }
  if (parts.length === 3 && parts[2] === "messaging" && req.method === "POST")
    return send(await syncMessagingUser(actor.id, parts[1]));
  if (parts.length === 3 && parts[2] === "menu" && req.method === "PATCH") {
    demand(actor.role === "OWNER", "Solo el Owner puede configurar el menú de otra cuenta.", 403);
    const input = z.object({ menu: z.unknown(), expected: z.unknown() }).strict().parse(await body());
    const menu = readMenuVisibility(input.menu);
    const expected = readMenuVisibility(input.expected);
    demand(menu !== undefined && expected !== undefined, "Revisa las páginas seleccionadas.");
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
      const issuer = await tx.user.findFirst({ where: { id: actor.id, role: "OWNER", status: "APPROVED", archivedAt: null }, select: { id: true } });
      demand(issuer, "Solo el Owner puede configurar el menú de otra cuenta.", 403);
      const target = await tx.user.findFirst({ where: { id: parts[1], archivedAt: null }, select: { role: true, menuVisibility: true } });
      demand(target, "Usuario no disponible.", 404);
      demand(target.role !== "OWNER", "El Owner conserva el menú completo.", 409);
      const current = readMenuVisibility(target.menuVisibility ?? null) ?? null;
      demand(JSON.stringify(current) === JSON.stringify(expected), "El menú cambió. Vuelve a abrirlo antes de guardar.", 409);
      await tx.user.update({ where: { id: parts[1] }, data: { menuVisibility: menu === null ? Prisma.DbNull : menu } });
    });
    return send({ menu });
  }
  if (parts.length === 2 && parts[1] === "sync-messaging" && req.method === "POST") {
    demand(actor.role === "OWNER", "Solo Owner puede sincronizar el directorio.", 403);
    const issuer = await db.user.findFirst({
      where: { id: actor.id, role: "OWNER", status: "APPROVED", archivedAt: null },
      select: { id: true, email: true, pulpoUserId: true },
    });
    const id = issuer && linkedMessagingUser(issuer);
    demand(issuer && id, "Primero vincula tu cuenta de Owner con Mensajería.", 403);
    const authorization = signMenu("merge-pulpo-users", id, issuer.email.trim().toLowerCase());
    demand(authorization, "Falta configurar la conexión compartida con Mensajería.", 503);
    const response = await fetch("https://pulpo.agenciamagneto.org/api/integrations/sync-directory", {
      method: "POST", headers: { Authorization: authorization }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(90000),
    }).catch(() => null);
    demand(response?.ok, response?.status === 403
      ? "La cuenta debe ser Owner y estar vinculada en ambas aplicaciones."
      : "No se pudo confirmar la sincronización con Mensajería. Actualiza el directorio y vuelve a intentar.", 503);
    return send(await response.json());
  }
  if (parts.length === 3 && parts[2] === "shared-role" && req.method === "POST") {
    demand(actor.role === "OWNER", "Solo Owner puede cambiar roles compartidos.", 403);
    const b = z.object({ role, expectedRole: role }).strict().parse(await body());
    const result = await syncMessagingRole(actor.id, parts[1], b.role, b.expectedRole);
    demand(result.state === "linked", "No se confirmó el rol en ambos sistemas: " + result.state + ". Actualiza los accesos antes de reintentar.", 409);
    return send({ ...result, closesOwnSession: actor.id === parts[1] });
  }
  if (parts.length === 3 && parts[2] === "recovery" && req.method === "POST")
    return send(await issuePasswordReset(actor, parts[1], await body()), 201);
  if (parts.length === 3 && parts[2] === "profile" && req.method === "PATCH")
    return send(await (await import("./user-profile")).updateUserProfile(actor, parts[1], await body()));
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
      canCreateUsers(actor.role),
      "Solo Owner o Superadministrador pueden cambiar contraseñas de otras cuentas autorizadas.",
      403,
    );
    const b = z
      .object({ currentPassword: password.optional(), newPassword: password })
      .strict()
      .parse(await body());
    await rateLimit(`managed-password:${actor.id}`, 8);
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
        { id: string; role: string; status: string; passwordHash: string; archivedAt: Date | null; pulpoManagedLogin: boolean }[]
      >`SELECT id, role, status, "passwordHash", "archivedAt", "pulpoManagedLogin" FROM "User" WHERE id IN (${actor.id}, ${parts[1]}) ORDER BY id FOR UPDATE`;
      const current = rows.find((r) => r.id === actor.id);
      const target = rows.find((r) => r.id === parts[1]);
      demand(
        current?.role === actor.role && !current.archivedAt &&
          current.status === "APPROVED" &&
          current.passwordHash === issuer.passwordHash,
        "La cuenta cambió. Inicia sesión nuevamente.",
        409,
      );
      demand(target && !target.archivedAt, "Cuenta no disponible.", 404);
      demand(
        canSetAccountPassword(current.role, target.role),
        "Solo el Owner puede cambiar la contraseña de esta cuenta.",
        403,
      );
      demand(
        !target.pulpoManagedLogin,
        "Esta contraseña se administra en Pulpo Mensajería.",
        409,
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
          action: current.role === "OWNER" ? "CONTRASENA_CAMBIADA_POR_OWNER" : "CONTRASENA_CAMBIADA_POR_SUPERADMIN",
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
      demand(
        target.role === b.role || !linkedMessagingUser(target),
        "Para cambiar el rol de una cuenta vinculada, abre Usuarios y accesos en Pulpo Mensajería.",
        409,
      );
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
          ...(b.role === "OWNER" ? { aiAccessEnabled: true } : b.aiAccessEnabled !== undefined
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
