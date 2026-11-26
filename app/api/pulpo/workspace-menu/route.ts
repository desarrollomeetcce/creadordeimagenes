import { fixedCostNavigationAccess } from "@/lib/fixed-cost-navigation-access";
import { financialNavigationAccess } from "@/lib/meta-ads/financial-navigation-access";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { availableGeneratorModules } from "@/lib/pulpo-generator-modules";
import { linkedGeneratorUser, linkedMessagingUser } from "@/lib/pulpo-sso";
import { signMenu, verifyMenu, requestMove } from "@/lib/pulpo-menu-token";
import type { Move } from "@/lib/pulpo-menu-model";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

async function messaging(move?: Move, layoutOnly = false) {
  const user = await actor().catch(() => null);
  if (!user) return json({}, 401);
  const email = user.email.trim().toLowerCase();
  const id = linkedMessagingUser(user);
  const token = id && signMenu("preferences", id, email, move);
  if (!token) return json({}, 403);
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
    if (!response.ok) return json({}, 403);
    const snapshot = await response.json();
    return json(layoutOnly ? { layout: snapshot.layout } : snapshot);
  } catch {
    return json({}, 502);
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
      select: {
        id: true,
        role: true,
        aiAccessEnabled: true,
        advisorPortal: { select: { advisorId: true } },
        metaWorkspaceGrant: { select: { userId: true } },
      },
    });
    if (!user) return json({}, 403);
    const [fixedCostsShared, financialAccess] = await Promise.all([
      fixedCostNavigationAccess(user.id, user.role),
      financialNavigationAccess(user.id, user.role),
    ]);
    return json({
      modules: availableGeneratorModules({
        ...user,
        advisorLinked: !!user.advisorPortal,
        fixedCostsShared,
        metaAdsShared: !!user.metaWorkspaceGrant,
        ...financialAccess,
      }),
    });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({}, 403);
  const move = await requestMove(request);
  return move ? messaging(move) : json({}, 400);
}
