import { createHmac, timingSafeEqual } from "node:crypto";

const workspaceViews = ["products", "inventory", "advisors", "metaads", "performance", "projects", "library", "trash", "courses-ai", "fixed-costs", "ai", "usage", "account", "website", "visual-audit", "users", "statistics", "plans"] as const;
type WorkspaceView = (typeof workspaceViews)[number];

type Assertion = {
  sub: string;
  email: string;
  nonce: string;
  exp: number;
  page: "home" | "plans";
  view?: WorkspaceView;
  panel?: "team" | "advisor" | "products";
  aiTab?: "connections" | "posters" | "courses";
  embedded?: true;
  provision?: true;
  name?: string;
};

export function verifyPulpoAssertion(token: string, key: string, now = Math.floor(Date.now() / 1000), purpose: "sso" | "provision" = "sso"): Assertion | null {
  if (!/^[a-f\d]{64}$/i.test(key) || token.length > 1200) return null;
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const [, payload, signature] = match;
  const expected = createHmac("sha256", Buffer.from(key, "hex"))
    .update(`pulpo-${purpose}:v1:` + payload).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims?.aud !== "pulpo-generador" ||
        typeof claims.sub !== "string" || !/^[a-f\d-]{36}$/i.test(claims.sub) ||
        typeof claims.email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(claims.email) ||
        typeof claims.nonce !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(claims.nonce) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp > now + 35 ||
        (claims.page !== "home" && claims.page !== "plans") ||
        (claims.view !== undefined && (claims.page !== "home" || !workspaceViews.includes(claims.view))) ||
        (claims.panel !== undefined && (claims.view !== "performance" || !["team", "advisor", "products"].includes(claims.panel))) ||
        (claims.aiTab !== undefined && (claims.view !== "ai" || !["connections", "posters", "courses"].includes(claims.aiTab))) ||
        (claims.embedded !== undefined && (claims.embedded !== true || claims.page !== "home" ||
          !["metaads", "advisors", "products"].includes(claims.view) || claims.panel !== undefined)) ||
        (claims.provision !== undefined && (
          claims.provision !== true || typeof claims.name !== "string" ||
          !claims.name.trim() || claims.name.length > 100
        ))) return null;
    return claims;
  } catch {
    return null;
  }
}

export function linkedGeneratorUser(links: string, assertion: Pick<Assertion, "sub" | "email">) {
  try {
    const directory = JSON.parse(links);
    const link = Object.hasOwn(directory, assertion.sub) ? directory[assertion.sub] : null;
    return typeof link?.id === "string" && link.id && link.email === assertion.email ? link.id as string : null;
  } catch {
    return null;
  }
}


export function linkedMessagingUser(user: { id: string; email: string; pulpoUserId: string | null }) {
  if (user.pulpoUserId) return user.pulpoUserId;
  const links = process.env.PULPO_GENERATOR_LINKS || "";
  try {
    const mapping = JSON.parse(links);
    const candidates = Object.keys(mapping).filter((sub) => linkedGeneratorUser(links, {
      sub, email: user.email.trim().toLowerCase(),
    }) === user.id);
    return candidates.length === 1 ? candidates[0] : null;
  } catch { return null; }
}
