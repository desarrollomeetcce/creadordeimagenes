import { reconcilePortfolioSales } from "./registered-sales";
import { pulpoDiplomaActivity } from "./pulpo-diploma-activity";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { personalAdvisorSheet, ownerProductSheet } from "./advisors";
import { localDay, shiftDay } from "./analytics";
import { isPerformanceManager, performanceManager } from "./performance-access";
import { performanceMetaGoal } from "./advisor-performance";
import { advisorGoalStatus } from "./advisor-motivation";
import { performanceRatio } from "./performance-metrics";
import { cacWindow } from "./inventory-cac-policy";
import type { Actor } from "./service";

const id = z.string().min(1).max(100);
const range = z.object({
  since: z.string().date(),
  until: z.string().date(),
  advisorId: id.optional(),
});
const productKey = z.tuple([id, id, z.string().length(2)]);
function parseProductKey(value: string) {
  try {
    return productKey.safeParse(JSON.parse(value)).data;
  } catch {
    return undefined;
  }
}
const same = (r: { aliasId: string; tableId: string; country: string }) =>
  JSON.stringify([r.tableId, r.aliasId, r.country]);
function rangeCheck(since: string, until: string) {
  demand(
    since <= until &&
      until <= localDay("America/Lima") &&
      (Date.parse(until) - Date.parse(since)) / 86400000 < 31,
    "Elige hasta 31 días de un periodo válido.",
  );
}
async function advisorFor(actor: Actor, requested?: string) {
  if (requested === "all") {
    demand(actor.role === "OWNER", "Solo el propietario puede ver todos los contactos y ventas.", 403);
    return requested;
  }
  if (requested) {
    demand(
      await isPerformanceManager(actor),
      "Solo puedes revisar tu propio desempeño.",
      403,
    );
    return requested;
  }
  const link = await db.metaAdvisorPortal.findUnique({
    where: { userId: actor.id },
    select: { advisorId: true },
  });
  demand(link, "Pide que vinculen tu cuenta a tu ficha de asesor.", 403);
  return link.advisorId;
}

export function periodSignal(
  days: readonly { sales: number | null; partial: boolean; na: boolean }[],
) {
  const known = days.filter((d) => !d.partial && !d.na && d.sales !== null);
  if (known.some((d) => d.sales! > 0)) return "active" as const;
  return known.length >= 3 ? ("critical" as const) : ("insufficient" as const);
}

export async function advisorWhatsAppActivity(actor: Actor, input: unknown) {
  const { since, until, advisorId: requested } = range.parse(input);
  rangeCheck(since, until);
  const advisorId = await advisorFor(actor, requested);
  const activity = await pulpoDiplomaActivity(actor.id, advisorId, since, until);
  demand((await advisorFor(actor, requested)) === advisorId, "El acceso al asesor cambió.", 403);
  return activity;
}

export async function advisorPeriodSignals(actor: Actor, input: unknown) {
  const {
    since,
    until,
    advisorId: requested,
    section,
    product,
  } = range
    .extend({
      section: z.enum(["summary", "products", "detail"]).optional(),
      product: z.string().max(360).optional(),
    })
    .parse(input);
  rangeCheck(since, until);
  const advisorId = await advisorFor(actor, requested);
  const today = localDay("America/Lima");
  const yesterday = shiftDay(today, -1);
  const comparisonSince = shiftDay(today, -2);
  const historical = since > comparisonSince || until < today;
  const includeProducts = section !== "summary";
  const includeSummary =
    !requested && (section === undefined || section === "summary");
  const keys = product ? parseProductKey(product) : undefined;
  demand(section !== "detail" || keys, "Elige un diplomado válido.");
  const selected = keys
    ? { tableId: keys[0], aliasId: keys[1], country: keys[2] }
    : undefined;
  const base = { since, until };
  const evaluation = section === "products" ? cacWindow(today) : base;
  const start = since < evaluation.since ? since : evaluation.since;
  const end = until > evaluation.until ? until : evaluation.until;
  const separate = Date.parse(end) - Date.parse(start) >= 44 * 86400000;
  const readSheet = (from: string, to: string, showProducts: boolean,
    periods?: Parameters<typeof personalAdvisorSheet>[5],
    selection?: Parameters<typeof personalAdvisorSheet>[6]) =>
      advisorId === "all"
        ? ownerProductSheet(actor, from, to, periods, selection)
        : personalAdvisorSheet(actor, advisorId, from, to, showProducts, periods, selection);
  const [current, notes, daily, goal, target, evaluated] = await Promise.all([
    readSheet(
      includeProducts ? (separate ? since : start) : comparisonSince,
      includeProducts ? (separate ? until : end) : today,
      includeProducts,
      includeProducts && !separate ? { base, evaluation } : undefined,
      section === "detail" ? selected : undefined,
    ),
    advisorId !== "all" && includeProducts && section !== "products"
      ? db.metaAdvisorPeriodNote.findMany({
          where: { advisorId, day: { gte: since, lte: until }, ...selected },
          orderBy: [{ day: "desc" }, { createdAt: "desc" }],
        })
      : [],
    includeProducts && includeSummary && historical
      ? personalAdvisorSheet(actor, advisorId, comparisonSince, today)
      : null,
    includeSummary ? performanceMetaGoal() : null,
    includeSummary
      ? db.metaAdvisorTarget.findUnique({
          where: { advisorId_basis: { advisorId, basis: "B" } },
          select: { salesTarget: true },
        })
      : null,
    separate
      ? readSheet(
          evaluation.since,
          evaluation.until,
          true,
        )
      : null,
  ]);
  const productSales = new Map<string, { day: string; sales: number | null; partial: boolean }[]>();
  if (section === "products" && advisorId !== "all") {
    for (const row of current.breakdown) {
      const catalog = current.inventoryStatus[same(row)]?.catalogKey;
      if (!catalog) continue;
      const key = JSON.stringify([...catalog, row.country]);
      const entries = productSales.get(key) ?? [];
      for (const [day, value] of Object.entries(row.days)) {
        if (!value.na && value.sales !== null) entries.push({ day, sales: value.sales, partial: value.partial });
      }
      productSales.set(key, entries);
    }
  }
  const summary = (day: string) => {
    const source = daily ?? current;
    const row = source.rows[0]?.days[day];
    const base = source.performanceMetaBase?.[day];
    const sales = row?.na ? null : (row?.sales ?? null);
    const partial = !!(row?.partial || base?.partial);
    return {
      percent: performanceRatio(sales, base?.value ?? null, 100),
      partial,
      awaitingSales: sales === null && !row?.na,
      dailySalesGoal: advisorGoalStatus(
        sales,
        target?.salesTarget ?? null,
        !!row?.partial,
        1,
      ),
    };
  };
  demand(
    (await advisorFor(actor, requested)) === advisorId,
    "El acceso al asesor cambió.",
    403,
  );
  return {
    since,
    until,
    evaluation,
    performance: includeSummary
      ? {
          advisorName: current.rows[0]?.name ?? null,
          goal: goal?.percent ?? null,
          salesTarget: target?.salesTarget ?? null,
          today: summary(today),
          yesterday: summary(yesterday),
          dayBeforeYesterday: summary(comparisonSince),
        }
      : null,
    items: includeProducts
      ? Array.from(
          new Map(
            [...(evaluated?.breakdown ?? []), ...current.breakdown].map(
              (row) => [same(row), row],
            ),
          ).values(),
        )
          .filter((row) => !product || same(row) === product)
          .map(({ tableId, aliasId, country, tableName, alias, days }) => {
            const identity = { tableId, aliasId, country };
            const key = same(identity);
            const entry = current.inventoryStatus[key];
            const status = (evaluated ?? current).inventoryStatus[key];
            const catalogKey = (entry ?? status)?.catalogKey ?? null;
            const matched = section === "products" && advisorId !== "all" && catalogKey
              ? reconcilePortfolioSales(productSales.get(JSON.stringify([...catalogKey, country])) ?? [], since, until)
              : null;
            const changed = (entry ?? status)?.lastStateChange;
            const changedDay = changed ? localDay("America/Lima", new Date(changed)) : null;
            const sales = Object.entries(days)
              .filter(
                ([date, day]) =>
                  date >= since &&
                  date <= until &&
                  !day.na &&
                  day.sales !== null,
              )
              .map(([, day]) => day.sales!);
            return {
              ...identity,
              key,
              table: tableName,
              name: alias,
              signal: periodSignal(Object.values(days)),
              cacStatus: status?.status ?? "PENDING",
              metaBase: entry?.base ?? null,
              metaBasePartial: entry?.basePartial ?? false,
              campaignActive:
                entry?.campaignActive ?? status?.campaignActive ?? false,
              catalogKey,
              currentAssignment: (entry ?? status)?.current === true,
              recentlyChanged: !!changedDay && changedDay >= since && changedDay <= until,
              sales: advisorId === "all" && entry
                ? entry.recordedSales
                : matched ? matched.total
                : sales.length ? sales.reduce((sum, value) => sum + value, 0) : null,
              salesPartial: matched?.partial ?? entry?.portfolioSalesPartial ?? false,
              recordedSales: matched?.partial ? null : entry?.recordedSales ?? null,
              notes: notes
                .filter((note) => same(note) === key)
                .map(({ id, day, body }) => ({ id, day, body })),
            };
          })
          .filter((item) => section !== "products" || item.currentAssignment ||
            item.recentlyChanged || (item.metaBase ?? 0) > 0 || item.salesPartial || (item.sales ?? 0) > 0 || (item.recordedSales ?? 0) > 0)
      : [],
  };
}

export async function addAdvisorPeriodNote(actor: Actor, input: unknown) {
  const note = range
    .extend({
      id: z.string().uuid(),
      aliasId: id,
      tableId: id,
      country: z.string().length(2),
      day: z.string().date(),
      body: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(input);
  rangeCheck(note.since, note.until);
  demand(
    note.day >= note.since && note.day <= note.until,
    "El comentario debe estar dentro del periodo elegido.",
  );
  const advisorId = await advisorFor(actor, note.advisorId);
  demand(advisorId !== "all", "Elige un asesor para guardar la observación.", 403);
  const scoped = await personalAdvisorSheet(
    actor,
    advisorId,
    note.since,
    note.until,
    false,
    undefined,
    { tableId: note.tableId, aliasId: note.aliasId, country: note.country },
  );
  demand(
    scoped.breakdown.some(
      (row) => same(row) === same(note) && Object.hasOwn(row.days, note.day),
    ),
    "El diplomado no está asignado a tu ficha para esa fecha.",
    403,
  );
  return db.$transaction(async (tx) => {
    if (note.advisorId) {
      await performanceManager(actor, tx);
    } else {
      const link = await tx.metaAdvisorPortal.findFirst({
        where: { userId: actor.id, advisorId },
      });
      demand(link, "El acceso al asesor cambió.", 403);
    }
    const {
      since: _since,
      until: _until,
      advisorId: _requested,
      ...data
    } = note;
    const saved = await tx.metaAdvisorPeriodNote.upsert({
      where: { id: note.id },
      update: {},
      create: { ...data, advisorId },
    });
    demand(
      saved.advisorId === advisorId &&
        same(saved) === same(note) &&
        saved.day === note.day &&
        saved.body === note.body,
      "Ya existe una observación con ese identificador.",
      409,
    );
    return { ok: true };
  });
}
