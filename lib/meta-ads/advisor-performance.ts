import { z } from "zod";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import { advisorSheet, personalAdvisorSheet } from "./advisors";
import { performanceRatio } from "./performance-metrics";
import { localDay, shiftDay } from "./analytics";
import type { Actor } from "./service";
export const performanceRange = z
  .object({
    advisorId: z.string().min(1).max(100).optional(),
    since: z.string().date().optional(),
    until: z.string().date().optional(),
  })
  .strict();
export const portalLinkSchema = z
  .object({
    advisorId: z.string().min(1).max(100),
    userId: z.string().min(1).max(100).nullable(),
    revision: z.number().int().min(0),
  })
  .strict();
export const advisorGoalSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    advisorId: z.string().min(1).max(100),
    basis: z.enum(["BC", "BM"]),
    since: z.string().date(),
    until: z.string().date(),
    percent: z.number().finite().min(0).max(100),
    salesTarget: z.number().int().min(1).max(100000000).nullable(),
    revision: z.number().int().min(0),
  })
  .strict()
  .refine((v) => v.since <= v.until, "Revisa las fechas de la meta.");
export async function performanceSettings(actor: Actor) {
  ownerOnly(actor);
  const [people, accounts] = await Promise.all([
    db.metaAdvisor.findMany({
      select: {
        id: true,
        name: true,
        sheet: { select: { name: true, archivedAt: true } },
        portal: { select: { userId: true, revision: true } },
      },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    db.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { people, accounts };
}
export async function savePortalLink(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = portalLinkSchema.parse(input);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
      "Asesor no disponible.",
      404,
    );
    const old = await tx.metaAdvisorPortal.findUnique({
      where: { advisorId: b.advisorId },
    });
    demand(
      (old?.revision ?? 0) === b.revision,
      "El vínculo cambió. Actualiza antes de guardar.",
      409,
    );
    if (b.userId) {
      demand(
        await tx.user.findFirst({
          where: { id: b.userId, status: "APPROVED" },
        }),
        "Selecciona una cuenta aprobada.",
        400,
      );
      demand(
        !(await tx.metaAdvisorPortal.findFirst({
          where: { userId: b.userId, advisorId: { not: b.advisorId } },
        })),
        "Esta cuenta ya está vinculada a otro asesor.",
        409,
      );
    }
    const row = await tx.metaAdvisorPortal.upsert({
      where: { advisorId: b.advisorId },
      create: { advisorId: b.advisorId, userId: b.userId },
      update: { userId: b.userId, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "ASESOR_ACCESO_GUARDADO",
        resourceId: b.advisorId,
        detail: { userId: b.userId },
      },
    });
    return { userId: row.userId, revision: row.revision };
  });
}
export async function saveAdvisorGoal(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = advisorGoalSchema.parse(input);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
      "Asesor no disponible.",
      404,
    );
    const old = b.id
      ? await tx.metaAdvisorGoal.findUnique({ where: { id: b.id } })
      : null;
    demand(
      b.id
        ? old?.advisorId === b.advisorId && old.revision === b.revision
        : b.revision === 0,
      "La meta cambió. Actualiza antes de guardar.",
      409,
    );
    demand(
      !(await tx.metaAdvisorGoal.findFirst({
        where: {
          advisorId: b.advisorId,
          basis: b.basis,
          since: { lte: b.until },
          until: { gte: b.since },
          ...(b.id ? { id: { not: b.id } } : {}),
        },
      })),
      "Ya existe una meta para esta base en esas fechas. Edita la existente o elige otro período.",
      409,
    );
    const data = {
      advisorId: b.advisorId,
      basis: b.basis,
      since: b.since,
      until: b.until,
      percent: b.percent,
      salesTarget: b.salesTarget,
    };
    const row = old
      ? await tx.metaAdvisorGoal.update({
          where: { id: old.id },
          data: { ...data, revision: { increment: 1 } },
        })
      : await tx.metaAdvisorGoal.create({ data });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "ASESOR_META_GUARDADA",
        resourceId: row.id,
        detail: data,
      },
    });
    return row;
  });
}
export async function deleteAdvisorGoal(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = z
    .object({
      id: z.string().min(1).max(100),
      revision: z.number().int().positive(),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    const old = await tx.metaAdvisorGoal.findUnique({ where: { id: b.id } });
    demand(
      old && old.revision === b.revision,
      "La meta cambió. Actualiza antes de eliminar.",
      409,
    );
    await tx.metaAdvisorGoal.delete({ where: { id: b.id } });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "ASESOR_META_ELIMINADA",
        resourceId: b.id,
        detail: { advisorId: old.advisorId },
      },
    });
    return { ok: true };
  });
}
export async function advisorPerformance(actor: Actor, input: unknown) {
  const q = performanceRange.parse(input),
    today = localDay("America/Lima"),
    yesterday = shiftDay(today, -1),
    since = q.since ?? shiftDay(today, -14),
    until = q.until ?? today;
  demand(
    since <= until && (Date.parse(until) - Date.parse(since)) / 86400000 < 31,
    "Elige hasta 31 días para el histórico.",
  );
  let advisorId = q.advisorId;
  if (actor.role !== "OWNER") {
    const link = await db.metaAdvisorPortal.findUnique({
      where: { userId: actor.id },
      select: { advisorId: true },
    });
    demand(
      link && (!advisorId || advisorId === link.advisorId),
      "Tu cuenta no tiene acceso a este asesor. Solicita al responsable que la vincule.",
      403,
    );
    advisorId = link.advisorId;
  }
  demand(advisorId, "Selecciona un asesor.");
  const person = await db.metaAdvisor.findUnique({
    where: { id: advisorId },
    select: { id: true, name: true },
  });
  demand(person, "Asesor no disponible.", 404);
  const read = (from: string, to: string) =>
    actor.role === "OWNER"
      ? advisorSheet(actor, "all", from, to, { advisorId })
      : personalAdvisorSheet(actor, advisorId!, from, to);
  // Current two days are always queried independently of the optional history range.
  const current = await read(yesterday, today);
  const historical =
    since === yesterday && until === today ? current : await read(since, until);
  // Revalidate the binding after the reads as well; a revoked account cannot receive a stale response.
  if (actor.role !== "OWNER")
    demand(
      await db.metaAdvisorPortal.findFirst({
        where: { advisorId, userId: actor.id },
      }),
      "El acceso a este asesor cambió.",
      403,
    );
  const goals = await db.metaAdvisorGoal.findMany({
    where: { advisorId },
    orderBy: [{ since: "desc" }, { basis: "asc" }],
    take: 1000,
  });
  const daily = (source: typeof current, day: string) => {
    const c = source.rows[0]?.days[day];
    return {
      day,
      sales: c?.na ? null : (c?.sales ?? null),
      na: !!c?.na,
      partial: !!c?.partial,
      bm: c?.manualBase ?? null,
      bc: c?.advisorBase ?? null,
      attendance: c?.status ?? null,
      hours: c?.absence.hours ?? null,
      pending: c?.absence.pending ?? 0,
    };
  };
  const card = (day: string, basis: "BC" | "BM") => {
    const d = daily(current, day),
      base = basis === "BC" ? d.bc : d.bm,
      goal =
        goals.find(
          (g) => g.basis === basis && g.since <= day && g.until >= day,
        ) ?? null;
    return {
      ...d,
      basis,
      base,
      percent: performanceRatio(d.sales, base, 100),
      goal,
    };
  };
  return {
    person,
    today: card(today, "BC"),
    yesterday: card(yesterday, "BM"),
    since,
    until,
    history: Object.keys(historical.rows[0]?.days ?? {})
      .sort()
      .map((day) => daily(historical, day)),
    products: historical.breakdown.map((s) => ({
      product: s.alias,
      sheet: s.tableName,
      country: s.country,
      days: s.days,
    })),
    goals,
  };
}
export type AdvisorPerformanceReport = Awaited<
  ReturnType<typeof advisorPerformance>
>;
