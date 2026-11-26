import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

export async function createManagedGeneratorUser(
  tx: Prisma.TransactionClient,
  identity: { sub: string; email: string; name: string },
) {
  await tx.user.createMany({
    data: [
      {
        pulpoUserId: identity.sub,
        pulpoManagedLogin: true,
        email: identity.email,
        name: identity.name,
        passwordHash: "$pulpo$" + randomBytes(32).toString("base64url"),
        role: "USER",
        status: "APPROVED",
      },
    ],
    skipDuplicates: true,
  });
  return tx.user.findUnique({ where: { pulpoUserId: identity.sub } });
}
