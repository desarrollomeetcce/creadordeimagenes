import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { ownerOnly } from "./auth";
import { demand } from "./errors";
import { recordActivity } from "./activity";
type Actor = { id: string; role: string };
export const planCodes = [
  "INICIO",
  "CRECIMIENTO",
  "EMPRESA",
  "ILIMITADO",
] as const;
export function membershipMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return new Date(`${get("year")}-${get("month")}-01T05:00:00.000Z`);
}
const view = <T extends { monthlyAIMicros: bigint | null }>(p: T) => ({
  ...p,
  monthlyAIMicros: p.monthlyAIMicros?.toString() ?? null,
});
export async function plansCatalog(internal = false) {
  return (
    await db.membershipPlan.findMany({
      where: internal
        ? { archivedAt: null }
        : {
            isPublic: true,
            customUserId: null,
            archivedAt: null,
            NOT: { id: "ILIMITADO" },
          },
      ...(internal
        ? { include: { customUser: { select: { email: true, name: true } } } }
        : {}),
      orderBy: { priceCents: "asc" },
    })
  ).map(view);
}
export async function checkPlanAllowance(
  tx: Prisma.TransactionClient,
  actorId: string,
  count: number,
  reserve: bigint,
  now = new Date(),
  checkAIBudget = true,
) {
  const user = await tx.user.findUnique({
    where: { id: actorId },
    include: { plan: true },
  });
  demand(
    user && user.status === "APPROVED",
    "La cuenta no está aprobada.",
    403,
  );
  // Las cuentas existentes conservan su acceso hasta que OWNER les asigne un plan.
  if (user.role === "OWNER" || !user.plan) return;
  demand(
    !user.planValidUntil || user.planValidUntil > now,
    "Tu plan ha vencido. Revisa Mi plan o contacta al OWNER.",
    403,
  );
  const since = membershipMonth(now);
  const usage = await tx.$queryRaw<
    { images: bigint; micros: bigint }[]
  >`SELECT count(*)::bigint AS images, COALESCE(sum(GREATEST("reservedMicros",COALESCE("actualMicros",0))),0)::bigint AS micros FROM "UsageLedger" WHERE "actorId"=${actorId} AND "createdAt">=${since} AND status <> 'RELEASED'`;
  const current = usage[0];
  demand(
    user.plan.monthlyImages === null ||
      current.images + BigInt(count) <= BigInt(user.plan.monthlyImages),
    `Tu plan ${user.plan.name} permite ${user.plan.monthlyImages} imágenes al mes. Revisa Mi plan.`,
    403,
  );
  demand(
    !checkAIBudget || user.plan.monthlyAIMicros === null ||
      current.micros + reserve <= user.plan.monthlyAIMicros,
    `Se supera el presupuesto mensual de IA de tu plan ${user.plan.name}. Revisa Mi plan.`,
    403,
  );
}
export async function membershipStatus(actor: Actor) {
  const u = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    include: { plan: true },
  });
  const usage = await db.usageLedger.aggregate({
    where: {
      actorId: actor.id,
      createdAt: { gte: membershipMonth() },
      status: { not: "RELEASED" },
    },
    _count: true,
    _sum: { reservedMicros: true, actualMicros: true },
  });
  return {
    plan: u.plan ? view(u.plan) : null,
    validUntil: u.planValidUntil,
    ownerExempt: u.role === "OWNER",
    images: usage._count,
    reservedMicros: (usage._sum.reservedMicros ?? 0n).toString(),
    actualMicros: usage._sum.actualMicros?.toString() ?? null,
    periodStart: membershipMonth(),
  };
}
async function requireOwner(tx: Prisma.TransactionClient, actor: Actor) {
  ownerOnly(actor);
  const u = await tx.user.findUnique({
    where: { id: actor.id },
    select: { role: true, status: true },
  });
  demand(
    u?.role === "OWNER" && u.status === "APPROVED",
    "La autorización cambió.",
    403,
  );
}
export async function assignPlan(actor: Actor, id: string, input: unknown) {
  ownerOnly(actor);
  const b = z
    .object({
      planId: z.string().min(1).max(100).nullable(),
      validUntil: z.iso.datetime().nullable().optional(),
    })
    .strict()
    .parse(input);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await requireOwner(tx, actor);
    demand(
      await tx.user.findUnique({ where: { id }, select: { id: true } }),
      "Usuario no encontrado.",
      404,
    );
    if (b.planId) {
      const p = await tx.membershipPlan.findUnique({ where: { id: b.planId } });
      demand(p && !p.archivedAt, "Plan no disponible.", 404);
      demand(
        !p.customUserId || p.customUserId === id,
        "Este plan personalizado pertenece a otra cuenta.",
        403,
      );
    }
    const old = await tx.user.findUniqueOrThrow({
      where: { id },
      select: { planId: true },
    });
    await tx.user.update({
      where: { id },
      data: {
        planId: b.planId,
        planValidUntil: b.validUntil ? new Date(b.validUntil) : null,
      },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "PLAN_ASIGNADO",
        resourceId: id,
        detail: {
          plan: b.planId ?? "SIN_PLAN",
          previousPlan: old.planId ?? "SIN_PLAN",
        },
      },
    });
  });
  return { saved: true };
}
export async function updatePlan(actor: Actor, id: string, input: unknown) {
  ownerOnly(actor);
  const b = z
    .object({
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(500),
      priceCents: z.number().int().min(0).max(10000000),
      monthlyImages: z.number().int().min(1).max(1000000).nullable(),
      monthlyAIMicros: z
        .string()
        .regex(/^\d{1,15}$/)
        .transform(BigInt)
        .nullable(),
    })
    .strict()
    .parse(input);
  demand(
    id === "ILIMITADO" ||
      (b.monthlyImages !== null &&
        b.monthlyAIMicros !== null &&
        b.monthlyAIMicros > 0n),
    "Los planes públicos necesitan límites.",
  );
  demand(
    id !== "ILIMITADO" ||
      (b.monthlyImages === null && b.monthlyAIMicros === null),
    "Ilimitado debe conservar cuotas ilimitadas.",
  );
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await requireOwner(tx, actor);
    demand(
      await tx.membershipPlan.findUnique({ where: { id } }),
      "Plan no encontrado.",
      404,
    );
    const current = await tx.membershipPlan.findUniqueOrThrow({
      where: { id },
    });
    demand(!current.archivedAt, "El plan fue retirado.", 409);
    await tx.membershipPlan.update({
      where: { id },
      data: {
        ...b,
        description: current.customUserId ? "" : b.description,
        isPublic: !current.customUserId && id !== "ILIMITADO",
      },
    });
    await recordActivity(tx, {
      data: { actorId: actor.id, action: "PLAN_ACTUALIZADO", resourceId: id },
    });
  });
  return { saved: true };
}

export async function createCustomPlan(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z
        .email()
        .max(200)
        .transform((v) => v.toLowerCase()),
      priceCents: z.number().int().min(0).max(10000000),
      monthlyImages: z.number().int().min(1).max(1000000),
      monthlyAIMicros: z
        .string()
        .regex(/^\d{1,15}$/)
        .transform(BigInt),
    })
    .strict()
    .parse(input);
  demand(b.monthlyAIMicros > 0n, "Introduce un presupuesto mayor que cero.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await requireOwner(tx, actor);
    const user = await tx.user.findUnique({
      where: { email: b.email },
      select: { id: true, status: true, role: true },
    });
    demand(
      user,
      "No existe una cuenta con ese correo. Créala primero en Usuarios.",
      404,
    );
    demand(
      user.status === "APPROVED" && user.role !== "OBSERVER",
      "Selecciona una cuenta aprobada que pueda generar imágenes.",
    );
    const plan = await tx.membershipPlan.create({
      data: {
        id: "CUSTOM_" + randomUUID(),
        name: b.name,
        description: "",
        priceCents: b.priceCents,
        monthlyImages: b.monthlyImages,
        monthlyAIMicros: b.monthlyAIMicros,
        isPublic: false,
        customUserId: user.id,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { planId: plan.id, planValidUntil: null },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "PLAN_PERSONALIZADO_CREADO",
        resourceId: plan.id,
        detail: { plan: b.name, recipientId: user.id },
      },
    });
    return { saved: true, id: plan.id };
  });
}
export async function archivePlan(actor: Actor, id: string) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await requireOwner(tx, actor);
    const plan = await tx.membershipPlan.findUnique({ where: { id } });
    demand(plan, "Plan no encontrado.", 404);
    if (plan.archivedAt) return { archived: true };
    await tx.membershipPlan.update({
      where: { id },
      data: { archivedAt: new Date(), isPublic: false },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "PLAN_RETIRADO",
        resourceId: id,
        detail: { plan: plan.name },
      },
    });
    return { archived: true };
  });
}
export async function purchasablePlans(actor: Actor) {
  const rows = await db.membershipPlan.findMany({
    where: {
      archivedAt: null,
      priceCents: { gt: 0 },
      NOT: { id: "ILIMITADO" },
      OR: [{ isPublic: true, customUserId: null }, { customUserId: actor.id }],
    },
    orderBy: { priceCents: "asc" },
  });
  return rows.map(view);
}
