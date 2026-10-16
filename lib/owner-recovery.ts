import { recordActivity } from "./activity";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "./db";
import { ownerOnly, rateLimit, tokenHash, equalSecret } from "./auth";
import { demand } from "./errors";
const password = z.string().min(12).max(128);
const invalid =
  "El código de emergencia no es válido, ya fue utilizado o ha caducado.";
const hashCode = (code: string) => tokenHash("owner-emergency:" + code);

export async function ownerRecoveryStatus(user: { id: string; role: string }) {
  ownerOnly(user);
  const record = await db.ownerRecovery.findUnique({
    where: { userId: user.id },
    select: { createdAt: true, expiresAt: true },
  });
  return {
    enabled: !!record && record.expiresAt > new Date(),
    createdAt: record?.createdAt ?? null,
    expiresAt: record?.expiresAt ?? null,
  };
}
export async function manageOwnerRecovery(
  user: { id: string; role: string },
  input: unknown,
  revoke = false,
) {
  ownerOnly(user);
  const b = z.object({ currentPassword: password }).strict().parse(input);
  await rateLimit(`owner-emergency:manage:${user.id}`, 8);
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  demand(
    await argon2.verify(account.passwordHash, b.currentPassword),
    "Tu contraseña actual no es correcta.",
    403,
  );
  const code = "OWNER-" + randomBytes(32).toString("base64url"),
    expiresAt = new Date(Date.now() + 365 * 86400000);
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { role: string; status: string; passwordHash: string }[]
    >`SELECT role,status,"passwordHash" FROM "User" WHERE id=${user.id} FOR UPDATE`;
    demand(
      rows[0]?.role === "OWNER" &&
        rows[0].status === "APPROVED" &&
        rows[0].passwordHash === account.passwordHash,
      "La cuenta cambió. Inicia sesión nuevamente.",
      409,
    );
    await tx.ownerRecovery.deleteMany({ where: { userId: user.id } });
    if (!revoke)
      await tx.ownerRecovery.create({
        data: { userId: user.id, tokenHash: hashCode(code), expiresAt },
      });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: revoke
          ? "EMERGENCIA_OWNER_REVOCADA"
          : "EMERGENCIA_OWNER_CREADA",
      },
    });
  });
  return revoke ? { ok: true } : { code, expiresAt };
}
export async function recoverOwner(input: unknown) {
  const b = z
    .object({
      email: z
        .email()
        .max(200)
        .transform((v) => v.toLowerCase()),
      code: z.string().regex(/^OWNER-[A-Za-z0-9_-]{43}$/),
      newPassword: password,
    })
    .strict()
    .parse(input);
  await rateLimit("owner-emergency:global", 30);
  await rateLimit(`owner-emergency:email:${tokenHash(b.email)}`, 8);
  const account = await db.user.findUnique({
    where: { email: b.email },
    select: {
      id: true,
      role: true,
      status: true,
      ownerRecovery: { select: { tokenHash: true, expiresAt: true } },
    },
  });
  const hash = hashCode(b.code);
  demand(
    account?.role === "OWNER" &&
      account.status === "APPROVED" &&
      !!account.ownerRecovery &&
      equalSecret(account.ownerRecovery.tokenHash, hash) &&
      account.ownerRecovery.expiresAt > new Date(),
    invalid,
    400,
  );
  const passwordHash = await argon2.hash(b.newPassword, {
    type: argon2.argon2id,
  });
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { role: string; status: string }[]
    >`SELECT role,status FROM "User" WHERE id=${account.id} FOR UPDATE`;
    demand(
      rows[0]?.role === "OWNER" && rows[0].status === "APPROVED",
      invalid,
      400,
    );
    const used = await tx.ownerRecovery.deleteMany({
      where: {
        userId: account.id,
        tokenHash: hash,
        expiresAt: { gt: new Date() },
      },
    });
    demand(used.count === 1, invalid, 400);
    await tx.user.update({ where: { id: account.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: account.id } });
    await tx.passwordReset.deleteMany({ where: { userId: account.id } });
    await recordActivity(tx, {
      data: { actorId: account.id, action: "OWNER_RECUPERADO_EMERGENCIA" },
    });
  });
  return {
    ok: true,
    message:
      "Cuenta recuperada. Inicia sesión con tu nueva contraseña y genera un código de emergencia nuevo.",
  };
}
