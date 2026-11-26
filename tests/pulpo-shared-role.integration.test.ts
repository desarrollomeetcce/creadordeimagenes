import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { POST } from "../app/api/pulpo/provision-user/route";
import { db } from "../lib/db";
import { performanceSettings, savePortalLink } from "../lib/meta-ads/advisor-performance";
import { syncMessagingUser, syncMessagingRole } from "../lib/pulpo-messaging-users";
import { verifyDirectory } from "../lib/pulpo-directory-token";

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
  const send = async (account: typeof owner, sharedRole: string, roleSync?: { issuerId: string; issuerEmail: string; expected: string }, identitySync?: { issuerId: string; issuerEmail: string }) => {
    const payload = Buffer.from(JSON.stringify({
      ...account, sharedRole, roleSync, identitySync, aud: "pulpo-generador",
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
    const initialLink = await savePortalLink(actor, { advisorId: person.id, userId: account.id, revision: 0 });
    assert.equal(initialLink.userId, account.id);

    // An advisor record describes a person; linking it must not change their account role.
    for (const role of ["OWNER", "SUPERADMIN", "ADMIN", "SUPERVISOR", "ADVISOR", "USER", "OBSERVER"] as const) {
      const candidate = await db.user.create({ data: {
        email: randomUUID() + "@example.test", name: role, passwordHash: "fixture",
        role, status: "APPROVED",
      } });
      const advisorRecord = await db.metaAdvisor.create({ data: { name: role, sheetId: sheet.id } });
      assert((await performanceSettings(actor)).accounts.some((entry) => entry.id === candidate.id), role);
      const saved = await savePortalLink(actor, { advisorId: advisorRecord.id, userId: candidate.id, revision: 0 });
      assert.equal(saved.userId, candidate.id);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: candidate.id } })).role, role);
      await assert.rejects(savePortalLink(actor, { advisorId: person.id, userId: candidate.id, revision: initialLink.revision }), /otro asesor/);
      await assert.rejects(savePortalLink(actor, { advisorId: advisorRecord.id, userId: null, revision: saved.revision + 1 }), /vínculo cambió/);
    }
    for (const status of ["PENDING", "REJECTED", "SUSPENDED"] as const) {
      const unavailable = await db.user.create({ data: {
        email: randomUUID() + "@example.test", name: status, passwordHash: "fixture",
        role: "ADMIN", status,
      } });
      assert(!(await performanceSettings(actor)).accounts.some((entry) => entry.id === unavailable.id));
      await assert.rejects(savePortalLink(actor, { advisorId: person.id, userId: unavailable.id, revision: initialLink.revision }), /cuenta aprobada/);
    }
    await assert.rejects(performanceSettings({ id: account.id, role: "ADVISOR" }), /Solo OWNER o Supervisor/);

    const nativeIdentity = identity();
    const native = await db.user.create({ data: {
      email: nativeIdentity.email, name: "Superadmin nativa", role: "SUPERADMIN", passwordHash: "unchanged", status: "APPROVED",
    } });
    assert.deepEqual(await send(nativeIdentity, "SUPERADMIN", undefined, { issuerId: target.sub, issuerEmail: target.email }), { state: "role-denied" });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: native.id } })).pulpoUserId, null);
    assert.deepEqual(await send(nativeIdentity, "SUPERADMIN", undefined, { issuerId: owner.sub, issuerEmail: owner.email }), { state: "linked" });
    const reconciled = await db.user.findUniqueOrThrow({ where: { id: native.id } });
    assert.equal(reconciled.pulpoUserId, nativeIdentity.sub);
    assert.equal(reconciled.passwordHash, "unchanged");
    assert.equal(reconciled.role, "SUPERADMIN");
    const elevated = identity();
    assert.deepEqual(await send(elevated, "SUPERADMIN", undefined, { issuerId: owner.sub, issuerEmail: owner.email }), { state: "linked" });
    assert.equal((await db.user.findUniqueOrThrow({ where: { email: elevated.email } })).role, "SUPERADMIN");

    const local = await db.user.create({ data: {
      email: randomUUID() + "@example.test", name: "Creada en Generador", role: "USER", passwordHash: "native", status: "APPROVED",
    } });
    const messagingId = randomUUID();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        const grant = verifyDirectory(new Headers(init?.headers).get("authorization"));
        assert(grant);
        assert.equal(grant.issuerId, owner.sub);
        assert.equal(grant.id, local.id);
        if (String(url).endsWith("generator-user-roles")) {
          assert.equal(grant.operation, "role");
          assert.equal(grant.expectedRole, "user");
          assert.equal(grant.role, "superadmin");
          assert.equal(grant.messagingId, messagingId);
        } else {
          assert.match(grant.credentialHash!, /^scrypt-v1:[a-f\d]{32}:[a-f\d]{128}$/);
        }
        return Response.json({ state: "linked", id: messagingId, role: "user" });
      };
      assert.deepEqual(await syncMessagingUser(issuer.id, local.id, "Fixture-password-123!"), { state: "linked" });
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: local.id } })).pulpoUserId, messagingId);
      assert.deepEqual(await syncMessagingRole(issuer.id, local.id, "SUPERADMIN", "USER"), { state: "linked" });
      assert.deepEqual(await syncMessagingRole(member.id, local.id, "OWNER", "USER"), { state: "role-denied" });
      globalThis.fetch = async () => { throw Error("Unavailable"); };
      assert.deepEqual(await syncMessagingRole(issuer.id, local.id, "SUPERADMIN", "USER"), { state: "pending" });
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: local.id } })).role, "USER");
    } finally { globalThis.fetch = originalFetch; }
  } finally {
    await db.$disconnect();
  }
});
