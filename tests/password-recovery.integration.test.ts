import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { tokenHash } from "../lib/auth";
import { requestPasswordReset, emailPasswordReset } from "../lib/mail";
import { issuePasswordReset, resetPassword } from "../lib/accounts";
import type { MailAdapter } from "../lib/smtp";

test("Recuperación por correo sin contraseña previa y enlace de un solo uso", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const previous = await db.mailConfiguration.findUnique({
      where: { id: "global" },
    }),
    origin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://recovery.example.test";
  const tag = randomUUID(),
    password = "Recuperar-prueba-0123456789",
    passwordHash = await argon2.hash(password);
  const users = await Promise.all(
    (["OWNER", "ADMIN", "USER"] as const).map((role) =>
      db.user.create({
        data: {
          email: `recovery-${role.toLowerCase()}-${tag}@example.test`,
          name: "QA recuperación " + tag,
          passwordHash,
          role,
          status: "APPROVED",
        },
      }),
    ),
  );
  const [owner, admin, user] = users,
    ids = users.map((u) => u.id),
    messages: { to: string; subject: string; text: string }[] = [];
  const adapter: MailAdapter = {
    async verify() {},
    async send(_c, m) {
      messages.push(m);
    },
  };
  const ready = () =>
    db.mailConfiguration.upsert({
      where: { id: "global" },
      create: {
        host: "smtp.example.test",
        port: 465,
        username: "sender@example.test",
        senderName: "QA",
        encryptedPassword: encryptKey(
          "synthetic-mail-secret",
          "mail:smtp:password",
        ),
        revision: tag,
        verifiedRevision: tag,
        verifiedAt: new Date(),
      },
      update: {
        revision: tag,
        verifiedRevision: tag,
        verifiedAt: new Date(),
        encryptedPassword: encryptKey(
          "synthetic-mail-secret",
          "mail:smtp:password",
        ),
      },
    });
  try {
    await ready();
    await t.test(
      "Público no distingue correo ausente/bloqueado; nunca expone el enlace",
      async () => {
        const absent = await requestPasswordReset(
          { email: `missing-${tag}@example.test` },
          adapter,
        );
        await db.user.update({
          where: { id: user.id },
          data: { status: "SUSPENDED" },
        });
        assert.deepEqual(
          await requestPasswordReset({ email: user.email }, adapter),
          absent,
        );
        assert.equal(messages.length, 0);
        await db.user.update({
          where: { id: user.id },
          data: { status: "APPROVED" },
        });
        const result = await requestPasswordReset(
          { email: "  " + user.email.toUpperCase() + "  " },
          adapter,
        );
        assert.deepEqual(result, absent);
        assert.equal(messages.length, 1);
        const token = messages[0].text.match(
          /#recuperar=([A-Za-z0-9_-]{43})/,
        )![1];
        assert(!JSON.stringify(result).includes(token));
        assert.equal(messages[0].to, user.email);
        assert(
          messages[0].text.includes(
            "https://recovery.example.test/#recuperar=",
          ),
        );
        const reset = await db.passwordReset.findUniqueOrThrow({
          where: { tokenHash: tokenHash(token) },
        });
        assert(reset.expiresAt.getTime() - Date.now() <= 1800000);
      },
    );
    await t.test(
      "El enlace cambia la contraseña sin conocer la anterior, revoca sesiones y no se reutiliza",
      async () => {
        const token = messages[0].text.match(
          /#recuperar=([A-Za-z0-9_-]{43})/,
        )![1];
        await db.session.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        await resetPassword({ token, newPassword: password + "-nueva" });
        assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
        assert(
          await argon2.verify(
            (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
              .passwordHash,
            password + "-nueva",
          ),
        );
        await assert.rejects(resetPassword({ token, newPassword: password }));
        const audit = JSON.stringify(
          await db.auditEvent.findMany({ where: { actorId: { in: ids } } }),
        );
        assert(!audit.includes(token));
        assert(!audit.includes(password));
      },
    );
    await t.test(
      "Interno envía sin contraseña y respeta permisos; copiar enlace mantiene reautenticación",
      async () => {
        await emailPasswordReset(admin, user.id, {}, adapter);
        assert.equal(messages.at(-1)!.to, user.email);
        await assert.rejects(
          emailPasswordReset(admin, owner.id, {}, adapter),
          /OWNER/,
        );
        await assert.rejects(issuePasswordReset(owner, user.id, {}));
        await db.user.update({
          where: { id: admin.id },
          data: { status: "SUSPENDED" },
        });
        await assert.rejects(emailPasswordReset(admin, user.id, {}, adapter));
      },
    );
    await t.test(
      "Fallo de correo revoca token sin filtrar existencia; configuración ausente afecta a todos igual",
      async () => {
        const result = await requestPasswordReset(
          { email: user.email },
          {
            ...adapter,
            async send() {
              throw Error("synthetic-mail-secret");
            },
          },
        );
        assert(result.ok);
        assert.equal(
          await db.passwordReset.count({ where: { userId: user.id } }),
          0,
        );
        await db.mailConfiguration.deleteMany({});
        await assert.rejects(
          requestPasswordReset({ email: user.email }, adapter),
          /configurar/,
        );
        await assert.rejects(
          requestPasswordReset(
            { email: `missing-${tag}@example.test` },
            adapter,
          ),
          /configurar/,
        );
      },
    );
  } finally {
    if (origin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = origin;
    await db.mailConfiguration.deleteMany({});
    if (previous) await db.mailConfiguration.create({ data: previous });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.passwordReset.deleteMany({ where: { userId: { in: ids } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.rateLimit.deleteMany({
      where: {
        key: {
          in: [
            ...ids.flatMap((id) => [
              `recovery-mail:${id}`,
              `recovery-issue:${id}`,
            ]),
            ...users.map((u) => `recovery-request:${tokenHash(u.email)}`),
            `recovery-request:${tokenHash(`missing-${tag}@example.test`)}`,
          ],
        },
      },
    });
    await db.$disconnect();
  }
});
