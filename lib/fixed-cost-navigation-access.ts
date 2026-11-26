import { Prisma } from "@prisma/client";
import { db } from "./db";

export async function fixedCostNavigationAccess(userId: string, role: string) {
  if (role === "OWNER") return true;

  try {
    const [access] = await db.$queryRaw<{ allowed: boolean }[]>`
      SELECT
        EXISTS (SELECT 1 FROM "FixedCostGrant" WHERE "userId" = ${userId}) OR
        EXISTS (SELECT 1 FROM "FixedCostSheetGrant" WHERE "userId" = ${userId}) AS allowed
    `;
    return access?.allowed === true;
  } catch (error) {
    // Hosts can receive this code before the additive sheet-sharing migration.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2010"
    ) throw error;
    const adapter = error.meta?.driverAdapterError as {
      cause?: { kind?: string; table?: string };
    } | undefined;
    if (
      adapter?.cause?.kind !== "TableDoesNotExist" ||
      adapter.cause.table !== "FixedCostSheetGrant"
    ) throw error;
    return Boolean(await db.fixedCostGrant.findUnique({
      where: { userId },
      select: { userId: true },
    }));
  }
}
