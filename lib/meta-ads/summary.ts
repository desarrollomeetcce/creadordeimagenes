import { Prisma } from "@prisma/client";
import { db } from "../db";
import { localDay, shiftDay } from "./analytics";
import { focusedReportDay } from "./focused-labels";

export type MetaSummary = {
  sales?: import("./registered-sales").RegisteredSalesSummary;
  selected: boolean;
  objects: number;
  partial: boolean;
  currencies: {
    currency: string;
    spend: number | null;
    conversations: number | null;
    average: number | null;
  }[];
  campaigns: { active: number; inactive: number; unknown: number };
};
type Account = {
  id: string;
  currency: string;
  timezone: string;
  syncedAt: Date | null;
  syncState: unknown;
};
type ObjectRef = {
  id: string;
  accountId: string;
  level: string;
  campaignId: string | null;
};
const scope = "7d_click,1d_view|impression";
// Aggregate exactly one hierarchy level, before pagination. Never add parent and child facts.
export async function metaSummary(
  objects: ObjectRef[],
  accounts: Account[],
  period: string,
  since: string | null,
  until: string | null,
  selected: boolean,
  limited = false,
): Promise<MetaSummary> {
  const result: MetaSummary = {
    selected,
    objects: objects.length,
    partial: limited,
    currencies: [],
    campaigns: { active: 0, inactive: 0, unknown: 0 },
  };
  const campaigns = [
    ...new Set(
      objects
        .map((o) => (o.level === "campaign" ? o.id : o.campaignId))
        .filter((id): id is string => !!id),
    ),
  ];
  const parents: {
    id: string;
    status: string | null;
    effectiveStatus: string | null;
  }[] = [];
  for (let offset = 0; offset < campaigns.length; offset += 4000)
    parents.push(
      ...(await db.metaAdObject.findMany({
        where: {
          id: { in: campaigns.slice(offset, offset + 4000) },
          accountId: { in: accounts.map((a) => a.id) },
          level: "campaign",
        },
        select: { id: true, status: true, effectiveStatus: true },
      })),
    );
  for (const p of parents) {
    const status = p.status ?? p.effectiveStatus;
    if (status === "ACTIVE") result.campaigns.active++;
    else if (status === "PAUSED") result.campaigns.inactive++;
    else result.campaigns.unknown++;
  }
  result.campaigns.unknown += campaigns.length - parents.length;
  const grouped = new Map<
    string,
    {
      currency: string;
      spend: number;
      conversations: number;
      reported: number;
      objects: number;
    }
  >();
  for (const account of accounts) {
    const ids = objects
      .filter((o) => o.accountId === account.id)
      .map((o) => o.id);
    if (!ids.length) continue;
    const group = grouped.get(account.currency) ?? {
      currency: account.currency,
      spend: 0,
      conversations: 0,
      reported: 0,
      objects: 0,
    };
    group.objects += ids.length;
    const today = localDay(account.timezone);
    const end = period === "custom" ? until! : today;
    const start =
      period === "custom"
        ? since!
        : period === "today" || period === "lifetime"
          ? today
          : shiftDay(today, -(Number(period) - 1));
    const reportDay =
      focusedReportDay(account.syncState) ??
      (account.syncedAt ? localDay(account.timezone, account.syncedAt) : null);
    if (
      !account.syncedAt ||
      (period !== "lifetime" &&
        (!reportDay || end > reportDay || start < shiftDay(reportDay, -29)))
    )
      result.partial = true;
    for (let offset = 0; offset < ids.length; offset += 4000) {
      const batch = ids.slice(offset, offset + 4000);
      const rows =
        period === "lifetime"
          ? await db.$queryRaw<
              { spend: number; conversations: number; reported: number }[]
            >(
              Prisma.sql`SELECT COALESCE(sum(spend),0)::float8 spend, COALESCE(sum(COALESCE((actions->>'onsite_conversion.messaging_conversation_started_7d')::numeric,0)),0)::float8 conversations, count(DISTINCT "objectId")::int reported FROM "MetaAdTotal" WHERE "accountId"=${account.id} AND "objectId" IN (${Prisma.join(batch)}) AND scope=${scope}`,
            )
          : await db.$queryRaw<
              { spend: number; conversations: number; reported: number }[]
            >(
              Prisma.sql`SELECT COALESCE(sum(spend),0)::float8 spend, COALESCE(sum(COALESCE((actions->>'onsite_conversion.messaging_conversation_started_7d')::numeric,0)),0)::float8 conversations, count(DISTINCT "objectId")::int reported FROM "MetaAdDaily" WHERE "accountId"=${account.id} AND "objectId" IN (${Prisma.join(batch)}) AND scope=${scope} AND day BETWEEN ${start} AND ${end}`,
            );
      const r = rows[0];
      group.spend += r.spend;
      group.conversations += r.conversations;
      group.reported += r.reported;
      // Missing reports are not fabricated as zero; identify incomplete coverage explicitly.
      if (r.reported < batch.length) result.partial = true;
    }
    grouped.set(account.currency, group);
  }
  result.currencies = [...grouped.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map((g) => ({
      currency: g.currency,
      spend: g.reported ? g.spend : null,
      conversations: g.reported ? g.conversations : null,
      average:
        g.reported && g.conversations > 0 ? g.spend / g.conversations : null,
    }));
  return result;
}
