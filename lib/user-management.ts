import { NextRequest, NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { rateLimit } from "./auth";
import { managesUsers, canManageAccount } from "./roles";
import { issuePasswordReset } from "./accounts";

const role = z.enum(["OWNER", "ADMIN", "USER", "OBSERVER"]);
const status = z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);
const password = z.string().min(12).max(128);
const select = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
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
          actor.role === "OWNER" ? {} : { role: { in: ["USER", "OBSERVER"] } },
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
      await tx.auditEvent.create({
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
      .object({ currentPassword: password, newPassword: password })
      .strict()
      .parse(await body());
    await rateLimit(`owner-password:${actor.id}`, 8);
    const issuer = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
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
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "CONTRASENA_CAMBIADA_POR_OWNER",
          resourceId: parts[1],
        },
      });
    });
    return send({ ok: true, closesOwnSession: actor.id === parts[1] });
  }
  if (parts.length === 2 && req.method === "PATCH") {
    const b = z
      .object({ role, status })
      .strict()
      .parse(await body());
    await db.$transaction(async (tx) => {
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
      await tx.ownerRecovery.deleteMany({ where: { userId: target.id } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "USUARIO_ACTUALIZADO",
          resourceId: target.id,
        },
      });
    });
    return send({ ok: true });
  }
  demand(false, "Operación de usuarios no encontrada.", 404);
}
