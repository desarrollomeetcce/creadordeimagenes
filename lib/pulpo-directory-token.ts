import { createHmac, timingSafeEqual } from "node:crypto";

export type DirectoryGrant = {
  issuerId: string; issuerEmail: string; issuerRole: string;
  id: string; email: string; name: string; role: string;
  credentialHash?: string; nonce: string; exp: number;
  operation?: "role"; messagingId?: string; expectedRole?: string;
};
const roles = ["owner", "superadmin", "admin", "supervisor", "advisor", "user", "observer"];
function key() {
  const value = process.env.PULPO_GENERATOR_SSO_KEY ?? "";
  return /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, "hex") : null;
}
function digest(secret: Buffer, payload: string) {
  return createHmac("sha256", secret).update("pulpo-directory:v1:" + payload).digest("base64url");
}
export function signDirectory(grant: DirectoryGrant) {
  const secret = key();
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return "Bearer " + payload + "." + digest(secret, payload);
}
export function verifyDirectory(header: string | null): DirectoryGrant | null {
  const secret = key();
  const match = header && header.length < 4096 && /^Bearer ([\w-]+)\.([\w-]{43})$/.exec(header);
  if (!secret || !match || !timingSafeEqual(Buffer.from(match[2]), Buffer.from(digest(secret, match[1])))) return null;
  try {
    const grant = JSON.parse(Buffer.from(match[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    if (grant.operation !== undefined && (grant.operation !== "role" || grant.issuerRole !== "owner" ||
        typeof grant.messagingId !== "string" || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(grant.messagingId) ||
        !roles.includes(grant.expectedRole) || grant.credentialHash !== undefined)) return null;
    if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(grant.issuerId) ||
        typeof grant.issuerEmail !== "string" || !/^[^\s@]+@[^\s@]+$/.test(grant.issuerEmail) ||
        !["owner", "superadmin"].includes(grant.issuerRole) ||
        typeof grant.id !== "string" || !/^[\w-]{1,100}$/.test(grant.id) ||
        typeof grant.email !== "string" || !/^[a-z0-9][a-z0-9._@+-]{2,119}$/.test(grant.email) || !grant.email.includes("@") ||
        typeof grant.name !== "string" || !grant.name.trim() || grant.name.length > 100 ||
        !roles.includes(grant.role) || typeof grant.nonce !== "string" || !/^[\w-]{32}$/.test(grant.nonce) ||
        !Number.isSafeInteger(grant.exp) || grant.exp <= now || grant.exp > now + 35 ||
        (grant.credentialHash !== undefined && (typeof grant.credentialHash !== "string" ||
          !/^scrypt-v1:[a-f\d]{32}:[a-f\d]{128}$/.test(grant.credentialHash)))) return null;
    return grant;
  } catch { return null; }
}
