import type { Prisma } from "@prisma/client";
/** Images currently visible in the user's library, independently of date filters. */
export function libraryImageVisibility(
  user: { id: string; role: string },
  now = new Date(),
): Prisma.VariationWhereInput {
  return {
    deletedAt: null,
    expired: false,
    libraryExclusions: { none: { userId: user.id } },
    AND: [
      { OR: [{ permanent: true }, { expiresAt: { gt: now } }] },
      ...(user.role === "OWNER"
        ? []
        : [
            {
              OR: [
                ...(user.role !== "OBSERVER"
                  ? [{ job: { actorId: user.id } }]
                  : []),
                { reviewStatus: "APPROVED" },
                { libraryItems: { some: { userId: user.id } } },
              ],
            },
          ]),
    ],
  };
}
