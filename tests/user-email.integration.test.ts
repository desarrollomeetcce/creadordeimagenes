import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { userManagement } from "../lib/user-management";

test("Cambiar correo conserva identidad y permisos, evita duplicados y revoca accesos anteriores", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID(),
    password = "Prueba-segura-0123456789",
    hash = await argon2.hash(password);
  const users = await Promise.all(
    (["OWNER", "ADMIN", "USER", "OBSERVER"] as const).map((role) =>
      db.user.create({
        data: {
          name: "QA correo " + role,
          email: `${role.toLowerCase()}-${tag}@example.test`,
          passwordHash: hash,
          role,
          status: "APPROVED",
        },
      }),
    ),
  );
  const [owner, admin, user, observer] = users,
    ids = users.map((u) => u.id),
    expiresAt = new Date(Date.now() + 3600000);
  const call = (
    actor: { id: string; role: string },
    target: string,
    data: unknown,
  ) =>
    userManagement(
      new NextRequest("http://localhost/api/users/" + target + "/email", {
        method: "PATCH",
      }),
      ["users", target, "email"],
      actor,
      async () => data,
    );
  const payload = (email: string, expectedEmail = user.email) => ({
    email,
    expectedEmail,
    currentPassword: password,
  });
  const fails = (promise: Promise<unknown>, status: number) =>
    assert.rejects(promise, (e: any) => e.status === status);
  try {
    await t.test(
      "La contraseña del administrador y su autorización vigente son obligatorias",
      async () => {
        await fails(call(user, user.id, payload("new@example.test")), 403);
        await fails(call(observer, user.id, payload("new@example.test")), 403);
        await fails(
          call(admin, owner.id, payload("new@example.test", owner.email)),
          403,
        );
        await fails(
          call(owner, user.id, {
            ...payload("new@example.test"),
            currentPassword: "incorrecta-123456",
          }),
          403,
        );
        await db.user.update({
          where: { id: admin.id },
          data: { status: "SUSPENDED" },
        });
        await fails(call(admin, user.id, payload("new@example.test")), 403);
        await db.user.update({
          where: { id: admin.id },
          data: { status: "APPROVED" },
        });
      },
    );
    await t.test(
      "Correo inválido, repetido sin distinguir mayúsculas y edición obsoleta se rechazan",
      async () => {
        await assert.rejects(call(owner, user.id, payload("sin correo")));
        await fails(
          call(owner, user.id, payload(owner.email.toUpperCase())),
          409,
        );
        await fails(
          call(
            owner,
            user.id,
            payload(`new-${tag}@example.test`, "anterior@example.test"),
          ),
          409,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: user.id } })).email,
          user.email,
        );
      },
    );
    await t.test(
      "ADMIN edita cuentas permitidas; normaliza correo y elimina sesiones/recuperaciones",
      async () => {
        await db.session.create({
          data: { id: randomUUID(), userId: user.id, expiresAt },
        });
        await db.passwordReset.create({
          data: { tokenHash: randomUUID(), userId: user.id, expiresAt },
        });
        await db.ownerRecovery.create({
          data: { tokenHash: randomUUID(), userId: user.id, expiresAt },
        });
        const email = `Actualizado-${tag}@Example.Test`,
          result = await call(admin, user.id, payload("  " + email + "  "));
        assert.deepEqual(await result.json(), {
          ok: true,
          closesOwnSession: false,
        });
        const updated = await db.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        assert.equal(updated.email, email.toLowerCase());
        assert.equal(updated.role, user.role);
        assert.equal(updated.passwordHash, hash);
        assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
        assert.equal(
          await db.passwordReset.count({ where: { userId: user.id } }),
          0,
        );
        assert.equal(
          await db.ownerRecovery.count({ where: { userId: user.id } }),
          0,
        );
      },
    );
    await t.test(
      "Correo sin cambios no invalida sesiones; OWNER puede cambiar su propio correo",
      async () => {
        const sid = randomUUID();
        await db.session.create({
          data: { id: sid, userId: owner.id, expiresAt },
        });
        assert.deepEqual(
          await (
            await call(owner, owner.id, payload(owner.email, owner.email))
          ).json(),
          { ok: true, closesOwnSession: false },
        );
        assert(await db.session.findUnique({ where: { id: sid } }));
        const email = `owner-editado-${tag}@example.test`;
        assert.deepEqual(
          await (
            await call(owner, owner.id, payload(email, owner.email))
          ).json(),
          { ok: true, closesOwnSession: true },
        );
        assert.equal(
          await db.session.count({ where: { userId: owner.id } }),
          0,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).email,
          email,
        );
      },
    );
  } finally {
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.passwordReset.deleteMany({ where: { userId: { in: ids } } });
    await db.ownerRecovery.deleteMany({ where: { userId: { in: ids } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.rateLimit.deleteMany({
      where: { key: { in: ids.map((id) => `account-email:${id}`) } },
    });
    await db.$disconnect();
  }
});
