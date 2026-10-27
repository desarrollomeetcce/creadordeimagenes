import type { Prisma } from "@prisma/client";
import { accountWhere, type Actor } from "./service";
export async function advisorBaseByDay(
  tx: Prisma.TransactionClient,
  actor: Actor,
  b: {
    tableIds: string[];
    advisorIds: string[];
    aliasId?: string;
    country?: string;
    since: string;
    until: string;
  },
) {
  const campaigns = await tx.metaAdObject.findMany({
    where: {
      level: "campaign",
      advisorId: { in: b.advisorIds },
      alias: { tableId: { in: b.tableIds } },
      ...(b.aliasId ? { aliasId: b.aliasId } : {}),
      aliasCountry: b.country ? b.country : { not: null },
      account: accountWhere(actor),
    },
    select: {
      advisorId: true,
      daily: {
        where: {
          day: { gte: b.since, lte: b.until },
          scope: "7d_click,1d_view|impression",
        },
        select: { day: true, actions: true },
      },
    },
  });
  const expected = new Map<string, number>();
  for (const c of campaigns)
    expected.set(c.advisorId!, (expected.get(c.advisorId!) ?? 0) + 1);
  const sums = new Map<
    string,
    { base: number; known: number; partial: boolean }
  >();
  for (const c of campaigns)
    for (const d of c.daily) {
      const key = JSON.stringify([c.advisorId, d.day]),
        old = sums.get(key) ?? { base: 0, known: 0, partial: false },
        actions = d.actions as Record<string, unknown>,
        value = actions["onsite_conversion.messaging_conversation_started_7d"];
      old.base +=
        typeof value === "number" && Number.isFinite(value) ? value : 0;
      old.known++;
      sums.set(key, old);
    }
  for (const [key, sum] of sums)
    sum.partial = sum.known < (expected.get(JSON.parse(key)[0]) ?? 0);
  return sums;
}
