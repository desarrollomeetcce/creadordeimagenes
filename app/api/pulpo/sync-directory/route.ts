import { db } from "@/lib/db";
import { verifyMenu } from "@/lib/pulpo-menu-token";
import { linkedGeneratorUser } from "@/lib/pulpo-sso";
import { importGeneratorUsersIntoMessaging } from "@/lib/pulpo-messaging-users";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const grant = verifyMenu("pull-generator-users", request.headers.get("authorization"));
  if (!grant?.nonce) return reply({ state: "denied" }, 403);
  const legacy = linkedGeneratorUser(process.env.PULPO_GENERATOR_LINKS ?? "", grant);
  const issuer = await db.$transaction(async (tx) => {
    const owner = await tx.user.findFirst({
      where: {
        role: "OWNER", status: "APPROVED", archivedAt: null,
        email: { equals: grant.email, mode: "insensitive" },
        OR: [{ pulpoUserId: grant.sub }, ...(legacy ? [{ id: legacy, pulpoUserId: null }] : [])],
      }, select: { id: true },
    });
    if (!owner || Date.now() >= grant.exp * 1000) return null;
    await tx.rateLimit.deleteMany({ where: { key: { startsWith: "sync-directory:" }, expiresAt: { lte: new Date() } } });
    const receipt = await tx.rateLimit.createMany({ data: {
      key: "sync-directory:" + grant.nonce, count: 1, expiresAt: new Date(grant.exp * 1000),
    }, skipDuplicates: true });
    return receipt.count ? owner : null;
  });
  if (!issuer) return reply({ state: "denied" }, 403);
  return reply(await importGeneratorUsersIntoMessaging(issuer.id));
}
