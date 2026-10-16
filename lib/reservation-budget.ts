import type { Prisma, ProviderConfiguration } from "@prisma/client";
import { db } from "./db";
import { demand, AppError } from "./errors";
type Budget = Pick<
  ProviderConfiguration,
  | "imageReserveMicros"
  | "operationLimitMicros"
  | "monthlyLimitMicros"
  | "dailyLimitMicros"
>;
export async function checkReservationBudget(
  tx: Prisma.TransactionClient,
  c: Budget,
  actorId: string,
  projectId: string,
  pendingCount: number,
) {
  const total = c.imageReserveMicros * BigInt(pendingCount);
  demand(
    total > 0n && total <= c.operationLimitMicros,
    "La operación supera el presupuesto por operación.",
  );
  const now = new Date(),
    month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  for (const [since, limit, label] of [
    [month, c.monthlyLimitMicros, "mensual"],
    [day, c.dailyLimitMicros, "diario"],
  ] as const) {
    const usage = await tx.usageLedger.aggregate({
      where: { createdAt: { gte: since }, status: { not: "RELEASED" } },
      _sum: { reservedMicros: true },
    });
    demand(
      (usage._sum.reservedMicros ?? 0n) + total <= limit,
      `Se supera el límite ${label} de reservas de consumo.`,
    );
  }
  const scoped = await tx.budgetLimit.findMany({
    where: {
      OR: [
        { scope: "USER", targetId: actorId },
        { scope: "PROJECT", targetId: projectId },
      ],
    },
  });
  for (const limit of scoped) {
    const filter = limit.scope === "USER" ? { actorId } : { projectId };
    for (const [since, max] of [
      [month, limit.monthlyMicros],
      [day, limit.dailyMicros],
    ] as const) {
      const usage = await tx.usageLedger.aggregate({
        where: {
          ...filter,
          createdAt: { gte: since },
          status: { not: "RELEASED" },
        },
        _sum: { reservedMicros: true },
      });
      demand(
        (usage._sum.reservedMicros ?? 0n) + total <= max,
        `La operación supera el presupuesto particular ${limit.scope === "USER" ? "de tu cuenta" : "del proyecto"}. Edita o elimina ese límite si no corresponde.`,
      );
    }
    const count = await tx.usageLedger.count({
      where: {
        ...filter,
        createdAt: { gte: day },
        status: { not: "RELEASED" },
      },
    });
    demand(
      count + pendingCount <= limit.maxJobsPerDay,
      "Se supera el máximo diario de generaciones del usuario o proyecto.",
    );
  }
}
export async function testBudgetStatus(actorId: string) {
  return db.$transaction(
    async (tx) => {
      const c = await tx.providerConfiguration.findUnique({
        where: { id: "global" },
        select: {
          revision: true,
          imageReserveMicros: true,
          operationLimitMicros: true,
          monthlyLimitMicros: true,
          dailyLimitMicros: true,
        },
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
