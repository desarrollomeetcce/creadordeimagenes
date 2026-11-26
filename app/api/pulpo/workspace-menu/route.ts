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

async function messaging(move?: Move) {
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
    return response.ok ? json(await response.json()) : json({}, 403);
  } catch {
    return json({}, 502);
  }
}

export async function GET() {
  return messaging();
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
        fixedCostGrant: { select: { userId: true } },
        metaWorkspaceGrant: { select: { userId: true } },
        _count: { select: { effectivenessGrants: true } },
      },
    });
    if (!user) return json({}, 403);
    return json({
      modules: availableGeneratorModules({
        ...user,
        advisorLinked: !!user.advisorPortal,
        fixedCostsShared: !!user.fixedCostGrant,
        metaAdsShared: !!user.metaWorkspaceGrant,
        effectivenessShared: user._count.effectivenessGrants > 0,
      }),
    });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({}, 403);
  const move = await requestMove(request);
  return move ? messaging(move) : json({}, 400);
}
