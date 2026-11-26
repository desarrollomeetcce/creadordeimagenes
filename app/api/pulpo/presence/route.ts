import { createHmac } from "node:crypto";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { linkedMessagingUser } from "@/lib/pulpo-sso";
import { managesUsers } from "@/lib/roles";

const headers = { "Cache-Control": "no-store" };
const fail = (status: number) => new Response(null, { status, headers });

async function relay(sub: string, fields: { action: "list" } | { action: "pulse"; device: "mobile" | "desktop" }) {
  const key = process.env.PULPO_GENERATOR_SSO_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key)) return null;
  const payload = Buffer.from(JSON.stringify({
    sub, ...fields, exp: Math.floor(Date.now() / 1000) + 30,
  })).toString("base64url");
  const signature = createHmac("sha256", Buffer.from(key, "hex"))
    .update("pulpo-presence:v1:" + payload).digest("base64url");
  return fetch("https://pulpo.agenciamagneto.org/api/integrations/generator-presence", {
    method: "POST", headers: { Authorization: "Pulpo " + payload + "." + signature },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3500),
  });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail(403);
  const user = await actor().catch(() => null);
  if (!user) return fail(401);
  const sub = linkedMessagingUser(user);
  if (!sub) return fail(204);
  const mobile = request.headers.get("sec-ch-ua-mobile") === "?1" ||
    /Android|iPhone|iPad|Mobile/i.test(request.headers.get("user-agent") ?? "");
  try {
    const response = await relay(sub, { action: "pulse", device: mobile ? "mobile" : "desktop" });
    return fail(response?.ok ? 204 : 503);
  } catch {
    return fail(503);
  }
}

export async function GET() {
  const viewer = await actor().catch(() => null);
  if (!viewer || !managesUsers(viewer.role)) return fail(403);
  const sub = linkedMessagingUser(viewer);
  if (!sub) return fail(503);
  try {
    const response = await relay(sub, { action: "list" });
    if (!response?.ok) return fail(503);
    const payload = await response.json() as { users: {
      id: string; desktop: boolean; mobile: boolean; generatorDesktop: boolean; generatorMobile: boolean;
    }[] };
    const byId = new Map(payload.users.map(({ id, ...value }) => [id, value]));
    const eligible = await db.user.findMany({
      where: { archivedAt: null, status: "APPROVED", ...(viewer.role === "OWNER" ? {} : { role: { in: ["USER", "OBSERVER"] } }) },
      select: { id: true, email: true, pulpoUserId: true },
    });
    return Response.json({ users: eligible.flatMap((account) => {
      const linked = linkedMessagingUser(account);
      const value = linked ? byId.get(linked) : undefined;
      return value ? [{ id: account.id, ...value }] : [];
    }) }, { headers });
  } catch {
    return fail(503);
  }
}
