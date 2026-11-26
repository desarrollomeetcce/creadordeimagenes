import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { verifyMenu } from "@/lib/pulpo-menu-token";
import { linkedGeneratorUser } from "@/lib/pulpo-sso";
import { saveRoleMenu } from "@/lib/role-menu";

export async function POST(request: Request) {
  const grant = verifyMenu("role-menu-to-generator", request.headers.get("authorization"));
  if (!grant?.roleMenu) return new Response(null, { status: 403 });
  const legacy = linkedGeneratorUser(process.env.PULPO_GENERATOR_LINKS ?? "", grant);
  const issuer = await db.user.findFirst({ where: {
    role: "OWNER", status: "APPROVED", archivedAt: null, email: { equals: grant.email, mode: "insensitive" },
    OR: [{ pulpoUserId: grant.sub }, ...(legacy ? [{ id: legacy, pulpoUserId: null }] : [])],
  }, select: { id: true } });
  if (!issuer) return new Response(null, { status: 403 });
  const change = grant.roleMenu;
  try {
    await saveRoleMenu(issuer.id, change.role.toUpperCase() as Role, change.menu, change.expected);
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(null, { status: error instanceof AppError ? error.status : 503 });
  }
}
