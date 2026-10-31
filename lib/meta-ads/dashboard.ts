import { isCountryCode } from "./countries";
import { parseDeliveryFilters } from "./state-filter";
import { metaRegisteredSales } from "./effectiveness";
import { validSalesDate } from "./registered-sales";
import { metaSummary } from "./summary";
import { compareMetaItems } from "./order";
import { focusedReportDay } from "./focused-labels";
import { createHash } from "node:crypto";
import { insightSummaries } from "./insight-cache";
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
  const salesSince = params.get("salesSince") ?? "";
  demand(
    !salesSince ||
      (validSalesDate(salesSince) && salesSince <= localDay("America/Lima")),
    "Fecha de inicio de ventas inválida.",
  );
  const level = params.get("level") ?? "ad";
  demand(["campaign", "adset", "ad"].includes(level), "Nivel inválido.");
  const accounts = await db.metaAdAccount.findMany({
    where: await accountWhere(actor),
    select: {
      id: true,
      name: true,
      currency: true,
      timezone: true,
      metric: true,
      targetCost: true,
      minResults: true,
      syncedAt: true,
      syncState: true,
      connectionId: true,
      historyFrom: true,
      selectionSince: true,
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
  const filters = parseDeliveryFilters(state);
  demand(
    filters !== null || ["campaign-active", "issues"].includes(state),
    "Combinación de estados inválida.",
  );
  const hasFilter = (id: "active" | "paused" | "delivery" | "effective") =>
    filters?.includes(id) ?? false;
  const selectionIds = (name: string) => {
    const raw = params.get(name) ?? "";
    const ids = [...new Set(raw.split(",").filter(Boolean))];
    demand(
      raw.length <= 4100 &&
        ids.length <= 100 &&
        ids.every((id) => /^\d{1,40}$/.test(id)),
      "Selección de elementos inválida.",
    );
    return ids;
  };
  const summarySelection =
    params.get("summary") === "1" ? selectionIds("summarySelection") : [];
  const analysisPeriod = params.get("analysisPeriod") ?? "today";
  demand(
    ["today", "7", "15", "30", "lifetime", "custom"].includes(analysisPeriod),
    "Periodo de análisis inválido.",
  );
  if (summarySelection.length) {
    const permitted = await db.metaAdObject.count({
      where: {
        id: { in: summarySelection },
        level,
        accountId: { in: scoped.map((a) => a.id) },
      },
    });
    demand(
      permitted === summarySelection.length,
      "Selección no autorizada.",
      404,
    );
  }
  const campaignIds = selectionIds("campaigns"),
    adsetIds = selectionIds("adsets");
  const country = params.get("country") ?? "";
  demand(
    !country || country === "__none" || isCountryCode(country),
    "País no válido.",
  );
  const where: Prisma.MetaAdObjectWhereInput = {
    accountId: { in: scoped.map((a) => a.id) },
    level,
    ...(country ? { aliasCountry: country === "__none" ? null : country } : {}),
    ...(params.get("alias") === "__none"
      ? { aliasId: null }
      : params.get("alias")
        ? { aliasId: params.get("alias")!.slice(0, 80) }
        : {}),
    // A recent import must not display thousands of unrelated legacy catalogue rows.
    AND: [
      {
        OR: scoped.map((a) => {
          const run = (
            a.syncState as {
              lastRun?: { plan?: string; since?: string; until?: string };
            }
          ).lastRun;
          const state = a.syncState as { plan?: string; started?: unknown };
          // Cancelled/never-started runs have no started date. Preserve the saved selection/history.
          const cutoff =
            a.selectionSince ??
            (state.plan === "focus" &&
            typeof state.started === "string" &&
            Number.isFinite(Date.parse(state.started))
              ? new Date(state.started)
              : null);
          return {
            accountId: a.id,
            ...(cutoff ? { selectedAt: { gte: cutoff } } : {}),
            ...(run?.plan === "activity" && run.since && run.until
              ? {
                  daily: {
                    some: {
                      day: { gte: run.since, lte: run.until },
                      scope: "7d_click,1d_view|impression",
                    },
                  },
                }
              : {}),
          };
        }),
      },
    ],
    ...(campaignIds.length
      ? { campaignId: { in: campaignIds } }
      : campaign
        ? { campaignId: campaign }
        : {}),
    ...(adsetIds.length
      ? { adsetId: { in: adsetIds } }
      : adset
        ? { adsetId: adset }
        : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(hasFilter("active") ? { status: "ACTIVE" } : {}),
    ...(hasFilter("effective") ? { effectiveStatus: "ACTIVE" } : {}),
    ...(hasFilter("paused")
      ? {
          OR: [
            { status: "PAUSED" },
            { effectiveStatus: "PAUSED" },
            { effectiveStatus: "CAMPAIGN_PAUSED" },
            { effectiveStatus: "ADSET_PAUSED" },
          ],
        }
      : {}),
    ...(state === "issues"
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
    include: { alias: { select: { id: true, name: true } } },
    take: 10001,
  });
  const limited = objects.length > 10000;
  const visible = objects.slice(0, 10000);
  if (!visible.length)
    return {
      items: [],
      total: 0,
      page: 1,
      limited,
      ...(params.get("summary") === "1"
        ? {
            summary: await metaSummary(
              [],
              scoped,
              "today",
              null,
              null,
              summarySelection.length > 0,
            ),
          }
        : {}),
    };
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
  const totals = await db.metaAdTotal.findMany({
    where: {
      objectId: { in: visible.map((o) => o.id) },
      accountId: { in: scoped.map((a) => a.id) },
      scope: "7d_click,1d_view|impression",
    },
  });
  const totalMap = new Map(totals.map((t) => [t.objectId, t]));
  const measure = params.get("metric") ?? "";
  demand(
    ["", "MESSAGES", "LEADS", "PURCHASES", "LINK_CLICKS", "UNKNOWN"].includes(
      measure,
    ),
    "Tipo de resultado inválido.",
  );
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
  demand(
    analysisPeriod !== "custom" || (!!customSince && !!customUntil),
    "Selecciona fechas de análisis.",
  );
  const accountContext = new Map(
    scoped.map((a) => {
      const today = localDay(a.timezone);
      const stale =
        !!a.syncedAt &&
        (localDay(a.timezone, a.syncedAt) !== today ||
          (focusedReportDay(a.syncState) ?? today) < today);
      const version = createHash("sha256")
        .update(
          JSON.stringify([a.connectionId, a.syncedAt, a.syncState, a.timezone]),
        )
        .digest("hex");
      return [
        a.id,
        {
          account: a,
          today,
          stale,
          version,
          ranges: {
            today: { since: today, until: today },
            "7": { since: shiftDay(today, -6), until: today },
            "15": { since: shiftDay(today, -14), until: today },
            "30": { since: shiftDay(today, -29), until: today },
            previous7: {
              since: shiftDay(today, -14),
              until: shiftDay(today, -8),
            },
            complete7: {
              since: shiftDay(today, -7),
              until: shiftDay(today, -1),
            },
          },
        },
      ];
    }),
  );
  const sums = await insightSummaries(
    visible.map((o) => ({ id: o.id, accountId: o.accountId })),
    [...accountContext].map(([id, a]) => ({
      id,
      today: a.today,
      version: a.version,
    })),
    customSince,
    customUntil,
  );
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
    const context = accountContext.get(o.accountId)!;
    const a = context.account,
      c = parentMap.get(o.campaignId ?? ""),
      s = parentMap.get(o.adsetId ?? ""),
      metric = metricFor(
        measure || a.metric,
        o.objective ?? c?.objective,
        o.optimizationGoal ?? s?.optimizationGoal,
      ),
      today = context.today,
      stats = map.get(o.id) ?? [],
      first = stats[0]?.first ?? null,
      last = stats[0]?.last ?? null;
    const stale = context.stale;
    const total = totalMap.get(o.id);
    const focused =
      !!a.selectionSince || (a.syncState as { plan?: string }).plan === "focus";
    const reportUntil = focusedReportDay(a.syncState) ?? today;
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
        const v =
            key === "lifetime" && total
              ? { ...total, spend: Number(total.spend) }
              : stats.find((r) => r.key === key),
          actions = (v?.actions ?? {}) as Record<string, number>,
          action = actionTypes[metric]?.find((k) => Object.hasOwn(actions, k)),
          results = action ? actions[action] : 0,
          spend = v?.spend ?? 0;
        const state =
          !a.syncedAt ||
          metric === "UNKNOWN" ||
          (focused &&
            key !== "lifetime" &&
            !!o.selectedAt &&
            (!a.syncedAt || o.selectedAt > a.syncedAt) &&
            stats.length === 0) ||
          (key === "today" && stale) ||
          (focused && key === "lifetime" && !total) ||
          (focused &&
            key === "custom" &&
            (customSince! < shiftDay(reportUntil, -29) ||
              customUntil! > reportUntil))
            ? "UNAVAILABLE"
            : results > 0
              ? "RESULTS"
              : spend > 0
                ? "NO_RESULTS"
                : "INACTIVE";
        const range =
          key === "lifetime"
            ? {
                since: total?.since ?? a.historyFrom ?? first ?? today,
                until: total?.until ?? today,
              }
            : key === "custom"
              ? { since: customSince!, until: customUntil! }
              : context.ranges[key as keyof typeof context.ranges];
        return [
          key,
          {
            spend,
            impressions: v?.impressions ?? 0,
            results,
            cost: state === "RESULTS" ? spend / results : null,
            state,
            since: range.since,
            until: range.until,
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
    if (stale) rating = "STALE";
    return {
      ...o,
      stale,
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
      ageFromCreation: !!o.createdTime,
      ageDays: o.createdTime
        ? dayCount(localDay(a.timezone, o.createdTime), today)
        : first
          ? dayCount(first, today)
          : null,
      activeDays: stats[0]?.active ?? 0,
      historyUpdatedAt: total?.updatedAt ?? null,
      historyPending: focused && (!total || total.until < reportUntil),
      historyPartial:
        !total ||
        (!!o.createdTime && total.since > localDay(a.timezone, o.createdTime)),
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
  if (hasFilter("delivery"))
    items = items.filter(
      (o) => o.periods.today.impressions > 0 || o.periods.today.spend > 0,
    );

  if (params.get("currency"))
    items = items.filter((o) => o.currency === params.get("currency"));
  if (params.get("rating") === "alerts")
    items = items.filter((o) =>
      ["CRITICAL", "WATCH", "DETERIORATING", "STALE"].includes(o.rating),
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
            o.stale ||
            (o.periods[sort] ?? o.periods["7"]).results < o.minResults ||
            (o.periods[sort] ?? o.periods["7"]).cost === null,
        ).length
      : 0;
  if (params.get("ranking") === "1")
    items = items.filter(
      (o) =>
        !o.stale &&
        (o.periods[sort] ?? o.periods["7"]).results >= o.minResults &&
        (o.periods[sort] ?? o.periods["7"]).cost !== null,
    );
  let summary;
  if (params.get("summary") === "1") {
    const computedFilters =
      state === "campaign-active" ||
      hasFilter("delivery") ||
      !!params.get("rating") ||
      !!age ||
      params.get("ranking") === "1";
    // Full catalogue scope can exceed the table's safety cap. Only derived filters need its calculated rows.
    let refs =
      limited && !computedFilters
        ? await db.metaAdObject.findMany({
            where,
            select: {
              id: true,
              accountId: true,
              level: true,
              campaignId: true,
            },
          })
        : items;
    if (params.get("currency"))
      refs = refs.filter(
        (o) =>
          scoped.find((a) => a.id === o.accountId)?.currency ===
          params.get("currency"),
      );
    if (summarySelection.length)
      refs = refs.filter((o) => summarySelection.includes(o.id));
    summary = await metaSummary(
      refs,
      scoped,
      analysisPeriod,
      customSince,
      customUntil,
      summarySelection.length > 0,
      limited && computedFilters,
    );
  }
  if (summary) {
    // Independent of report dates and pagination; unique campaign parents only.
    let refs = limited
      ? await db.metaAdObject.findMany({
          where,
          select: { id: true, level: true, campaignId: true },
        })
      : items;
    if (summarySelection.length)
      refs = refs.filter((o) => summarySelection.includes(o.id));
    const campaignIds = [
      ...new Set(
        refs
          .map((o) => (o.level === "campaign" ? o.id : o.campaignId))
          .filter((id): id is string => !!id),
      ),
    ];
    summary.sales = await metaRegisteredSales(actor, campaignIds, salesSince);
  }
  items.sort((a, b) => compareMetaItems(a, b, sort, direction));
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1)),
    limit = Math.max(10, Math.min(100, Number(params.get("limit")) || 25));
  return {
    items: items.slice((page - 1) * limit, page * limit),
    total: items.length,
    page,
    limited,
    excludedForRanking,
    ...(summary ? { summary } : {}),
    attribution: "7 días clic / 1 día vista · fecha de impresión",
    note: "Datos de hoy parciales. Histórico disponible; no se garantiza toda la vida del anuncio. Rankings separados por moneda y resultado.",
  };
}
