import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import { financialContext, ownerOnly } from "./financial-access";
import { isCountryCode } from "./countries";
import type { Actor } from "./service";
const id = z.string().min(1).max(100);
export const supportInput = z
  .object({
    aliasId: id,
    country: z.string().refine(isCountryCode),
    advisorId: id,
    revision: z.number().int().nonnegative(),
    since: z.string().date(),
    until: z.string().date(),
  })
  .strict();
export type SupportInput = z.infer<typeof supportInput>;
export async function addAdvisorSupportInTransaction(
  tx: Prisma.TransactionClient,
  actor: Actor,
  b: SupportInput,
) {
  await effectivenessLock(tx, actor);
  demand(
    b.since <= b.until &&
      (Date.parse(b.until) - Date.parse(b.since)) / 86400000 < 3660,
    "Elige un apoyo de hasta diez años, con fecha final.",
  );
  const alias = await tx.metaAlias.findUnique({
    where: { id: b.aliasId },
    select: { tableId: true },
  });
  const ctx = financialContext(actor);
  demand(!ctx || ctx.write, "Necesitas permiso de edición.", 403);
  demand(
    alias &&
      (!ctx || ctx.access.isOwner || ctx.tableIds.includes(alias.tableId)),
    "Diplomado fuera del documento compartido.",
    403,
  );
  const row = await tx.metaEffectivenessRow.findUnique({
    where: {
      aliasId_country_currency: {
        aliasId: b.aliasId,
        country: b.country,
        currency: "",
      },
    },
  });
  demand(
    row && !row.hidden && row.revision === b.revision,
    "La asignación cambió. Actualiza antes de añadir el apoyo.",
    409,
  );
  demand(row.advisorId, "Asigna primero al asesor titular.");
  demand(
    row.advisorId !== b.advisorId,
    "El titular ya conserva la base; elige a otra persona como apoyo.",
  );
  demand(
    await tx.metaAdvisor.findFirst({
      where: { id: b.advisorId, sheet: { archivedAt: null } },
    }),
    "Asesor no disponible.",
    404,
  );
  demand(
    !(await tx.metaAdvisorSupport.findFirst({
      where: {
        aliasId: b.aliasId,
        country: b.country,
        advisorId: b.advisorId,
        cancelledAt: null,
        since: { lte: b.until },
        until: { gte: b.since },
      },
    })),
    "Ese asesor ya tiene un apoyo que coincide con estas fechas.",
    409,
  );
  demand(
    (await tx.metaAdvisorSupport.count({
      where: { aliasId: b.aliasId, country: b.country },
    })) < 1000,
    "Máximo 1000 apoyos por diplomado y país.",
  );
  const support = await tx.metaAdvisorSupport.create({
    data: {
      aliasId: b.aliasId,
      country: b.country,
      advisorId: b.advisorId,
      since: b.since,
      until: b.until,
      actorId: actor.id,
    },
  });
  await tx.metaEffectivenessRow.update({
    where: { id: row.id },
    data: { revision: { increment: 1 } },
  });
  await recordActivity(tx, {
    data: {
      actorId: actor.id,
      action: "EFECTIVIDAD_APOYO_TEMPORAL",
      resourceId: support.id,
      detail: {
        aliasId: b.aliasId,
        country: b.country,
        advisorId: b.advisorId,
        principalId: row.advisorId,
        since: b.since,
        until: b.until,
      },
    },
  });
  return { ok: true, changed: true, supportId: support.id };
}
export async function addAdvisorSupport(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = supportInput.parse(input);
  return db.$transaction((tx) => addAdvisorSupportInTransaction(tx, actor, b), {
    timeout: 60000,
  });
}
export async function endAdvisorSupport(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = z
    .object({
      aliasId: id,
      country: z.string().refine(isCountryCode),
      supportId: id,
      revision: z.number().int().nonnegative(),
    })
    .strict()
    .parse(input);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const support = await tx.metaAdvisorSupport.findUnique({
          where: { id: b.supportId },
          include: { alias: { select: { tableId: true } } },
        }),
        ctx = financialContext(actor);
      demand(
        support &&
          support.aliasId === b.aliasId &&
          support.country === b.country &&
          (!ctx ||
            ctx.access.isOwner ||
            ctx.tableIds.includes(support.alias.tableId)),
        "Apoyo no disponible en este documento.",
        403,
      );
      demand(
        support.revision === b.revision && !support.cancelledAt,
        "El apoyo cambió. Actualiza antes de finalizar.",
        409,
      );
      await tx.metaAdvisorSupport.update({
        where: { id: support.id },
        data: { cancelledAt: new Date(), revision: { increment: 1 } },
      });
      await tx.metaEffectivenessRow.updateMany({
        where: { aliasId: b.aliasId, country: b.country, currency: "" },
        data: { revision: { increment: 1 } },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "EFECTIVIDAD_APOYO_FINALIZADO",
          resourceId: support.id,
          detail: { aliasId: b.aliasId, country: b.country },
        },
      });
      return { ok: true };
    },
    { timeout: 60000 },
  );
}
