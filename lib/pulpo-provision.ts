import { randomBytes } from "node:crypto";
import type { SharedPulpoRole } from "./pulpo-sso";
import type { Prisma } from "@prisma/client";

export async function createManagedGeneratorUser(
  tx: Prisma.TransactionClient,
  identity: { sub: string; email: string; name: string; sharedRole?: SharedPulpoRole },
) {
  await tx.user.createMany({
    data: [
      {
        pulpoUserId: identity.sub,
        pulpoManagedLogin: true,
        email: identity.email,
        name: identity.name,
        passwordHash: "$pulpo$" + randomBytes(32).toString("base64url"),
        role:
          identity.sharedRole === "OBSERVER" || identity.sharedRole === "ADVISOR"
            ? identity.sharedRole
            : "USER",
        status: "APPROVED",
      },
    ],
    skipDuplicates: true,
  });
  return tx.user.findUnique({ where: { pulpoUserId: identity.sub } });
}
