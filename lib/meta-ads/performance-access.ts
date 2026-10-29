import { db } from "../db";
import { demand } from "../errors";
import type { Prisma } from "@prisma/client";
import type { Actor } from "./service";
export const managesPerformance = (role: string) =>
  role === "OWNER" || role === "SUPERVISOR";
export async function performanceManager(
  actor: Actor,
  tx: Prisma.TransactionClient = db,
) {
  const user = await tx.user.findFirst({
    where: { id: actor.id, status: "APPROVED" },
    select: { role: true },
  });
  demand(
    user && managesPerformance(user.role),
    "Solo OWNER o Supervisor puede administrar el desempeño.",
    403,
  );
  return user;
}
export async function isPerformanceManager(
  actor: Actor,
  tx: Prisma.TransactionClient = db,
) {
  return !!(await tx.user.findFirst({
    where: {
      id: actor.id,
      status: "APPROVED",
      role: { in: ["OWNER", "SUPERVISOR"] },
    },
    select: { id: true },
  }));
}
