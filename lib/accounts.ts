import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "./db";
import { rateLimit, tokenHash } from "./auth";
import { canManageAccount, managesUsers } from "./roles";
import { demand } from "./errors";

const password = z.string().min(12).max(128);
export async function changePassword(user: { id: string }, input: unknown) {
  const b = z
    .object({ currentPassword: password, newPassword: password })
    .strict()
    .parse(input);
  await rateLimit(`password:${user.id}`, 8);
  demand(
    b.currentPassword !== b.newPassword,
    "Elige una contraseña diferente de la actual.",
  );
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  demand(
    await argon2.verify(account.passwordHash, b.currentPassword),
    "La contraseña actual no es correcta.",
    403,
  );
  const passwordHash = await argon2.hash(b.newPassword, {
    type: argon2.argon2id,
  });
  await db.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: {
        id: user.id,
        passwordHash: account.passwordHash,
        status: "APPROVED",
      },
      data: { passwordHash },
    });
    demand(
      changed.count === 1,
      "La cuenta cambió. Vuelve a iniciar sesión.",
      409,
    );
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.passwordReset.deleteMany({ where: { userId: user.id } });
    await tx.ownerRecovery.deleteMany({ where: { userId: user.id } });
    await tx.auditEvent.create({
      data: { actorId: user.id, action: "CONTRASENA_CAMBIADA" },
    });
  });
  return {
    ok: true,
    message:
      "Contraseña actualizada. Inicia sesión nuevamente; se cerraron todas tus sesiones.",
  };
}

export async function issuePasswordReset(
  user: { id: string; role: string },
  targetId: string,
  input: unknown,
) {
  demand(
    managesUsers(user.role),
    "Solo OWNER o Administrador pueden recuperar cuentas autorizadas.",
    403,
  );
  const b = z.object({ currentPassword: password }).strict().parse(input);
  await rateLimit(`recovery-issue:${user.id}`, 8);
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  demand(
    await argon2.verify(account.passwordHash, b.currentPassword),
    "Tu contraseña actual no es correcta.",
    403,
  );
  const token = randomBytes(32).toString("base64url"),
    expiresAt = new Date(Date.now() + 30 * 60000);
  await db.$transaction(async (tx) => {
    // Lock both accounts in a stable order and recheck the privileged issuer credentials.
    const rows = await tx.$queryRaw<
      { id: string; role: string; status: string; passwordHash: string }[]
    >`SELECT "id", "role", "status", "passwordHash" FROM "User" WHERE "id" IN (${user.id}, ${targetId}) ORDER BY "id" FOR UPDATE`;
    const issuer = rows.find((row) => row.id === user.id);
    demand(
      issuer?.role === user.role &&
        managesUsers(issuer.role) &&
        issuer.status === "APPROVED" &&
        issuer.passwordHash === account.passwordHash,
      "La cuenta que administra cambió. Inicia sesión nuevamente.",
      409,
    );
    const target = rows.find((row) => row.id === targetId);
    demand(
      target && canManageAccount(issuer.role, target.role),
      "Solo el OWNER puede recuperar cuentas elevadas.",
      403,
    );
    demand(
      rows.find((row) => row.id === targetId)?.status === "APPROVED",
      "Solo se pueden recuperar cuentas aprobadas.",
      409,
    );
    await tx.passwordReset.deleteMany({ where: { userId: targetId } });
    await tx.passwordReset.create({
      data: { tokenHash: tokenHash(token), userId: targetId, expiresAt },
    });
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action: "RECUPERACION_EMITIDA",
        resourceId: targetId,
      },
    });
  });
  return { token, expiresAt };
}

export async function resetPassword(input: unknown) {
  const b = z
    .object({
      token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      newPassword: password,
    })
    .strict()
    .parse(input);
  await rateLimit("recovery:global", 100);
  const hash = tokenHash(b.token);
  await rateLimit(`recovery:${hash}`, 8);
  const reset = await db.passwordReset.findUnique({
    where: { tokenHash: hash },
  });
  demand(
    reset && reset.expiresAt > new Date(),
    "El enlace de recuperación no es válido o ya caducó.",
    400,
  );
  const passwordHash = await argon2.hash(b.newPassword, {
    type: argon2.argon2id,
  });
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { status: string }[]
    >`SELECT "status" FROM "User" WHERE "id" = ${reset.userId} FOR UPDATE`;
    demand(
      rows[0]?.status === "APPROVED",
      "La cuenta no está habilitada. Contacta al OWNER.",
      403,
    );
    const used = await tx.passwordReset.deleteMany({
      where: { tokenHash: hash, expiresAt: { gt: new Date() } },
    });
    demand(
      used.count === 1,
      "El enlace de recuperación no es válido o ya fue utilizado.",
      400,
    );
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    await tx.passwordReset.deleteMany({ where: { userId: reset.userId } });
    await tx.ownerRecovery.deleteMany({ where: { userId: reset.userId } });
    await tx.auditEvent.create({
      data: { actorId: reset.userId, action: "CONTRASENA_RECUPERADA" },
    });
  });
  return { ok: true };
}
