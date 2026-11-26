import { fixedCostNavigationAccess } from "@/lib/fixed-cost-navigation-access";
import { financialNavigationAccess } from "@/lib/meta-ads/financial-navigation-access";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { availableGeneratorModules } from "@/lib/pulpo-generator-modules";
import { linkedGeneratorUser, linkedMessagingUser } from "@/lib/pulpo-sso";
import { signMenu, verifyMenu, requestMove } from "@/lib/pulpo-menu-token";
import type { Move } from "@/lib/pulpo-menu-model";
import { hasSharedCourses } from "@/lib/courses/sharing";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const messagingOrigin = "https://pulpo.agenciamagneto.org";
const sessionCors = {
  "Access-Control-Allow-Origin": messagingOrigin,
  "Access-Control-Allow-Credentials": "true",
  "Cache-Control": "private, no-store",
  Vary: "Origin",
};

export function OPTIONS(request: Request) {
  if (request.headers.get("origin") !== messagingOrigin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    ...sessionCors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Authorization",
  } });
}

const menuAccount = {
  id: true, role: true, aiAccessEnabled: true,
  advisorPortal: { select: { advisorId: true } },
  metaWorkspaceGrant: { select: { userId: true } },
} as const;

async function authorizedModules(user: { id: string; role: string; aiAccessEnabled: boolean; advisorPortal: unknown; metaWorkspaceGrant: unknown }) {
  const [fixedCostsShared, financialAccess, coursesShared] = await Promise.all([
    fixedCostNavigationAccess(user.id, user.role),
    financialNavigationAccess(user.id, user.role),
    hasSharedCourses(user),
  ]);
  return availableGeneratorModules({
    ...user, advisorLinked: Boolean(user.advisorPortal), metaAdsShared: Boolean(user.metaWorkspaceGrant),
    fixedCostsShared, coursesShared, ...financialAccess,
  });
}

async function messaging(move?: Move, layoutOnly = false) {
  const user = await actor().catch(() => null);
  if (!user) return json({}, 401);
  const email = user.email.trim().toLowerCase();
  const id = linkedMessagingUser(user);
  const token = id && signMenu("preferences", id, email, move);
  const fallback = (status: number) => {
    const sessionGrant = !layoutOnly && !move && signMenu("messaging-session-access", user.id, email, undefined, undefined, id ?? undefined);
    return sessionGrant ? json({ sessionGrant }) : json({}, status);
  };
  if (!token) return fallback(403);
  try {
    const response = await fetch(
      "https://pulpo.agenciamagneto.org/api/workspace-menu",
      {
        method: "POST",
        headers: { Authorization: token },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) return fallback(403);
    const snapshot = await response.json();
    return json(layoutOnly ? { layout: snapshot.layout } : snapshot);
  } catch {
    return fallback(502);
  }
}

export async function GET(request: Request) {
  return messaging(
    undefined,
    new URL(request.url).searchParams.get("layout") === "1",
  );
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    if (request.headers.get("origin") === messagingOrigin) {
      const grant = verifyMenu("session-access", authorization);
      const user = grant && await actor().catch(() => null);
      const linked = user && linkedMessagingUser(user);
      const expected = grant && linkedGeneratorUser(process.env.PULPO_GENERATOR_LINKS || "", grant);
      if (!grant || !user || user.email.trim().toLowerCase() !== grant.email ||
          (linked && linked !== grant.sub) || (expected && expected !== user.id))
        return Response.json({}, { status: 403, headers: sessionCors });
      const account = await db.user.findFirst({
        where: { id: user.id, email: user.email, pulpoUserId: user.pulpoUserId, status: "APPROVED", archivedAt: null },
        select: menuAccount,
      });
      if (!account) return Response.json({}, { status: 403, headers: sessionCors });
      return Response.json({ modules: await authorizedModules(account) }, { headers: sessionCors });
    }
    const grant = verifyMenu("access", authorization);
    if (!grant) return json({}, 403);
    const linked = linkedGeneratorUser(
      process.env.PULPO_GENERATOR_LINKS || "",
      grant,
    );
    const user = await db.user.findFirst({
      where: {
        status: "APPROVED",
        archivedAt: null,
        email: { equals: grant.email, mode: "insensitive" },
        OR: [
          { pulpoUserId: grant.sub },
          ...(linked ? [{ id: linked, pulpoUserId: null }] : []),
        ],
      },
      select: menuAccount,
    });
    if (!user) return json({}, 403);
    return json({ modules: await authorizedModules(user) });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({}, 403);
  const move = await requestMove(request);
  return move ? messaging(move) : json({}, 400);
}
