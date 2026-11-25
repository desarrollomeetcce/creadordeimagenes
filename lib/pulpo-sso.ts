import { createHmac, timingSafeEqual } from "node:crypto";

type Assertion = {
  sub: string;
  email: string;
  nonce: string;
  exp: number;
  page: "home" | "plans";
  provision?: true;
  name?: string;
};

export function verifyPulpoAssertion(token: string, key: string, now = Math.floor(Date.now() / 1000)): Assertion | null {
  if (!/^[a-f\d]{64}$/i.test(key) || token.length > 1200) return null;
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const [, payload, signature] = match;
  const expected = createHmac("sha256", Buffer.from(key, "hex"))
    .update("pulpo-sso:v1:" + payload).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims?.aud !== "pulpo-generador" ||
        typeof claims.sub !== "string" || !/^[a-f\d-]{36}$/i.test(claims.sub) ||
        typeof claims.email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(claims.email) ||
        typeof claims.nonce !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(claims.nonce) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp > now + 35 ||
        (claims.page !== "home" && claims.page !== "plans") ||
        (claims.provision !== undefined && (
          claims.provision !== true || typeof claims.name !== "string" ||
          !claims.name.trim() || claims.name.length > 100
        ))) return null;
    return claims;
  } catch {
    return null;
  }
}

export function linkedGeneratorUser(links: string, assertion: Assertion) {
  try {
    const directory = JSON.parse(links);
    const link = Object.hasOwn(directory, assertion.sub) ? directory[assertion.sub] : null;
    return typeof link?.id === "string" && link.id && link.email === assertion.email ? link.id as string : null;
  } catch {
    return null;
  }
}
