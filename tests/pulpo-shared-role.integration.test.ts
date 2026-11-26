import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { POST } from "../app/api/pulpo/provision-user/route";
import { db } from "../lib/db";
import { performanceSettings, savePortalLink } from "../lib/meta-ads/advisor-performance";

test("requires a linked Owner to reconcile roles and preserves module grants", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /127\.0\.0\.1:5432\/generator_shared_role_qa_\d+$/);
  const key = randomBytes(32).toString("hex");
  process.env.PULPO_GENERATOR_SSO_KEY = key;
  const identity = () => ({ sub: randomUUID(), email: randomUUID() + "@example.test" });
  const owner = identity();
  const target = identity();
  const observer = identity();
  const create = (account: typeof owner, role: "OWNER" | "USER") => db.user.create({
    data: { pulpoUserId: account.sub, email: account.email, name: "Fixture", passwordHash: "fixture", role, status: "APPROVED" },
  });
  const send = async (account: typeof owner, sharedRole: string, roleSync?: { issuerId: string; issuerEmail: string; expected: string }) => {
    const payload = Buffer.from(JSON.stringify({
      ...account, sharedRole, roleSync, aud: "pulpo-generador",
      exp: Math.floor(Date.now() / 1000) + 25, nonce: randomBytes(24).toString("base64url"),
      page: "home", provision: true, name: "Fixture",
    })).toString("base64url");
    const signature = createHmac("sha256", Buffer.from(key, "hex"))
      .update("pulpo-provision:v1:" + payload).digest("base64url");
    return (await POST(new Request("http://localhost/api/pulpo/provision-user", {
      method: "POST", headers: { authorization: `Bearer ${payload}.${signature}` },
    }))).json();
  };
  try {
    const issuer = await create(owner, "OWNER");
    const member = await create(target, "USER");
    await db.metaWorkspaceGrant.create({
      data: { userId: member.id, grantedById: issuer.id, permission: "EDIT" },
    });
    const confirmation = { issuerId: owner.sub, issuerEmail: owner.email, expected: "USER" };
    assert.deepEqual(await send(target, "SUPERADMIN"), { state: "role-conflict", generatorRole: "USER" });
    assert.deepEqual(await send(target, "SUPERADMIN", { ...confirmation, issuerId: randomUUID() }), { state: "role-denied" });
    assert.deepEqual(await send(target, "SUPERADMIN", { ...confirmation, expected: "ADMIN" }), { state: "role-conflict", generatorRole: "USER" });
    assert.deepEqual(await send(target, "SUPERADMIN", confirmation), { state: "linked" });
    assert.deepEqual(await send(target, "SUPERADMIN", confirmation), { state: "linked" });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: member.id } })).role, "SUPERADMIN");
    assert.equal((await db.metaWorkspaceGrant.findUniqueOrThrow({ where: { userId: member.id } })).permission, "EDIT");
    assert.deepEqual(await send(owner, "ADMIN", { ...confirmation, expected: "OWNER" }), { state: "last-owner" });
    assert.deepEqual(await send(observer, "OBSERVER"), { state: "linked" });
    assert.equal((await db.user.findUniqueOrThrow({ where: { email: observer.email } })).role, "OBSERVER");

    const advisor = identity();
    assert.deepEqual(await send(advisor, "ADVISOR"), { state: "linked" });
    const account = await db.user.findUniqueOrThrow({ where: { email: advisor.email } });
    const sheet = await db.metaEffectivenessSheet.create({ data: { kind: "ADVISORS", name: "Equipo de prueba" } });
    const person = await db.metaAdvisor.create({ data: { name: "Asesora de prueba", sheetId: sheet.id } });
    const actor = { id: issuer.id, role: issuer.role };
    assert((await performanceSettings(actor)).accounts.some((candidate) => candidate.id === account.id));
    assert.equal((await savePortalLink(actor, { advisorId: person.id, userId: account.id, revision: 0 })).userId, account.id);
  } finally {
    await db.$disconnect();
  }
});
