import { recordActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { linkedGeneratorUser, verifyPulpoAssertion } from "@/lib/pulpo-sso";
import { createManagedGeneratorUser } from "@/lib/pulpo-provision";

const reply = (status: number, data: { state: string; generatorRole?: string }) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const grant = verifyPulpoAssertion(
    authorization.startsWith("Bearer ") ? authorization.slice(7) : "",
    process.env.PULPO_GENERATOR_SSO_KEY ?? "",
    undefined,
    "provision",
  );
  if (!grant?.provision || grant.page !== "home" || grant.view || grant.embedded)
    return reply(403, { state: "unavailable" });

  const links = process.env.PULPO_GENERATOR_LINKS || "";
  const result = await db.$transaction(async (tx) => {
    const sync = grant.roleSync;
    if (sync || grant.identitySync) {
      // Serialize with local role changes and preserve the last active Owner.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
    }
    if (Date.now() >= grant.exp * 1000) return { state: "role-denied" };
    async function resolveAccount(identity: { sub: string; email: string }) {
      const legacyId = linkedGeneratorUser(links, identity);
      return tx.user.findFirst({
        where: {
          status: "APPROVED",
          archivedAt: null,
          email: { equals: identity.email, mode: "insensitive" },
          OR: [
            { pulpoUserId: identity.sub },
            ...(legacyId ? [{ id: legacyId, pulpoUserId: null }] : []),
          ],
        },
        select: { id: true, role: true },
      });
    }

    let target = await resolveAccount(grant);
    if (!target && grant.identitySync) {
      const identity = grant.identitySync;
      const existing = await tx.user.findFirst({ where: {
        email: { equals: grant.email, mode: "insensitive" }, status: "APPROVED", archivedAt: null,
      }, select: { id: true, pulpoUserId: true } });
      if (existing && !existing.pulpoUserId) {
        const issuer = await resolveAccount({ sub: identity.issuerId, email: identity.issuerEmail });
        if (issuer?.role !== "OWNER" || Date.now() >= grant.exp * 1000) return { state: "role-denied" };
        const prefix = "pulpo-identity-sync:";
        await tx.rateLimit.deleteMany({ where: { key: { startsWith: prefix }, expiresAt: { lt: new Date() } } });
        const receipt = await tx.rateLimit.createMany({ data: [{
          key: prefix + grant.nonce, count: 1, expiresAt: new Date(grant.exp * 1000),
        }], skipDuplicates: true });
        if (!receipt.count) return { state: "verify" };
        await tx.user.updateMany({ where: { id: existing.id, pulpoUserId: null }, data: { pulpoUserId: grant.sub } });
        await recordActivity(tx, { data: {
          actorId: issuer.id, action: "IDENTIDAD_PULPO_VINCULADA", resourceId: existing.id,
          detail: { pulpoUserId: grant.sub },
        } });
        target = await resolveAccount(grant);
      }
    }
    if (!target && !sync) {
      const occupied = await tx.user.findFirst({
        where: { OR: [
          { pulpoUserId: grant.sub },
          { email: { equals: grant.email, mode: "insensitive" } },
        ] },
        select: { id: true },
      });
      if (occupied || linkedGeneratorUser(links, grant)) return { state: "verify" };
      const confirmedOwner = grant.identitySync && await resolveAccount({
        sub: grant.identitySync.issuerId, email: grant.identitySync.issuerEmail,
      });
      await createManagedGeneratorUser(tx, { ...grant, name: grant.name!.trim() },
        confirmedOwner?.role === "OWNER" ? grant.sharedRole : undefined);
      target = await resolveAccount(grant);
    }
    if (!target) return { state: "verify" };
    const sharedRole = grant.sharedRole;
    if (!sharedRole || sharedRole === target.role) return { state: "linked" };

    const conflict = { state: "role-conflict", generatorRole: target.role };
    if (!sync) return conflict;
    const issuer = await resolveAccount({ sub: sync.issuerId, email: sync.issuerEmail });
    if (issuer?.role !== "OWNER" || Date.now() >= grant.exp * 1000)
      return { state: "role-denied" };
    if (sync.expected !== target.role) return conflict;
    if (target.role === "OWNER" && sharedRole !== "OWNER" &&
        await tx.user.count({ where: { role: "OWNER", status: "APPROVED", archivedAt: null } }) <= 1)
      return { state: "last-owner" };

    // Consume only role-changing assertions. Retries that already match are reads.
    const noncePrefix = "pulpo-role-sync:";
    const now = new Date();
    if (grant.exp * 1000 <= now.getTime()) return { state: "role-denied" };
    await tx.rateLimit.deleteMany({
      where: { key: { startsWith: noncePrefix }, expiresAt: { lt: now } },
    });
    const nonce = await tx.rateLimit.createMany({
      data: [{ key: noncePrefix + grant.nonce, count: 1, expiresAt: new Date(grant.exp * 1000) }],
      skipDuplicates: true,
    });
    if (!nonce.count) return { state: "role-denied" };

    await tx.user.update({
      where: { id: target.id },
      data: { role: sharedRole, ...(sharedRole === "OWNER" ? { aiAccessEnabled: true } : {}) },
    });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.passwordReset.deleteMany({ where: { userId: target.id } });
    await tx.ownerRecovery.deleteMany({ where: { userId: target.id } });
    await recordActivity(tx, {
      data: {
        actorId: issuer.id,
        action: "ROL_PULPO_SINCRONIZADO",
        resourceId: target.id,
        detail: { previous: target.role, role: sharedRole },
      },
    });
    return { state: "linked" };
  });
  return reply(200, result);
}
