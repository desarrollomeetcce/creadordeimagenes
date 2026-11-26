import { randomBytes, scrypt } from "node:crypto";
import { db } from "./db";
import { canCreateUsers, canManageAccount } from "./roles";
import { linkedMessagingUser } from "./pulpo-sso";
import { signDirectory } from "./pulpo-directory-token";

export type MessagingSync = { state: "linked" | "role-conflict" | "verify" | "pending" | "unconfigured" | "role-denied" };

export async function syncMessagingRole(actorId: string, userId: string, role: string, expectedRole: string): Promise<MessagingSync> {
  const [issuer, account] = await Promise.all([
    db.user.findUnique({ where: { id: actorId } }), db.user.findUnique({ where: { id: userId } }),
  ]);
  if (!issuer || issuer.role !== "OWNER" || issuer.status !== "APPROVED" || issuer.archivedAt ||
      !account || account.role !== expectedRole || account.status !== "APPROVED" || account.archivedAt)
    return { state: "role-denied" };
  const issuerId = linkedMessagingUser(issuer), messagingId = linkedMessagingUser(account);
  if (!issuerId || !messagingId) return { state: "verify" };
  const token = signDirectory({
    issuerId, issuerEmail: issuer.email.toLowerCase(), issuerRole: "owner",
    id: account.id, email: account.email.toLowerCase(), name: account.name,
    role: role.toLowerCase(), expectedRole: expectedRole.toLowerCase(), messagingId, operation: "role",
    nonce: randomBytes(24).toString("base64url"), exp: Math.floor(Date.now() / 1000) + 30,
  });
  if (!token) return { state: "unconfigured" };
  try {
    const response = await fetch("https://pulpo.agenciamagneto.org/api/integrations/generator-user-roles", {
      method: "POST", headers: { Authorization: token }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    return { state: response.ok && result.state === "linked" ? "linked" : result.state === "role-denied" ? "role-denied" : "role-conflict" };
  } catch { return { state: "pending" }; }
}

export async function syncMessagingUser(actorId: string, userId: string, initialPassword?: string): Promise<MessagingSync> {
  const [issuer, account] = await Promise.all([
    db.user.findUnique({ where: { id: actorId } }), db.user.findUnique({ where: { id: userId } }),
  ]);
  if (!issuer || issuer.status !== "APPROVED" || issuer.archivedAt || !canCreateUsers(issuer.role) ||
      !account || account.status !== "APPROVED" || account.archivedAt || !canManageAccount(issuer.role, account.role))
    return { state: "role-denied" };
  const issuerId = linkedMessagingUser(issuer);
  if (!issuerId) return { state: "verify" };
  const grant = {
    issuerId, issuerEmail: issuer.email.toLowerCase(), issuerRole: issuer.role.toLowerCase(),
    id: account.id, email: account.email.toLowerCase(), name: account.name, role: account.role.toLowerCase(),
    nonce: randomBytes(24).toString("base64url"), exp: Math.floor(Date.now() / 1000) + 30,
  };
  if (!signDirectory(grant)) return { state: "unconfigured" };
  let credentialHash: string | undefined;
  if (initialPassword) {
    const salt = randomBytes(16).toString("hex");
    const hash = await new Promise<Buffer>((resolve, reject) => scrypt(initialPassword, salt, 64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, value) => error ? reject(error) : resolve(value)));
    credentialHash = `scrypt-v1:${salt}:${hash.toString("hex")}`;
  }
  try {
    const response = await fetch("https://pulpo.agenciamagneto.org/api/integrations/generator-users", {
      method: "POST", headers: { Authorization: signDirectory({ ...grant, credentialHash })! },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { state: response.status === 403 ? "role-denied" : "pending" };
    const result = await response.json();
    if (!["linked", "role-conflict"].includes(result.state) || typeof result.id !== "string" ||
        !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(result.id))
      return { state: result.state === "verify" ? "verify" : "pending" };
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
      const current = await tx.user.findUnique({ where: { id: actorId } });
      if (!current || current.role !== issuer.role || current.status !== "APPROVED" || current.archivedAt)
        return { state: "role-denied" } as MessagingSync;
      const updated = await tx.user.updateMany({ where: {
        id: account.id, email: account.email, role: account.role, status: "APPROVED", archivedAt: null,
        OR: [{ pulpoUserId: null }, { pulpoUserId: result.id }],
      }, data: { pulpoUserId: result.id } });
      return { state: updated.count ? result.state : "verify" } as MessagingSync;
    });
  } catch { return { state: "pending" }; }
}
