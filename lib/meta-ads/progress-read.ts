import { Prisma } from "@prisma/client";
import { db } from "../db";
// Read only public progress fields. Never transfer work queues/cursors to the API process.
const root = [
  "stop",
  "phase",
  "refreshOnly",
  "quotaUntil",
  "waitReason",
  "recentReady",
  "historyProcessed",
  "historyTotal",
  "inventory",
  "recentDays",
  "plan",
  "since",
  "until",
  "pages",
  "processed",
  "updatedAt",
  "started",
  "lastReportUntil",
];
const run = [
  "refreshOnly",
  "historyProcessed",
  "historyTotal",
  "pages",
  "processed",
  "finishedAt",
  "since",
  "until",
  "plan",
  "inventory",
  "recentDays",
  "recentReady",
];
const attempt = ["at", "revision"];
const columns = (keys: string[]) =>
  Prisma.join(keys.map((k) => Prisma.sql`${Prisma.raw('"' + k + '"')} jsonb`));
const fields = (alias: string, keys: string[]) =>
  keys.flatMap((k) => [
    Prisma.sql`${k}::text`,
    Prisma.raw(alias + '."' + k + '"'),
  ]);
/** IDs must already be authorized by the caller. No credentials or cursor queues are returned. */
export async function withProgressState<T extends { id: string }>(
  rows: T[],
  tx: Pick<Prisma.TransactionClient, "$queryRaw"> = db,
): Promise<(T & { syncState: unknown })[]> {
  if (!rows.length) return [];
  const states = await tx.$queryRaw<{ id: string; syncState: unknown }[]>`
 SELECT a.id,jsonb_strip_nulls(jsonb_build_object(${Prisma.join(fields("p", root))},'lastRun',jsonb_build_object(${Prisma.join(fields("r", run))}),'lastAttempt',jsonb_build_object(${Prisma.join(fields("t", attempt))}))) AS "syncState"
 FROM "MetaAdAccount" a
 CROSS JOIN LATERAL jsonb_to_record(CASE WHEN jsonb_typeof(a."syncState")='object' THEN a."syncState" ELSE '{}'::jsonb END) AS p(${columns([...root, "lastRun", "lastAttempt"])})
 CROSS JOIN LATERAL jsonb_to_record(CASE WHEN jsonb_typeof(p."lastRun")='object' THEN p."lastRun" ELSE '{}'::jsonb END) AS r(${columns(run)})
 CROSS JOIN LATERAL jsonb_to_record(CASE WHEN jsonb_typeof(p."lastAttempt")='object' THEN p."lastAttempt" ELSE '{}'::jsonb END) AS t(${columns(attempt)})
 WHERE a.id IN (${Prisma.join(rows.map((r) => r.id))})`;
  const byId = new Map(states.map((s) => [s.id, s.syncState]));
  return rows
    .filter((r) => byId.has(r.id))
    .map((r) => ({ ...r, syncState: byId.get(r.id) }));
}
