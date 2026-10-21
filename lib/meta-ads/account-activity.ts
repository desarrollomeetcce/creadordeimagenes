import { db } from "../db";
import { localDay, shiftDay } from "./analytics";
import type { AccountActivity } from "./account-filters";
type Account = {
  id: string;
  timezone: string;
  syncedAt: Date | null;
  syncState: unknown;
};
// Input must be the accounts authorized for this request. Never cache grants or query all accounts.
export async function accountActivities(accounts: Account[]) {
  const result = new Map<string, AccountActivity>();
  const ready = accounts.flatMap((a) => {
    const today = localDay(a.timezone),
      phase = (a.syncState as { phase?: number } | null)?.phase;
    const state =
      phase !== undefined && phase !== null
        ? "SYNCING"
        : !a.syncedAt
          ? "UNSYNCED"
          : localDay(a.timezone, a.syncedAt) !== today
            ? "STALE"
            : "READY";
    result.set(a.id, { state, spend30: null, activeCampaigns: null });
    return state === "READY"
      ? [{ id: a.id, since: shiftDay(today, -29), until: today }]
      : [];
  });
  if (!ready.length) return result;
  const rows = await db.$queryRaw<
    { id: string; spend: number; active: number }[]
  >`
    WITH scope AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(ready)}::jsonb) AS s(id text, since text, until text)),
    campaigns AS (SELECT o.id, o."accountId", o."effectiveStatus" FROM "MetaAdObject" o JOIN scope s ON s.id=o."accountId" WHERE o.level='campaign'),
    activity AS (SELECT c."accountId", COUNT(*) FILTER (WHERE c."effectiveStatus"='ACTIVE')::integer AS active FROM campaigns c GROUP BY c."accountId"),
    spend AS (SELECT d."accountId", SUM(d.spend)::float8 AS spend FROM "MetaAdDaily" d JOIN campaigns c ON c.id=d."objectId" AND c."accountId"=d."accountId" JOIN scope s ON s.id=d."accountId" WHERE d.day BETWEEN s.since AND s.until AND d.scope='7d_click,1d_view|impression' GROUP BY d."accountId")
    SELECT s.id, COALESCE(p.spend,0)::float8 AS spend, COALESCE(a.active,0)::integer AS active FROM scope s LEFT JOIN activity a ON a."accountId"=s.id LEFT JOIN spend p ON p."accountId"=s.id
  `;
  for (const row of rows)
    result.set(row.id, {
      state: "READY",
      spend30: row.spend,
      activeCampaigns: row.active,
    });
  return result;
}
