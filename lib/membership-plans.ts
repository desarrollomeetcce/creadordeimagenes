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
const view = (p: { monthlyAIMicros: bigint | null }) => ({
  ...p,
  monthlyAIMicros: p.monthlyAIMicros?.toString() ?? null,
});
export async function plansCatalog(internal = false) {
  return (
    await db.membershipPlan.findMany({
      where: internal ? {} : { isPublic: true, NOT: { id: "ILIMITADO" } },
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
    user.plan.monthlyAIMicros === null ||
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
      planId: z.enum(planCodes).nullable(),
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
    if (b.planId)
      demand(
        await tx.membershipPlan.findUnique({ where: { id: b.planId } }),
        "Plan no encontrado.",
        404,
      );
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
    await tx.membershipPlan.update({
      where: { id },
      data: { ...b, isPublic: id !== "ILIMITADO" },
    });
    await recordActivity(tx, {
      data: { actorId: actor.id, action: "PLAN_ACTUALIZADO", resourceId: id },
    });
  });
  return { saved: true };
}
