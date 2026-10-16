import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "./db";
import { ownerOnly, rateLimit, tokenHash } from "./auth";
import { encryptKey, decryptKey } from "./crypto";
import { AppError, demand } from "./errors";
import { issuePasswordReset } from "./accounts";
import { managesUsers, canManageAccount } from "./roles";
import { smtpAdapter, safeMailError, type MailAdapter } from "./smtp";

type Actor = { id: string; role: string };
const context = "mail:smtp:password";
const proof = z
  .object({ currentPassword: z.string().min(12).max(128) })
  .strict();
const configuration = proof
  .extend({
    host: z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .regex(
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/,
      ),
    port: z.union([z.literal(465), z.literal(587)]),
    username: z
      .email()
      .max(200)
      .transform((s) => s.toLowerCase()),
    senderName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[^\r\n]+$/),
    password: z.string().min(1).max(1000).optional(),
  })
  .strict();

async function ownerProof(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = proof.parse(input);
  await rateLimit(`mail-settings:${actor.id}`, 20);
  const account = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  demand(
    account.role === "OWNER" &&
      account.status === "APPROVED" &&
      (await argon2.verify(account.passwordHash, b.currentPassword)),
    "Tu contraseña actual no es correcta o la cuenta cambió.",
    403,
  );
  return account.passwordHash;
}
export async function mailStatus(actor: Actor) {
  ownerOnly(actor);
  const c = await db.mailConfiguration.findUnique({
    where: { id: "global" },
    select: {
      host: true,
      port: true,
      username: true,
      senderName: true,
      revision: true,
      verifiedRevision: true,
      verifiedAt: true,
      lastError: true,
      updatedAt: true,
    },
  });
  return c
    ? {
        configured: true,
        host: c.host,
        port: c.port,
        username: c.username,
        senderName: c.senderName,
        passwordMask: "••••••••",
        verifiedAt: c.verifiedAt,
        verified: c.revision === c.verifiedRevision && !!c.verifiedAt,
        lastError: c.lastError,
        updatedAt: c.updatedAt,
      }
    : { configured: false, verified: false };
}
export async function saveMail(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = configuration.parse(input);
  const passwordHash = await ownerProof(actor, {
    currentPassword: b.currentPassword,
  });
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { role: string; status: string; passwordHash: string }[]
    >`SELECT role,status,"passwordHash" FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    demand(
      rows[0]?.role === "OWNER" &&
        rows[0].status === "APPROVED" &&
        rows[0].passwordHash === passwordHash,
      "La cuenta cambió. Inicia sesión nuevamente.",
      409,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(740191)`;
    const previous = await tx.mailConfiguration.findUnique({
      where: { id: "global" },
    });
    demand(
      b.password || previous,
      "Introduce la contraseña del correo para la primera configuración.",
    );
    const data = {
      host: b.host,
      port: b.port,
      username: b.username,
      senderName: b.senderName,
      encryptedPassword: b.password
        ? encryptKey(b.password, context)
        : previous!.encryptedPassword,
      revision: randomUUID(),
      verifiedRevision: null,
      verifiedAt: null,
      lastError: null,
    };
    await tx.mailConfiguration.upsert({
      where: { id: "global" },
      create: data,
      update: data,
    });
    await tx.auditEvent.create({
      data: { actorId: actor.id, action: "CORREO_CONFIGURADO" },
    });
  });
  return mailStatus(actor);
}
export async function deleteMail(actor: Actor, input: unknown) {
  const passwordHash = await ownerProof(actor, input);
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { role: string; status: string; passwordHash: string }[]
    >`SELECT role,status,"passwordHash" FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    demand(
      rows[0]?.role === "OWNER" &&
        rows[0].status === "APPROVED" &&
        rows[0].passwordHash === passwordHash,
      "La cuenta cambió. Inicia sesión nuevamente.",
      409,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(740191)`;
    await tx.mailConfiguration.deleteMany({});
    await tx.auditEvent.create({
      data: { actorId: actor.id, action: "CORREO_ELIMINADO" },
    });
  });
  return { ok: true };
}
async function savedMail(requireVerified = true) {
  const c = await db.mailConfiguration.findUnique({ where: { id: "global" } });
  demand(
    c,
    "El OWNER debe configurar el correo en Configuración → Correo.",
    409,
  );
  demand(
    !requireVerified || (c.revision === c.verifiedRevision && c.verifiedAt),
    "El OWNER debe verificar la conexión del correo antes de enviar enlaces.",
    409,
  );
  return c;
}
function credentials(c: Awaited<ReturnType<typeof savedMail>>) {
  return {
    host: c.host,
    port: c.port,
    username: c.username,
    senderName: c.senderName,
    password: decryptKey(c.encryptedPassword, context),
  };
}
async function failure(
  c: Awaited<ReturnType<typeof savedMail>>,
  error: unknown,
) {
  const message = safeMailError(error);
  await db.mailConfiguration.updateMany({
    where: { id: c.id, revision: c.revision },
    data: { lastError: message, verifiedRevision: null, verifiedAt: null },
  });
  return message;
}
export async function verifyMail(
  actor: Actor,
  input: unknown,
  adapter: MailAdapter = smtpAdapter,
) {
  await ownerProof(actor, input);
  const c = await savedMail(false);
  try {
    await adapter.verify(credentials(c));
  } catch (error) {
    throw new AppError(await failure(c, error), 502);
  }
  const changed = await db.mailConfiguration.updateMany({
    where: { id: c.id, revision: c.revision },
    data: {
      verifiedRevision: c.revision,
      verifiedAt: new Date(),
      lastError: null,
    },
  });
  demand(
    changed.count === 1,
    "La configuración cambió durante la prueba. Vuelve a verificarla.",
    409,
  );
  await db.auditEvent.create({
    data: { actorId: actor.id, action: "CORREO_CONEXION_VERIFICADA" },
  });
  return {
    ok: true,
    message:
      "Conexión TLS y autenticación SMTP verificadas. Esto no comprueba la recepción de mensajes.",
  };
}
export async function testMail(
  actor: Actor,
  input: unknown,
  adapter: MailAdapter = smtpAdapter,
) {
  await ownerProof(actor, input);
  await rateLimit(`mail-test:${actor.id}`, 4);
  const c = await savedMail();
  const target = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { email: true },
  });
  try {
    await adapter.send(credentials(c), {
      to: target.email,
      subject: "Prueba de correo · estudio AI",
      text: "Esta es una prueba solicitada desde Configuración → Correo de estudio AI. Si recibiste este mensaje, la recepción funciona para esta dirección.",
    });
  } catch (error) {
    throw new AppError(await failure(c, error), 502);
  }
  await db.auditEvent.create({
    data: { actorId: actor.id, action: "CORREO_PRUEBA_ACEPTADA" },
  });
  return {
    ok: true,
    message:
      "El servidor aceptó el mensaje de prueba para tu correo de acceso. Revisa la bandeja de entrada y spam; la aceptación no garantiza la entrega.",
  };
}
export async function emailPasswordReset(
  actor: Actor,
  targetId: string,
  input: unknown,
  adapter: MailAdapter = smtpAdapter,
) {
  demand(managesUsers(actor.role), "No puedes administrar usuarios.", 403);
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { role: true },
  });
  demand(
    target && canManageAccount(actor.role, target.role),
    "Solo el OWNER puede recuperar cuentas elevadas.",
    403,
  );
  // issuePasswordReset reauthenticates and locks issuer/recipient, enforcing elevated-role restrictions.
  const c = await savedMail();
  const origin = new URL(process.env.APP_ORIGIN ?? "");
  demand(
    !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash &&
      (origin.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" &&
          origin.hostname === "localhost")),
    "APP_ORIGIN debe contener el origen HTTPS de la plataforma.",
    503,
  );
  const reset = await issuePasswordReset(actor, targetId, input);
  try {
    await adapter.send(credentials(c), {
      to: reset.email,
      subject: "Recupera tu acceso · estudio AI",
      text: `Se solicitó recuperar tu cuenta en estudio AI.\n\nAbre este enlace una sola vez durante los próximos 30 minutos:\n${origin.origin}/#recuperar=${encodeURIComponent(reset.token)}\n\nSi no lo solicitaste, no utilices el enlace y contacta al administrador. Tu contraseña no ha cambiado.`,
    });
  } catch (error) {
    // SMTP can fail after accepting DATA: revoke this link and never retry automatically.
    await db.passwordReset.deleteMany({
      where: { tokenHash: tokenHash(reset.token) },
    });
    throw new AppError(
      (await failure(c, error)) +
        " El enlace de este intento quedó invalidado.",
      502,
    );
  }
  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      action: "RECUPERACION_CORREO_ACEPTADA",
      resourceId: targetId,
    },
  });
  return {
    ok: true,
    message:
      "El servidor aceptó el enlace para el correo de la cuenta. Pide a la persona que revise entrada y spam; caduca en 30 minutos. No se garantiza la entrega.",
  };
}
