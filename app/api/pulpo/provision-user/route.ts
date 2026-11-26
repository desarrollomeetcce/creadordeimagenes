import { db } from "@/lib/db";
import { linkedGeneratorUser, verifyPulpoAssertion } from "@/lib/pulpo-sso";
import { createManagedGeneratorUser } from "@/lib/pulpo-provision";

const reply = (status: number, state: string) =>
  Response.json(
    { state },
    { status, headers: { "Cache-Control": "no-store" } },
  );

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const grant = verifyPulpoAssertion(
    authorization.startsWith("Bearer ") ? authorization.slice(7) : "",
    process.env.PULPO_GENERATOR_SSO_KEY ?? "",
    undefined,
    "provision",
  );
  if (
    !grant?.provision ||
    grant.page !== "home" ||
    grant.view ||
    grant.embedded
  )
    return reply(403, "unavailable");

  const state = await db.$transaction(async (tx) => {
    const directoryId = linkedGeneratorUser(
      process.env.PULPO_GENERATOR_LINKS || "",
      grant,
    );
    const correct = (
      user: {
        email: string;
        status: string;
        archivedAt: Date | null;
        pulpoUserId: string | null;
      } | null,
    ) =>
      user?.email.trim().toLowerCase() === grant.email &&
      user.status === "APPROVED" &&
      !user.archivedAt &&
      (!user.pulpoUserId || user.pulpoUserId === grant.sub);
    if (directoryId) {
      const existing = await tx.user.findUnique({ where: { id: directoryId } });
      return correct(existing) ? "linked" : "verify";
    }
    const existing = await tx.user.findUnique({
      where: { pulpoUserId: grant.sub },
    });
    if (existing) return correct(existing) ? "linked" : "verify";
    const taken = await tx.user.findFirst({
      where: { email: { equals: grant.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (taken) return "verify";
    const created = await createManagedGeneratorUser(tx, {
      ...grant,
      name: grant.name!.trim(),
    });
    return correct(created) ? "linked" : "verify";
  });
  return reply(200, state);
}
