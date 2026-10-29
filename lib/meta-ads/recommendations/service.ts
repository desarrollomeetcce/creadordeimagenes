import {
  metaEditorOnly,
  metaEditorUserWhere,
  metaCanSync,
} from "../workspace-access";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../../db";
import { demand } from "../../errors";
import { ownerOnly } from "../../auth";
import { recordActivity } from "../../activity";
import { accountWhere, access, type Actor } from "../service";
import { localDay, shiftDay, dayCount } from "../analytics";
import { focusedReportDay } from "../focused-labels";
import type { SourceState } from "./source";
import { syncProgress } from "../sync-progress";
import {
  analyzeCampaign,
  defaultRules,
  ENGINE_VERSION,
  type Fact,
} from "./engine";

const scope = "7d_click,1d_view|impression";
const action = "onsite_conversion.messaging_conversation_started_7d";
export const rulesSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    dayNoResultSpend: z.number().positive().max(100000),
    dayMaxCost: z.number().positive().max(100000),
    favorableCost: z.number().positive().max(100000),
    contextCost: z.number().positive().max(100000),
    reviewCost: z.number().positive().max(100000),
    newHours: z.number().int().min(1).max(168),
    unspentAmount: z.number().positive().max(100000),
    minSpend: z.number().positive().max(100000),
    minResults: z.number().int().min(1).max(10000),
    deteriorationPercent: z.number().min(5).max(500),
    windowDays: z.number().int().min(2).max(7),
    recentDays: z.number().int().min(7).max(30),
    idealPerAdset: z.number().int().min(1).max(20),
    minimumPerCampaign: z.number().int().min(1).max(20),
    cacheMinutes: z.number().int().min(1).max(60),
  })
  .strict()
  .refine(
    (v) =>
      v.favorableCost <= v.contextCost &&
      v.contextCost < v.reviewCost &&
      v.recentDays >= 2 * v.windowDays,
    "Revisa bandas de costo y ventanas históricas.",
  );
export async function getRules(actor: Actor) {
  const accounts = await db.metaAdAccount.findMany({
    where: await accountWhere(actor),
    select: { currency: true },
    distinct: ["currency"],
  });
  const rows = await db.metaRecommendationRules.findMany({
    where: { currency: { in: accounts.map((a) => a.currency) } },
  });
  return {
    defaults: defaultRules,
    currencies: accounts.map((a) => ({
      currency: a.currency,
      rules:
        rows.find((r) => r.currency === a.currency)?.values ??
        (a.currency === "PEN" ? defaultRules : null),
    })),
  };
}
export async function saveRules(actor: Actor, value: unknown) {
  await metaEditorOnly(actor);
  const rules = rulesSchema.parse(value);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: metaEditorUserWhere(actor.id),
      }),
      "Sin permiso para configurar recomendaciones.",
      403,
    );
    await tx.metaRecommendationRules.upsert({
      where: { currency: rules.currency },
      create: { currency: rules.currency, values: rules },
      update: { values: rules },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_REGLAS_RECOMENDACIONES",
        resourceId: rules.currency,
        detail: { version: ENGINE_VERSION },
      },
    });
    return { ok: true };
  });
}
function ids(params: URLSearchParams, name: string) {
  const raw = params.get(name) ?? "";
  const values = [...new Set(raw.split(",").filter(Boolean))];
  demand(
    raw.length <= 4100 &&
      values.length <= 100 &&
      values.every((v) => /^\d{1,40}$/.test(v)),
    "Selección inválida.",
  );
  return values;
}
export async function campaignList(actor: Actor, params: URLSearchParams) {
  const accounts = ids(params, "accounts"),
    campaigns = ids(params, "campaigns");
  if (accounts.length)
    demand(
      (await db.metaAdAccount.count({
        where: { AND: [await accountWhere(actor), { id: { in: accounts } }] },
      })) === accounts.length,
      "Cuenta no autorizada.",
      404,
    );
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(params.get("page") ?? 1);
  const where: Prisma.MetaAdObjectWhereInput = {
    level: "campaign",
    account: {
      AND: [
        await accountWhere(actor),
        ...(accounts.length ? [{ id: { in: accounts } }] : []),
      ],
    },
    ...(campaigns.length
      ? { id: { in: campaigns } }
      : params.get("allStates") === "1"
        ? {}
        : { effectiveStatus: "ACTIVE" }),
    AND: [
      {
        OR: [{ status: null }, { status: { notIn: ["DELETED", "ARCHIVED"] } }],
      },
    ],
  };
  if (campaigns.length)
    demand(
      (await db.metaAdObject.count({ where })) === campaigns.length,
      "Campaña no disponible en las cuentas seleccionadas.",
      404,
    );
  const [rows, total] = await Promise.all([
    db.metaAdObject.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        accountId: true,
        account: { select: { name: true, currency: true } },
      },
      orderBy: [{ accountId: "asc" }, { id: "asc" }],
      skip: (page - 1) * 10,
      take: 10,
    }),
    db.metaAdObject.count({ where }),
  ]);
  return { items: rows, total, page };
}
export async function campaignAnalysis(
  actor: Actor,
  campaignId: string,
  force = false,
  mode: "night" | "day" = "night",
) {
  const campaign = await db.metaAdObject.findFirst({
    where: {
      id: campaignId,
      level: "campaign",
      account: await accountWhere(actor),
    },
  });
  demand(campaign, "Campaña no disponible.", 404);
  const a = await access(actor, campaign.accountId),
    now = new Date(),
    today = localDay(a.timezone, now);
  const saved = await db.metaRecommendationRules.findUnique({
    where: { currency: a.currency },
  });
  const rules = saved
    ? rulesSchema.parse(saved.values)
    : a.currency === "PEN"
      ? defaultRules
      : null;
  const where: Prisma.MetaAdObjectWhereInput = {
    accountId: a.id,
    OR: [{ id: campaign.id }, { campaignId: campaign.id }],
    AND: [
      {
        OR: [{ status: null }, { status: { notIn: ["DELETED", "ARCHIVED"] } }],
      },
    ],
  };
  const [objects, changed, totalsChanged, source] = await Promise.all([
    db.metaAdObject.findMany({
      where,
      include: { alias: { select: { id: true, name: true } } },
      take: 5002,
      orderBy: { id: "asc" },
    }),
    db.metaAdDaily.aggregate({
      where: { accountId: a.id, object: { campaignId: campaign.id }, scope },
      _max: { updatedAt: true },
      _count: true,
    }),
    db.metaAdTotal.aggregate({
      where: { accountId: a.id, object: { campaignId: campaign.id }, scope },
      _max: { updatedAt: true },
      _count: true,
    }),
    db.metaRecommendationSource.findUnique({ where: { campaignId } }),
  ]);
  demand(
    objects.length <= 5001,
    "Esta campaña supera 5000 elementos. Divide el análisis por campañas más pequeñas; no se emite un análisis parcial.",
    422,
  );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        ENGINE_VERSION,
        source,
        mode,
        today,
        rules,
        a.connectionId,
        a.connection.revision,
        a.connection.verifiedAt,
        a.connection.disconnectedAt,
        a.syncState,
        a.syncedAt,
        a.syncError,
        a.enabled,
        changed,
        totalsChanged,
        objects,
        Math.floor(now.valueOf() / 300000),
      ]),
    )
    .digest("hex");
  const cached = await db.metaRecommendationAnalysis.findUnique({
    where: { key: `${mode}:${campaignId}` },
  });
  if (!force && cached?.fingerprint === fingerprint && cached.expiresAt > now) {
    await access(actor, a.id);
    return {
      ...(cached.payload as object),
      canReadFromMeta: await metaCanSync(actor, a.grants),
      computedAt: cached.computedAt.toISOString(),
      expiresAt: cached.expiresAt.toISOString(),
      cached: true,
    };
  }
  const ads = objects.filter((o) => o.level === "ad"),
    adIds = ads.map((o) => o.id);
  const [facts, totals] = await Promise.all([
    adIds.length
      ? db.$queryRaw<{ objectId: string; rows: Fact[] }[]>(
          Prisma.sql`SELECT "objectId",jsonb_agg(jsonb_build_object('day',day,'spend',spend::float8,'results',COALESCE((actions->>${action})::float8,0)) ORDER BY day) rows FROM "MetaAdDaily" WHERE "accountId"=${a.id} AND "objectId" IN (${Prisma.join(adIds)}) AND scope=${scope} AND day BETWEEN ${shiftDay(today, -29)} AND ${today} GROUP BY "objectId"`,
        )
      : [],
    db.metaAdTotal.findMany({
      where: { accountId: a.id, objectId: { in: adIds }, scope },
    }),
  ]);
  const factMap = new Map(facts.map((f) => [f.objectId, f.rows]));
  const totalMap = new Map(totals.map((t) => [t.objectId, t]));
  const progress = syncProgress(a),
    state = source?.state as SourceState | undefined;
  const scopedReady =
    !!source &&
    source.accountId === a.id &&
    source.connectionId === a.connectionId &&
    source.revision === a.connection.revision &&
    !!state &&
    state.phase >= 4 &&
    state.until === today &&
    !!state.dailyAt;
  const coverage =
    scopedReady ||
    (progress.inventory === "all" &&
      progress.recentReady &&
      !a.syncError &&
      !!a.syncedAt);
  const sourceAt = scopedReady ? new Date(state!.dailyAt!) : a.syncedAt;
  const fresh =
    !!sourceAt &&
    localDay(a.timezone, sourceAt) === today &&
    (scopedReady || focusedReportDay(a.syncState) === today) &&
    now.valueOf() - sourceAt.valueOf() <= 3600000 &&
    !!a.connection.verifiedAt &&
    !a.connection.disconnectedAt;
  const confirmedIds = scopedReady
    ? new Set([campaignId, ...state!.adIds, ...state!.setIds])
    : null;
  const confirmed = (o: typeof campaign) =>
    confirmedIds
      ? confirmedIds.has(o.id) && o.seenAt >= new Date(state!.started)
      : !!o.selectedAt &&
        (!a.selectionSince || o.selectedAt >= a.selectionSince);
  const group = (o: typeof campaign) => ({
    id: o.id,
    name: o.name,
    status: o.status,
    effectiveStatus: o.effectiveStatus,
    confirmed: confirmed(o),
  });
  const inputAds = ads.map((o) => {
    const t = totalMap.get(o.id);
    return {
      id: o.id,
      name: o.name,
      confirmed: confirmed(o),
      adsetId: o.adsetId,
      status: o.status,
      effectiveStatus: o.effectiveStatus,
      createdTime: o.createdTime?.toISOString() ?? null,
      daily: factMap.get(o.id) ?? [],
      total: t
        ? {
            spend: Number(t.spend),
            results: Number((t.actions as Record<string, number>)[action] ?? 0),
            since: t.since,
            until: t.until,
          }
        : null,
    };
  });
  const analysis = analyzeCampaign(
    {
      campaign: group(campaign),
      adsets: objects.filter((o) => o.level === "adset").map(group),
      ads: inputAds,
      today,
      now: now.toISOString(),
      currency: a.currency,
      coverage,
      fresh,
      mode,
    },
    rules,
  );
  const decisionMap = new Map(
    [...analysis.adsets.flatMap((s) => s.ads), ...analysis.orphanAds].map(
      (d) => [d.id, d],
    ),
  );
  const objectMap = new Map(objects.map((o) => [o.id, o]));
  const items = ads.map((o) => {
    const d = decisionMap.get(o.id)!,
      f = factMap.get(o.id) ?? [],
      t = totalMap.get(o.id),
      set = objectMap.get(o.adsetId ?? "");
    const periods = Object.fromEntries(
      ["today", "7", "15", "30", "lifetime"].map((key) => {
        const s = d.periods[key];
        const available =
          key === "lifetime"
            ? !!t
            : (coverage && fresh && confirmed(o)) || s.days > 0;
        return [
          key,
          {
            ...s,
            state: !available
              ? "UNAVAILABLE"
              : key !== "lifetime" && (!coverage || !fresh || !confirmed(o))
                ? "PARTIAL"
                : s.results > 0
                  ? "RESULTS"
                  : s.spend > 0
                    ? "NO_RESULTS"
                    : "INACTIVE",
            since:
              key === "lifetime"
                ? (t?.since ?? today)
                : shiftDay(today, key === "today" ? 0 : 1 - Number(key)),
            until: key === "lifetime" ? (t?.until ?? today) : today,
          },
        ];
      }),
    );
    const first = f.find((r) => r.spend > 0)?.day ?? null;
    return {
      ...o,
      createdTime: o.createdTime?.toISOString() ?? null,
      scheduledStart: o.scheduledStart?.toISOString() ?? null,
      seenAt: o.seenAt.toISOString(),
      status: confirmed(o) ? (o.status ?? "UNKNOWN") : "UNKNOWN",
      effectiveStatus: confirmed(o)
        ? (o.effectiveStatus ?? "UNKNOWN")
        : "UNKNOWN",
      campaignId: campaign.id,
      adsetId: o.adsetId ?? "",
      campaignName: campaign.name,
      adsetName: set?.name ?? "Conjunto no disponible",
      accountName: a.name,
      currency: a.currency,
      timezone: a.timezone,
      businessName: a.businessName,
      metric: "MESSAGES",
      metricName: "Conversaciones con mensajes iniciadas",
      periods,
      firstDelivery: first,
      lastDelivery: f.filter((r) => r.spend > 0).at(-1)?.day ?? null,
      ageDays: o.createdTime
        ? dayCount(localDay(a.timezone, o.createdTime), today)
        : null,
      ageFromCreation: !!o.createdTime,
      activeDays: f.filter((r) => r.spend > 0).length,
      historyPartial: !t,
      historyPending: !t,
      historyUpdatedAt: t?.updatedAt.toISOString() ?? null,
      syncedAt: sourceAt?.toISOString() ?? null,
      changePercent: null,
      rating: !fresh
        ? "STALE"
        : d.periods["7"].results >= a.minResults
          ? "ENOUGH_DATA"
          : "INSUFFICIENT",
      pausedCandidate: false,
    };
  });
  const payload = {
    analysis,
    items,
    accountId: a.id,
    accountName: a.name,
    timezone: a.timezone,
    rules,
    coverage,
    fresh,
    parameters: { version: ENGINE_VERSION, rules, attribution: scope },
    dataOrigin: {
      source: scopedReady
        ? "Lectura directa de Meta de esta campaña"
        : "Estadísticas sincronizadas de la cuenta",
      since: scopedReady ? state!.since : shiftDay(today, -29),
      until: today,
      inventoryComplete: coverage,
      fresh,
      historyComplete: scopedReady
        ? state!.phase === 5
        : totals.length === ads.length,
      readableAds: ads.length,
      todayWithRows: inputAds.filter((o) =>
        o.daily.some((d) => d.day === today),
      ).length,
      missingTotals: ads.length - totals.length,
      error: source && state?.error ? state.error : a.syncError,
      attribution: scope,
    },
    canReadFromMeta: await metaCanSync(actor, a.grants),
    sourceUpdatedAt: sourceAt?.toISOString() ?? null,
  };
  const expiresAt = new Date(
    Math.min(
      now.valueOf() + (rules?.cacheMinutes ?? 15) * 60000,
      ...(fresh && sourceAt ? [sourceAt.valueOf() + 3600000] : []),
      ...inputAds
        .filter(
          (ad) =>
            ad.createdTime &&
            now.valueOf() <
              Date.parse(ad.createdTime) + (rules?.newHours ?? 24) * 3600000,
        )
        .map(
          (ad) =>
            Date.parse(ad.createdTime!) + (rules?.newHours ?? 24) * 3600000,
        ),
    ),
  );
  await access(actor, a.id);
  await db.metaRecommendationAnalysis.upsert({
    where: { key: `${mode}:${campaignId}` },
    create: {
      key: `${mode}:${campaignId}`,
      campaignId,
      fingerprint,
      parameters: JSON.parse(JSON.stringify(payload.parameters)),
      payload: JSON.parse(JSON.stringify(payload)),
      expiresAt,
    },
    update: {
      fingerprint,
      parameters: JSON.parse(JSON.stringify(payload.parameters)),
      payload: JSON.parse(JSON.stringify(payload)),
      computedAt: now,
      expiresAt,
    },
  });
  return {
    ...payload,
    computedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    cached: false,
  };
}
