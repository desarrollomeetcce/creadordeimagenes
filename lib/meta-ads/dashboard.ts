import { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { accountWhere, type Actor } from "./service";
import {
  localDay,
  shiftDay,
  metricFor,
  metricNames,
  dayCount,
} from "./analytics";
export async function dashboard(actor: Actor, params: URLSearchParams) {
  const level = params.get("level") ?? "ad";
  demand(["campaign", "adset", "ad"].includes(level), "Nivel inválido.");
  const accounts = await db.metaAdAccount.findMany({
    where: accountWhere(actor),
    select: {
      id: true,
      name: true,
      currency: true,
      timezone: true,
      metric: true,
      targetCost: true,
      minResults: true,
      syncedAt: true,
      historyFrom: true,
      businessId: true,
      businessName: true,
    },
  });
  const requested = (params.get("accounts") ?? "").split(",").filter(Boolean);
  demand(requested.length <= 100, "Demasiadas cuentas.");
  if (requested.length)
    demand(
      requested.every((id) => accounts.some((a) => a.id === id)),
      "Hay cuentas no autorizadas en la selección.",
      404,
    );
  const allowed = accounts.filter(
    (a) => !requested.length || requested.includes(a.id),
  );
  const business = params.get("business");
  const scoped = allowed.filter((a) => !business || a.businessId === business);
  if (!scoped.length) return { items: [], total: 0, page: 1, limited: false };
  const q = (params.get("q") ?? "").slice(0, 200),
    state = params.get("state") ?? "all",
    campaign = params.get("campaign"),
    adset = params.get("adset");
  const where: Prisma.MetaAdObjectWhereInput = {
    accountId: { in: scoped.map((a) => a.id) },
    level,
    ...(campaign ? { campaignId: campaign } : {}),
    ...(adset ? { adsetId: adset } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(state === "active"
      ? { status: "ACTIVE" }
      : state === "effective"
        ? { effectiveStatus: "ACTIVE" }
        : state === "paused"
          ? {
              OR: [
                { status: "PAUSED" },
                { effectiveStatus: "CAMPAIGN_PAUSED" },
                { effectiveStatus: "ADSET_PAUSED" },
              ],
            }
          : state === "issues"
            ? {
                effectiveStatus: {
                  in: [
                    "DISAPPROVED",
                    "PENDING_REVIEW",
                    "WITH_ISSUES",
                    "PENDING_BILLING_INFO",
                  ],
                },
              }
            : {}),
  };
  const objects = await db.metaAdObject.findMany({
    where,
    orderBy: { id: "asc" },
    take: 10001,
  });
  const limited = objects.length > 10000;
  const visible = objects.slice(0, 10000);
  if (!visible.length) return { items: [], total: 0, page: 1, limited };
  const parents = await db.metaAdObject.findMany({
    where: {
      accountId: { in: scoped.map((a) => a.id) },
      id: {
        in: [
          ...new Set(
            visible.flatMap((o) =>
              [o.campaignId, o.adsetId].filter((x): x is string => !!x),
            ),
          ),
        ],
      },
    },
    select: {
      id: true,
      name: true,
      objective: true,
      optimizationGoal: true,
      status: true,
    },
  });
  const parentMap = new Map(parents.map((o) => [o.id, o]));
  const customSince = params.get("since"),
    customUntil = params.get("until");
  demand(
    (!customSince && !customUntil) ||
      (!!customSince &&
        !!customUntil &&
        /^\d{4}-\d{2}-\d{2}$/.test(customSince) &&
        /^\d{4}-\d{2}-\d{2}$/.test(customUntil) &&
        customSince <= customUntil &&
        Number.isFinite(Date.parse(customSince)) &&
        Number.isFinite(Date.parse(customUntil))),
    "Rango de fechas inválido.",
  );
  // Aggregate in PostgreSQL: do not transfer the full daily history to the browser or Node.
  const sums = await db.$queryRaw<
    {
      objectId: string;
      key: string;
      spend: number;
      impressions: number;
      clicks: number;
      actions: unknown;
      first: string | null;
      last: string | null;
      active: number;
    }[]
  >(Prisma.sql`
WITH scoped AS (SELECT d.*, to_char(CURRENT_TIMESTAMP AT TIME ZONE a.timezone,'YYYY-MM-DD') today FROM "MetaAdDaily" d JOIN "MetaAdAccount" a ON a.id=d."accountId" WHERE d."objectId" IN (${Prisma.join(visible.map((o) => o.id))}) AND d.scope='7d_click,1d_view|impression'),
activity AS (SELECT "objectId",min(day) FILTER(WHERE spend>0 OR impressions>0) first,max(day) FILTER(WHERE spend>0 OR impressions>0) last,count(*) FILTER(WHERE spend>0 OR impressions>0)::int active FROM scoped GROUP BY "objectId"),
expanded AS (SELECT s.*, p.key FROM scoped s CROSS JOIN (VALUES ('today'),('7'),('15'),('30'),('lifetime'),('previous7'),('complete7'),('custom')) p(key) WHERE CASE p.key WHEN 'today' THEN s.day=s.today WHEN '7' THEN s.day BETWEEN to_char(s.today::date-6,'YYYY-MM-DD') AND s.today WHEN '15' THEN s.day BETWEEN to_char(s.today::date-14,'YYYY-MM-DD') AND s.today WHEN '30' THEN s.day BETWEEN to_char(s.today::date-29,'YYYY-MM-DD') AND s.today WHEN 'previous7' THEN s.day BETWEEN to_char(s.today::date-14,'YYYY-MM-DD') AND to_char(s.today::date-8,'YYYY-MM-DD') WHEN 'complete7' THEN s.day BETWEEN to_char(s.today::date-7,'YYYY-MM-DD') AND to_char(s.today::date-1,'YYYY-MM-DD') WHEN 'custom' THEN s.day BETWEEN ${customSince ?? "9999-01-01"} AND ${customUntil ?? "9999-01-01"} ELSE s.day<=s.today END),
base AS (SELECT "objectId",key,sum(spend)::float8 spend,sum(impressions)::float8 impressions,sum(clicks)::float8 clicks FROM expanded GROUP BY "objectId",key),
actions AS (SELECT e."objectId",e.key,j.key action,sum(j.value::numeric)::float8 amount FROM expanded e CROSS JOIN LATERAL jsonb_each_text(e.actions) j GROUP BY e."objectId",e.key,j.key),
packed AS (SELECT "objectId",key,jsonb_object_agg(action,amount) actions FROM actions GROUP BY "objectId",key)
SELECT b.*,COALESCE(p.actions,'{}'::jsonb) actions,a.first,a.last,a.active FROM base b LEFT JOIN packed p ON p."objectId"=b."objectId" AND p.key=b.key LEFT JOIN activity a ON a."objectId"=b."objectId"`);
  const map = new Map<string, typeof sums>();
  for (const row of sums) {
    const list = map.get(row.objectId) ?? [];
    list.push(row);
    map.set(row.objectId, list);
  }
  const actionTypes: Record<string, string[]> = {
    MESSAGES: ["onsite_conversion.messaging_conversation_started_7d"],
    LEADS: [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
    ],
    PURCHASES: [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
    ],
    LINK_CLICKS: ["link_click"],
  };
  let items = visible.map((o) => {
    const a = scoped.find((a) => a.id === o.accountId)!,
      c = parentMap.get(o.campaignId ?? ""),
      s = parentMap.get(o.adsetId ?? ""),
      metric = metricFor(
        a.metric,
        o.objective ?? c?.objective,
        o.optimizationGoal ?? s?.optimizationGoal,
      ),
      today = localDay(a.timezone),
      stats = map.get(o.id) ?? [],
      first = stats[0]?.first ?? null,
      last = stats[0]?.last ?? null;
    const periods = Object.fromEntries(
      [
        "today",
        "7",
        "15",
        "30",
        "lifetime",
        "previous7",
        "complete7",
        ...(customSince ? ["custom"] : []),
      ].map((key) => {
        const v = stats.find((r) => r.key === key),
          actions = (v?.actions ?? {}) as Record<string, number>,
          action = actionTypes[metric]?.find((k) => Object.hasOwn(actions, k)),
          results = action ? actions[action] : 0,
          spend = v?.spend ?? 0;
        const state =
          !a.syncedAt || metric === "UNKNOWN"
            ? "UNAVAILABLE"
            : results > 0
              ? "RESULTS"
              : spend > 0
                ? "NO_RESULTS"
                : "INACTIVE";
        const since =
          key === "today"
            ? today
            : key === "lifetime"
              ? (a.historyFrom ?? first ?? today)
              : key === "custom"
                ? customSince!
                : key === "previous7"
                  ? shiftDay(today, -14)
                  : key === "complete7"
                    ? shiftDay(today, -7)
                    : shiftDay(today, 1 - Number(key));
        return [
          key,
          {
            spend,
            impressions: v?.impressions ?? 0,
            results,
            cost: state === "RESULTS" ? spend / results : null,
            state,
            since,
            until:
              key === "previous7"
                ? shiftDay(today, -8)
                : key === "complete7"
                  ? shiftDay(today, -1)
                  : key === "custom"
                    ? customUntil!
                    : today,
          },
        ];
      }),
    );
    const recent = periods["7"],
      comparison = periods.complete7,
      previous = periods.previous7,
      target = a.targetCost === null ? null : Number(a.targetCost),
      change =
        comparison.cost !== null && previous.cost !== null && previous.cost > 0
          ? (comparison.cost / previous.cost - 1) * 100
          : null;
    let rating = "INSUFFICIENT";
    if (
      a.syncedAt &&
      metric !== "UNKNOWN" &&
      recent.results >= a.minResults &&
      recent.cost !== null
    )
      rating =
        target === null
          ? "ENOUGH_DATA"
          : recent.cost <= target
            ? "GOOD"
            : recent.cost > target * 1.5
              ? "CRITICAL"
              : "WATCH";
    else if (
      a.syncedAt &&
      metric !== "UNKNOWN" &&
      target !== null &&
      recent.results === 0 &&
      recent.spend >= target * a.minResults
    )
      rating = "CRITICAL";
    if (rating === "GOOD" && change !== null && change >= 30)
      rating = "DETERIORATING";
    return {
      ...o,
      campaignName:
        c?.name ?? (o.level === "campaign" ? o.name : "Campaña no disponible"),
      adsetName:
        s?.name ?? (o.level === "adset" ? o.name : "Conjunto no disponible"),
      accountName: a.name,
      currency: a.currency,
      timezone: a.timezone,
      businessName: a.businessName,
      metric,
      metricName: metricNames[metric],
      periods,
      firstDelivery: first,
      lastDelivery: last,
      ageDays: first ? dayCount(first, today) : null,
      activeDays: stats[0]?.active ?? 0,
      historyPartial: true,
      syncedAt: a.syncedAt,
      changePercent: change,
      rating,
      minResults: a.minResults,
      pausedCandidate:
        ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(
          o.effectiveStatus ?? "",
        ) &&
        target !== null &&
        periods.lifetime.cost !== null &&
        periods.lifetime.cost <= target &&
        periods.lifetime.results >= a.minResults,
    };
  });
  if (state === "campaign-active")
    items = items.filter(
      (o) => parentMap.get(o.campaignId ?? o.id)?.status === "ACTIVE",
    );
  if (state === "delivery")
    items = items.filter(
      (o) => o.periods.today.impressions > 0 || o.periods.today.spend > 0,
    );
  if (params.get("metric"))
    items = items.filter((o) => o.metric === params.get("metric"));
  if (params.get("currency"))
    items = items.filter((o) => o.currency === params.get("currency"));
  if (params.get("rating") === "alerts")
    items = items.filter((o) =>
      ["CRITICAL", "WATCH", "DETERIORATING"].includes(o.rating),
    );
  else if (params.get("rating"))
    items = items.filter((o) => o.rating === params.get("rating"));
  const age = params.get("age");
  if (age)
    items = items.filter(
      (o) =>
        o.ageDays !== null &&
        (age === "7"
          ? o.ageDays <= 7
          : age === "15"
            ? o.ageDays > 7 && o.ageDays <= 15
            : age === "30"
              ? o.ageDays > 15 && o.ageDays <= 30
              : o.ageDays > 30),
    );
  const sort = params.get("sort") ?? "7",
    direction = params.get("direction") === "desc" ? -1 : 1;
  const excludedForRanking =
    params.get("ranking") === "1"
      ? items.filter(
          (o) =>
            (o.periods[sort] ?? o.periods["7"]).results < o.minResults ||
            (o.periods[sort] ?? o.periods["7"]).cost === null,
        ).length
      : 0;
  if (params.get("ranking") === "1")
    items = items.filter(
      (o) =>
        (o.periods[sort] ?? o.periods["7"]).results >= o.minResults &&
        (o.periods[sort] ?? o.periods["7"]).cost !== null,
    );
  items.sort((a, b) => {
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
    if (sort === "newest")
      return (b.createdTime?.valueOf() ?? 0) - (a.createdTime?.valueOf() ?? 0);
    if (sort === "age")
      return direction * ((a.ageDays ?? Infinity) - (b.ageDays ?? Infinity));
    const ap = a.periods[sort] ?? a.periods["7"],
      bp = b.periods[sort] ?? b.periods["7"];
    if (ap.cost === null || bp.cost === null)
      return ap.cost === bp.cost ? 0 : ap.cost === null ? 1 : -1;
    return direction * (ap.cost - bp.cost) || bp.results - ap.results;
  });
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1)),
    limit = Math.max(10, Math.min(100, Number(params.get("limit")) || 25));
  return {
    items: items.slice((page - 1) * limit, page * limit),
    total: items.length,
    page,
    limited,
    excludedForRanking,
    attribution: "7 días clic / 1 día vista · fecha de impresión",
    note: "Datos de hoy parciales. Histórico disponible; no se garantiza toda la vida del anuncio. Rankings separados por moneda y resultado.",
  };
}
