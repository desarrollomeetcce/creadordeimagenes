import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { db } from "../lib/db";
import {
  mailStatus,
  saveMail,
  verifyMail,
  testMail,
  emailPasswordReset,
} from "../lib/mail";
import { decryptKey } from "../lib/crypto";
import { publicSmtpIPv4, safeMailError, type MailAdapter } from "../lib/smtp";
import { tokenHash } from "../lib/auth";

const root = "http://localhost:3000",
  password = "Correo-pruebas-0123456789";
test("Correo SMTP: permisos, cifrado y recuperación sin envíos externos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("/workspace/work/pgdata"),
    "Solo base local sintética",
  );
  const tag = randomUUID().slice(0, 8),
    ids: string[] = [];
  const account = async (role: "OWNER" | "ADMIN" | "USER" | "OBSERVER") => {
    const value = await db.user.create({
      data: {
        email: `${role}-${tag}@example.test`.toLowerCase(),
        name: `Correo ${role}`,
        role,
        status: "APPROVED",
        passwordHash: await argon2.hash(password),
      },
    });
    ids.push(value.id);
    return value;
  };
  const owner = await account("OWNER"),
    admin = await account("ADMIN"),
    user = await account("USER"),
    observer = await account("OBSERVER");
  const cookies = new Map<string, string>();
  async function call(
    actor: typeof owner | null,
    path: string,
    method = "GET",
    data?: unknown,
  ) {
    if (actor && !cookies.has(actor.id)) {
      const login = await fetch(root + "/api/auth/login", {
        method: "POST",
        headers: { Origin: root, "Content-Type": "application/json" },
        body: JSON.stringify({ email: actor.email, password }),
      });
      assert.equal(login.status, 200);
      cookies.set(actor.id, login.headers.get("set-cookie")!.split(";")[0]);
    }
    const res = await fetch(root + "/api/" + path, {
      method,
      headers: {
        Origin: root,
        "Content-Type": "application/json",
        ...(actor ? { Cookie: cookies.get(actor.id)! } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return { status: res.status, body: await res.json() };
  }
  const mailPassword = "synthetic-mail-secret-not-real-012345",
    config = {
      currentPassword: password,
      host: "smtp.hostinger.com",
      port: 465 as const,
      username: "synthetic@example.test",
      senderName: "Estudio de prueba",
      password: mailPassword,
    },
    proof = { currentPassword: password };
  const messages: { to: string; subject: string; text: string }[] = [];
  let calls = 0;
  const adapter: MailAdapter = {
    async verify(c) {
      calls++;
      assert.equal(c.password, mailPassword);
    },
    async send(c, message) {
      calls++;
      assert.equal(c.password, mailPassword);
      messages.push(message);
    },
  };
  try {
    await t.test(
      "solo OWNER configura y consulta; API nunca devuelve contraseña ni cifrado",
      async () => {
        assert.equal((await call(null, "mail")).status, 401);
        for (const role of [admin, user, observer]) {
          for (const [path, method] of [
            ["mail", "GET"],
            ["mail", "PUT"],
            ["mail", "DELETE"],
            ["mail/verify", "POST"],
            ["mail/test", "POST"],
          ])
            assert.equal(
              (
                await call(
                  role,
                  path,
                  method,
                  method === "GET" ? undefined : config,
                )
              ).status,
              403,
            );
        }
        assert.equal(
          (
            await call(owner, "mail", "PUT", {
              ...config,
              currentPassword: "Incorrecta-0123456789",
            })
          ).status,
          403,
        );
        assert.equal(
          (await call(owner, "mail", "PUT", { ...config, port: 25 })).status,
          400,
        );
        assert.equal((await call(owner, "mail", "PUT", config)).status, 200);
        const c = await db.mailConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        assert.notEqual(c.encryptedPassword, mailPassword);
        assert.equal(
          decryptKey(c.encryptedPassword, "mail:smtp:password"),
          mailPassword,
        );
        assert.throws(() => decryptKey(c.encryptedPassword));
        const status = await call(owner, "mail");
        assert.equal(status.body.verified, false);
        assert.equal(status.body.passwordMask, "••••••••");
        assert(!JSON.stringify(status.body).includes(mailPassword));
        assert(!JSON.stringify(status.body).includes(c.encryptedPassword));
        await assert.rejects(testMail(owner, proof, adapter), /verificar/);
        assert.equal(calls, 0);
      },
    );
    await t.test(
      "verificación real del adaptador, revisión concurrente, errores saneados y prueba explícita",
      async () => {
        await verifyMail(owner, proof, adapter);
        assert.equal((await mailStatus(owner)).verified, true);
        await testMail(owner, proof, adapter);
        assert.equal(messages.at(-1)!.to, owner.email);
        const previous = await db.mailConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        const { password: ignored, ...keep } = config;
        await saveMail(owner, keep);
        assert.equal((await mailStatus(owner)).verified, false);
        assert.equal(
          (
            await db.mailConfiguration.findUniqueOrThrow({
              where: { id: "global" },
            })
          ).encryptedPassword,
          previous.encryptedPassword,
        );
        await assert.rejects(
          verifyMail(owner, proof, {
            ...adapter,
            async verify() {
              throw Object.assign(new Error(mailPassword), { code: "EAUTH" });
            },
          }),
          /rechazó/,
        );
        assert(!JSON.stringify(await mailStatus(owner)).includes(mailPassword));
        await assert.rejects(
          verifyMail(owner, proof, {
            ...adapter,
            async verify() {
              await saveMail(owner, keep);
            },
          }),
          /cambió durante/,
        );
        assert.equal((await mailStatus(owner)).verified, false);
        await verifyMail(owner, proof, adapter);
      },
    );
    await t.test(
      "recuperación por correo: destino registrado, privilegios, hash, un uso y sin token en respuesta",
      async () => {
        const before = calls;
        assert.equal(
          (await call(user, `users/${user.id}/recovery-email`, "POST", proof))
            .status,
          403,
        );
        assert.equal(
          (
            await call(
              observer,
              `users/${user.id}/recovery-email`,
              "POST",
              proof,
            )
          ).status,
          403,
        );
        assert.equal(
          (await call(admin, `users/${owner.id}/recovery-email`, "POST", proof))
            .status,
          403,
        );
        assert.equal(calls, before);
        const result = await emailPasswordReset(admin, user.id, proof, adapter);
        const message = messages.at(-1)!;
        assert.equal(message.to, user.email);
        const token = message.text.match(/#recuperar=([A-Za-z0-9_-]{43})/)![1];
        assert(!JSON.stringify(result).includes(token));
        const stored = await db.passwordReset.findUniqueOrThrow({
          where: { tokenHash: tokenHash(token) },
        });
        assert.equal(stored.userId, user.id);
        assert(stored.expiresAt.getTime() - Date.now() <= 1800000);
        const reset = await call(null, "auth/reset-password", "POST", {
          token,
          newPassword: password,
        });
        assert.equal(reset.status, 200);
        assert.equal(
          (
            await call(null, "auth/reset-password", "POST", {
              token,
              newPassword: password,
            })
          ).status,
          400,
        );
        const audit = JSON.stringify(
          await db.auditEvent.findMany({ where: { actorId: { in: ids } } }),
        );
        assert(!audit.includes(token));
        assert(!audit.includes(mailPassword));
        assert(!audit.includes(password));
        await assert.rejects(
          emailPasswordReset(owner, user.id, proof, {
            ...adapter,
            async send() {
              throw new Error(mailPassword);
            },
          }),
          /invalidado/,
        );
        assert.equal(
          await db.passwordReset.count({ where: { userId: user.id } }),
          0,
        );
        assert.equal((await mailStatus(owner)).verified, false);
      },
    );
    await t.test(
      "eliminar exige contraseña; bloquear direcciones privadas y no mostrar errores SMTP crudos",
      async () => {
        for (const ip of [
          "127.0.0.1",
          "10.0.0.1",
          "172.16.1.1",
          "192.168.1.1",
          "169.254.169.254",
          "100.64.0.1",
          "224.0.0.1",
          "::1",
          "::ffff:127.0.0.1",
          "999.1.1.1",
        ])
          assert.equal(publicSmtpIPv4(ip), false, ip);
        assert.equal(publicSmtpIPv4("8.8.8.8"), true);
        assert(!safeMailError(new Error(mailPassword)).includes(mailPassword));
        assert.equal(
          (
            await call(owner, "mail", "DELETE", {
              currentPassword: "Incorrecta-0123456789",
            })
          ).status,
          403,
        );
        assert.equal((await call(owner, "mail", "DELETE", proof)).status, 200);
        assert.equal((await mailStatus(owner)).configured, false);
        assert.equal(
          (
            await call(
              owner,
              "users/" + user.id + "/recovery-email",
              "POST",
              proof,
            )
          ).status,
          409,
        );
      },
    );
  } finally {
    await db.mailConfiguration.deleteMany({});
    await db.$disconnect();
  }
});
