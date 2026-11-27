import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import argon2 from "argon2";
import { NextRequest } from "next/server";
import { changePassword } from "../lib/accounts";
import { db } from "../lib/db";
import { userManagement } from "../lib/user-management";

test("Superadmin can change their own password and authorized local accounts only", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /127\.0\.0\.1:5432\/generator_latest_review_qa$/);
  const initialPassword = "Local-only-test-123!";
  const newPassword = "New-local-test-456!";
  const hash = await argon2.hash(initialPassword);
  try {
    const create = (role: "SUPERADMIN" | "OWNER" | "SUPERVISOR" | "ADVISOR" | "OBSERVER" | "USER" | "ADMIN", managed = false) =>
      db.user.create({ data: {
        role, name: role, email: randomUUID() + "@example.test", passwordHash: hash,
        status: "APPROVED", pulpoManagedLogin: managed,
      } });
    const superadmin = await create("SUPERADMIN");
    await changePassword(superadmin, { currentPassword: initialPassword, newPassword });
    assert(await argon2.verify((await db.user.findUniqueOrThrow({ where: { id: superadmin.id } })).passwordHash, newPassword));

    const setPassword = (target: { id: string }, issuer = superadmin) =>
      userManagement(new NextRequest("http://localhost/api/users", { method: "POST" }),
        ["users", target.id, "password"], issuer, async () => ({ newPassword }),
      );

    for (const role of ["USER", "OBSERVER", "ADVISOR", "SUPERVISOR"] as const) {
      const target = await create(role);
      const session = await db.session.create({ data: { id: randomUUID(), userId: target.id, expiresAt: new Date(Date.now() + 60000) } });
      assert.equal((await setPassword(target)).status, 200);
      assert(await argon2.verify((await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash, newPassword));
      assert.equal(await db.session.findUnique({ where: { id: session.id } }), null);
    }
    for (const role of ["OWNER", "SUPERADMIN", "ADMIN"] as const)
      await assert.rejects(setPassword(await create(role)), { status: 403 });
    await assert.rejects(setPassword(await create("USER"), await create("ADMIN")), { status: 403 });
    const managed = await create("ADVISOR", true);
    await assert.rejects(setPassword(managed), { status: 409 });
    await assert.rejects(changePassword(managed, { currentPassword: initialPassword, newPassword }), { status: 409 });
  } finally {
    await db.$disconnect();
  }
});
