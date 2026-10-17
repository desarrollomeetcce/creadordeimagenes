import type { Prisma, ProviderConfiguration } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { checkPlanAllowance } from "./membership-plans";

/** Legacy configuration arguments are retained for compatibility, never enforced.
 * Plan allocation is accounting, not a provider price or confirmed API balance.
 * Call under advisory lock 728291 when creating jobs.
 */
export async function checkReservationBudget(
  tx: Prisma.TransactionClient,
  _configuration: Pick<
    ProviderConfiguration,
    | "imageReserveMicros"
    | "operationLimitMicros"
    | "monthlyLimitMicros"
    | "dailyLimitMicros"
  >,
  actorId: string,
  _projectId: string,
  pendingCount: number,
) {
  const user = await tx.user.findUnique({
    where: { id: actorId },
    include: { plan: true },
  });
  const plan = user?.plan;
  const reserve =
    user?.role !== "OWNER" &&
    plan?.monthlyAIMicros != null &&
    plan.monthlyImages != null &&
    plan.monthlyImages > 0
      ? plan.monthlyAIMicros / BigInt(plan.monthlyImages)
      : 0n;
  await checkPlanAllowance(
    tx,
    actorId,
    pendingCount,
    reserve * BigInt(pendingCount),
  );
  return reserve;
}
export async function testBudgetStatus(actorId: string) {
  return db.$transaction(
    async (tx) => {
      const c = await tx.providerConfiguration.findUnique({
        where: { id: "global" },
      });
      const checkedAt = new Date().toISOString();
      if (!c)
        return {
          allowed: false,
          error: "Guarda primero la configuración de IA.",
          revision: null,
          checkedAt,
        };
      try {
        await checkReservationBudget(tx, c, actorId, "connection-test", 1);
        return { allowed: true, error: null, revision: c.revision, checkedAt };
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        return {
          allowed: false,
          error: e.message,
          revision: c.revision,
          checkedAt,
        };
      }
    },
    { isolationLevel: "RepeatableRead" },
  );
}
