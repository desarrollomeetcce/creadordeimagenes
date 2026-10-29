import { z } from "zod";
import { db } from "../db";
import argon2 from "argon2";
import { rateLimit } from "../auth";
import { performanceManager, isPerformanceManager } from "./performance-access";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import type { Prisma } from "@prisma/client";
async function performanceLock(tx: Prisma.TransactionClient, actor: Actor) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
  await performanceManager(actor, tx);
}
import { managerAdvisorSheet, personalAdvisorSheet } from "./advisors";
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
  await performanceManager(actor);
  const [people, accounts] = await Promise.all([
    db.metaAdvisor.findMany({
      where: { sheet: { archivedAt: null } },
      select: {
        id: true,
        name: true,
        sheet: { select: { name: true, archivedAt: true } },
        portal: { select: { userId: true, revision: true } },
        targets: true,
        goals: {
          where: {
            since: { lte: localDay("America/Lima") },
            until: { gte: shiftDay(localDay("America/Lima"), -1) },
          },
          select: {
            id: true,
            basis: true,
            percent: true,
            salesTarget: true,
            revision: true,
            since: true,
            until: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    db.user.findMany({
      where: {
        status: "APPROVED",
        role: { in: ["ADVISOR", "USER", "OBSERVER"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        advisorPortal: { select: { advisorId: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  await performanceManager(actor);
  return { people, accounts };
}
export async function savePortalLink(actor: Actor, input: unknown) {
  await performanceManager(actor);
  const b = portalLinkSchema.parse(input);
  return db.$transaction(async (tx) => {
    await performanceLock(tx, actor);
    demand(
      await tx.metaAdvisor.findFirst({
        where: { id: b.advisorId, sheet: { archivedAt: null } },
      }),
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
          where: {
            id: b.userId,
            status: "APPROVED",
            role: { in: ["ADVISOR", "USER", "OBSERVER"] },
          },
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
  await performanceManager(actor);
  const b = advisorGoalSchema.parse(input);
  return db.$transaction(async (tx) => {
    await performanceLock(tx, actor);
    demand(
      await tx.metaAdvisor.findFirst({
        where: { id: b.advisorId, sheet: { archivedAt: null } },
      }),
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
  await performanceManager(actor);
  const b = z
    .object({
      id: z.string().min(1).max(100),
      revision: z.number().int().positive(),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    await performanceLock(tx, actor);
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
  const manager = await isPerformanceManager(actor);
  let advisorId = q.advisorId;
  if (!manager) {
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
  const person = await db.metaAdvisor.findFirst({
    where: { id: advisorId, sheet: { archivedAt: null } },
    select: { id: true, name: true },
  });
  demand(person, "Asesor no disponible.", 404);
  const read = (from: string, to: string) =>
    personalAdvisorSheet(actor, advisorId!, from, to);
  // Current two days are always queried independently of the optional history range.
  const comparisonSince = shiftDay(today, -2);
  const current = await read(comparisonSince, today);
  const historical =
    since === comparisonSince && until === today
      ? current
      : await read(since, until);
  // Revalidate the binding after the reads as well; a revoked account cannot receive a stale response.
  if (!manager)
    demand(
      await db.metaAdvisorPortal.findFirst({
        where: { advisorId, userId: actor.id },
      }),
      "El acceso a este asesor cambió.",
      403,
    );
  if (manager) await performanceManager(actor);
  const targets = await db.metaAdvisorTarget.findMany({ where: { advisorId } });
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
      target = targets.find((t) => t.basis === basis),
      legacy =
        goals.find(
          (g) => g.basis === basis && g.since <= day && g.until >= day,
        ) ?? null,
      goal = target
        ? target.percent === null
          ? null
          : {
              id: "target:" + advisorId + ":" + basis,
              advisorId: advisorId!,
              basis,
              percent: target.percent,
              salesTarget: target.salesTarget,
              since: "",
              until: "",
              revision: target.revision,
              updatedAt: target.updatedAt,
            }
        : legacy;
    const previousDay = shiftDay(day, -1),
      previous = daily(current, previousDay);
    const previousBase = basis === "BC" ? previous.bc : previous.bm;
    return {
      ...d,
      basis,
      base,
      previousDay,
      previousPercent:
        basis === "BM" && previous.partial
          ? null
          : performanceRatio(previous.sales, previousBase, 100),
      previousPartial: previous.partial,
      percent:
        basis === "BM" && d.partial
          ? null
          : performanceRatio(d.sales, base, 100),
      goal,
      salesTarget: target ? target.salesTarget : (legacy?.salesTarget ?? null),
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

const targetSchema = z
  .object({
    advisorId: z.string().min(1).max(100),
    targets: z
      .array(
        z
          .object({
            basis: z.enum(["BC", "BM"]),
            percent: z.number().finite().min(0).max(100).nullable(),
            salesTarget: z.number().int().min(1).max(100000000).nullable(),
            revision: z.number().int().min(0),
          })
          .strict(),
      )
      .length(2),
  })
  .strict()
  .refine(
    (b) => new Set(b.targets.map((t) => t.basis)).size === 2,
    "Incluye BC y BM una sola vez.",
  );
export async function saveAdvisorTargets(actor: Actor, input: unknown) {
  await performanceManager(actor);
  const b = targetSchema.parse(input);
  return db.$transaction(async (tx) => {
    await performanceLock(tx, actor);
    demand(
      await tx.metaAdvisor.findFirst({
        where: { id: b.advisorId, sheet: { archivedAt: null } },
      }),
      "Asesor no disponible.",
      404,
    );
    const rows = [];
    for (const t of b.targets) {
      const key = { advisorId: b.advisorId, basis: t.basis };
      const old = await tx.metaAdvisorTarget.findUnique({
        where: { advisorId_basis: key },
      });
      demand(
        (old?.revision ?? 0) === t.revision,
        "Las metas cambiaron. Actualiza antes de guardar.",
        409,
      );
      rows.push(
        await tx.metaAdvisorTarget.upsert({
          where: { advisorId_basis: key },
          create: { ...key, percent: t.percent, salesTarget: t.salesTarget },
          update: {
            percent: t.percent,
            salesTarget: t.salesTarget,
            revision: { increment: 1 },
          },
        }),
      );
    }
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "ASESOR_METAS_DIARIAS_GUARDADAS",
        resourceId: b.advisorId,
        detail: { bases: b.targets.map((t) => t.basis) },
      },
    });
    return { targets: rows };
  });
}
export async function createAdvisorAccess(actor: Actor, input: unknown) {
  await performanceManager(actor);
  const b = z
    .object({
      advisorId: z.string().min(1).max(100),
      revision: z.number().int().min(0),
      email: z
        .string()
        .trim()
        .pipe(z.email().max(200))
        .transform((v) => v.toLowerCase()),
      password: z.string().min(12).max(128),
    })
    .strict()
    .parse(input);
  await rateLimit("advisor-account-create:" + actor.id, 30);
  const passwordHash = await argon2.hash(b.password, { type: argon2.argon2id });
  return db.$transaction(async (tx) => {
    await performanceLock(tx, actor);
    const person = await tx.metaAdvisor.findFirst({
      where: { id: b.advisorId, sheet: { archivedAt: null } },
    });
    demand(person, "Asesor no disponible.", 404);
    const old = await tx.metaAdvisorPortal.findUnique({
      where: { advisorId: b.advisorId },
    });
    demand(
      (old?.revision ?? 0) === b.revision,
      "El vínculo cambió. Actualiza antes de guardar.",
      409,
    );
    demand(
      !old?.userId,
      "Desvincula la cuenta anterior antes de crear otra.",
      409,
    );
    demand(
      !(await tx.user.findFirst({
        where: { email: { equals: b.email, mode: "insensitive" } },
      })),
      "Ya existe una cuenta con ese correo. Selecciónala en las cuentas existentes.",
      409,
    );
    const user = await tx.user.create({
      data: {
        name: person.name,
        email: b.email,
        passwordHash,
        role: "ADVISOR",
        status: "APPROVED",
      },
      select: { id: true, email: true, name: true },
    });
    await tx.metaAdvisorPortal.upsert({
      where: { advisorId: b.advisorId },
      create: { advisorId: b.advisorId, userId: user.id },
      update: { userId: user.id, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "ASESOR_CUENTA_CREADA",
        resourceId: b.advisorId,
        detail: { userId: user.id },
      },
    });
    return { user };
  });
}
export async function performanceTeam(actor: Actor) {
  await performanceManager(actor);
  const today = localDay("America/Lima"),
    yesterday = shiftDay(today, -1),
    settings = await performanceSettings(actor),
    byPerson = new Map<
      string,
      {
        today: {
          day: string;
          sales: number | null;
          base: number | null;
          percent: number | null;
          partial: boolean;
          na: boolean;
        };
        yesterday: {
          day: string;
          sales: number | null;
          base: number | null;
          percent: number | null;
          partial: boolean;
          na: boolean;
        };
      }
    >();
  // Read all active advisors together, independent of their tab. No per-person queries.
  const sheet = await managerAdvisorSheet(actor, yesterday, today, "all");
  for (const row of sheet.rows) {
    const card = (day: string, basis: "BC" | "BM") => {
      const d = row.days[day];
      const base = basis === "BC" ? d?.advisorBase : d?.manualBase;
      return {
        day,
        sales: d?.na ? null : (d?.sales ?? null),
        base: base ?? null,
        percent:
          basis === "BM" && d?.partial
            ? null
            : performanceRatio(
                d?.na ? null : (d?.sales ?? null),
                base ?? null,
                100,
              ),
        partial: !!d?.partial,
        na: !!d?.na,
      };
    };
    byPerson.set(row.id, {
      today: card(today, "BC"),
      yesterday: card(yesterday, "BM"),
    });
  }
  await performanceManager(actor);
  return {
    ...settings,
    today,
    yesterday,
    people: settings.people.map((p) => ({ ...p, ...byPerson.get(p.id) })),
  };
}
export type PerformanceTeam = Awaited<ReturnType<typeof performanceTeam>>;
