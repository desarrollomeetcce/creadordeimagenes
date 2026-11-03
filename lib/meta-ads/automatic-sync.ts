import type { Prisma } from "@prisma/client";
import { db } from "../db";
/** The primary list is shared workspace configuration, not a browser-only filter. */
export async function automaticSyncWhere(
  tx: Prisma.TransactionClient = db,
): Promise<Prisma.MetaAdAccountWhereInput> {
  const p = await tx.metaWorkspaceSharing.findUnique({
    where: { id: "global" },
    select: { primaryAccountIds: true },
  });
  if (p?.primaryAccountIds == null) return {};
  const ids = Array.isArray(p.primaryAccountIds)
    ? p.primaryAccountIds.filter(
        (v): v is string => typeof v === "string" && /^\d{1,40}$/.test(v),
      )
    : [];
  return {
    OR: [{ id: { in: ids } }, { schedulerToken: { startsWith: "manual:" } }],
  };
}
export function manualSyncStarted(token: string | null | undefined) {
  const match = token?.match(/^manual:(\d{13}):[0-9a-f-]+$/);
  return match ? Number(match[1]) : null;
}
export async function automaticSyncAllowed(
  a: { id: string; schedulerToken: string | null; syncState: unknown },
  tx: Prisma.TransactionClient = db,
  allowManual = true,
) {
  const where = await automaticSyncWhere(tx);
  if (!where.OR) return true;
  const primary = (where.OR[0].id as Prisma.StringFilter).in ?? [];
  if (primary.includes(a.id)) return true;
  if (!allowManual) return false;
  const start = manualSyncStarted(a.schedulerToken);
  if (!start) return false;
  const s = (a.syncState ?? {}) as { lastRun?: { finishedAt?: string } };
  const finished = s.lastRun?.finishedAt
    ? Date.parse(s.lastRun.finishedAt)
    : NaN;
  return !Number.isFinite(finished) || finished < start;
}
