import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { personalAdvisorSheet } from "./advisors";
import { localDay, shiftDay } from "./analytics";
import { isPerformanceManager } from "./performance-access";
import { performanceMetaGoal } from "./advisor-performance";
import { advisorGoalStatus } from "./advisor-motivation";
import { performanceRatio } from "./performance-metrics";
import type { Actor } from "./service";

const id = z.string().min(1).max(100);
const range = z.object({
  since: z.string().date(),
  until: z.string().date(),
  advisorId: id.optional(),
});
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

export async function advisorPeriodSignals(actor: Actor, input: unknown) {
  const { since, until, advisorId: requested } = range.parse(input);
  rangeCheck(since, until);
  const advisorId = await advisorFor(actor, requested);
  const today = localDay("America/Lima");
  const yesterday = shiftDay(today, -1);
  const historical = since > yesterday || until < today;
  const [current, notes, daily, goal, target] = await Promise.all([
    personalAdvisorSheet(actor, advisorId, since, until, true),
    db.metaAdvisorPeriodNote.findMany({
      where: { advisorId, day: { gte: since, lte: until } },
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
    }),
    !requested && historical
      ? personalAdvisorSheet(actor, advisorId, yesterday, today)
      : null,
    requested ? null : performanceMetaGoal(),
    requested
      ? null
      : db.metaAdvisorTarget.findUnique({
          where: { advisorId_basis: { advisorId, basis: "B" } },
          select: { salesTarget: true },
        }),
  ]);
  const summary = (day: string) => {
    const source = daily ?? current;
    const row = source.rows[0]?.days[day];
    const base = source.performanceMetaBase?.[day];
    const sales = row?.na ? null : (row?.sales ?? null);
    const partial = !!(row?.partial || base?.partial);
    return {
      percent: performanceRatio(sales, base?.value ?? null, 100),
      partial,
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
    performance: requested
      ? null
      : {
          advisorName: current.rows[0]?.name ?? null,
          goal: goal?.percent ?? null,
          salesTarget: target?.salesTarget ?? null,
          today: summary(today),
          yesterday: summary(yesterday),
        },
    items: current.breakdown.map(
      ({ tableId, aliasId, country, tableName, alias, days }) => {
        const product = { tableId, aliasId, country };
        return {
          ...product,
          key: same(product),
          table: tableName,
          name: alias,
          signal: periodSignal(Object.values(days)),
          cacStatus: current.inventoryStatus[same(product)] ?? "PENDING",
          notes: notes
            .filter((note) => same(note) === same(product))
            .map(({ id, day, body }) => ({ id, day, body })),
        };
      },
    ),
  };
}

export async function addAdvisorPeriodNote(actor: Actor, input: unknown) {
  const note = range
    .omit({ advisorId: true })
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
  const advisorId = await advisorFor(actor);
  const scoped = await personalAdvisorSheet(
    actor,
    advisorId,
    note.since,
    note.until,
  );
  demand(
    scoped.breakdown.some(
      (row) => same(row) === same(note) && Object.hasOwn(row.days, note.day),
    ),
    "El diplomado no está asignado a tu ficha para esa fecha.",
    403,
  );
  return db.$transaction(async (tx) => {
    const link = await tx.metaAdvisorPortal.findFirst({
      where: { userId: actor.id, advisorId },
    });
    demand(link, "El acceso al asesor cambió.", 403);
    const { since: _since, until: _until, ...data } = note;
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
