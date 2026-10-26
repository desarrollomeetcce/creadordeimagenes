import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectiveness, effectivenessLock } from "./effectiveness";
import {
  advisorSalesPlan,
  salesAllocationsSchema,
  type SalesAllocation,
} from "./advisor-sales-plan";
import type { Actor } from "./service";
async function review(
  tx: Prisma.TransactionClient,
  actor: Actor,
  aliasId: string,
  country: string,
  day: string,
) {
  const alias = await tx.metaAlias.findUnique({ where: { id: aliasId } });
  demand(alias, "Inventario no disponible.", 404);
  const sheet = await effectiveness(actor, alias.tableId, day, day, tx),
    row = sheet.rows.find(
      (r) => r.aliasId === aliasId && r.country === country,
    );
  demand(row, "Fila no disponible.", 404);
  const stored = await tx.metaEffectivenessRow.findUnique({
    where: { aliasId_country_currency: { aliasId, country, currency: "" } },
  });
  demand(stored && !stored.hidden, "Fila no disponible.", 404);
  const [changes, approval, advisors] = await Promise.all([
    tx.metaAdvisorAssignment.findMany({ where: { aliasId, country } }),
    tx.metaAdvisorSalesApproval.findUnique({
      where: { rowId_day: { rowId: stored.id, day } },
    }),
    tx.metaAdvisor.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const c = row.days[day],
    total = c?.sales ?? null,
    na = !!c?.na.includes("sales");
  const plan = advisorSalesPlan(
    row.advisorId,
    changes,
    day,
    total,
    na,
    approval,
  );
  demand(plan.hasChange, "No hay un cambio de asesor en esta fecha.", 409);
  const token = createHash("sha256")
    .update(
      JSON.stringify([
        aliasId,
        country,
        day,
        total,
        na,
        c?.revision ?? 0,
        changes
          .map((e) => [
            e.id,
            e.advisorId,
            e.previousAdvisorId,
            e.effectiveAt.toISOString(),
            e.cutoffSales,
          ])
          .sort(),
        approval,
      ]),
    )
    .digest("hex");
  return {
    aliasId,
    country,
    day,
    name: alias.name,
    rowId: stored.id,
    total,
    na,
    token,
    revision: plan.revision,
    status: plan.status,
    advisors,
    events: plan.events,
    activeAdvisorId: plan.activeAdvisorId,
    allocations: plan.suggestions
      .filter((p) => p.advisorId !== null || (p.sales ?? 0) > 0)
      .map((p) => ({ advisorId: p.advisorId, sales: p.sales })),
  };
}
export async function advisorSalesReview(
  actor: Actor,
  b: { aliasId: string; country: string; day: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      return review(tx, actor, b.aliasId, b.country, b.day);
    },
    { timeout: 60000 },
  );
}
export async function approveAdvisorSales(
  actor: Actor,
  b: {
    aliasId: string;
    country: string;
    day: string;
    token: string;
    revision: number;
    allocations: SalesAllocation[];
  },
) {
  ownerOnly(actor);
  const allocations = salesAllocationsSchema.parse(b.allocations);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const old = await review(tx, actor, b.aliasId, b.country, b.day);
      demand(
        old.token === b.token && old.revision === b.revision,
        "Las ventas o el reparto cambiaron. Actualiza el reparto antes de aprobar.",
        409,
      );
      demand(
        allocations.every(
          (a) =>
            a.advisorId === null ||
            old.advisors.some((p) => p.id === a.advisorId),
        ),
        "Asesor no disponible.",
        404,
      );
      const total = allocations.reduce((s, a) => s + a.sales, 0);
      demand(
        Number.isSafeInteger(total) && total <= 2147483647,
        "El total de ventas supera el límite permitido.",
      );
      const previous = await tx.metaEffectivenessDay.findUnique({
        where: { rowId_day: { rowId: old.rowId, day: b.day } },
      });
      const annotations = {
        ...((previous?.annotations as Record<string, Prisma.JsonValue>) ?? {}),
      };
      delete annotations.sales;
      await tx.metaEffectivenessDay.upsert({
        where: { rowId_day: { rowId: old.rowId, day: b.day } },
        create: {
          rowId: old.rowId,
          day: b.day,
          sales: total,
          salesOverridden: true,
          annotations: annotations as Prisma.InputJsonValue,
        },
        update: {
          sales: total,
          salesOverridden: true,
          annotations: annotations as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      const basis = {
        events: old.events,
        activeAdvisorId: old.activeAdvisorId,
      };
      const result = await tx.metaAdvisorSalesApproval.upsert({
        where: { rowId_day: { rowId: old.rowId, day: b.day } },
        create: {
          rowId: old.rowId,
          day: b.day,
          salesTotal: total,
          allocations,
          basis,
          actorId: actor.id,
        },
        update: {
          salesTotal: total,
          allocations,
          basis,
          actorId: actor.id,
          revision: { increment: 1 },
          approvedAt: new Date(),
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_REPARTO_VENTAS_APROBADO",
          resourceId: old.rowId,
          detail: {
            aliasId: b.aliasId,
            country: b.country,
            day: b.day,
            previousTotal: old.total,
            total,
            allocations,
            revision: result.revision,
          },
        },
      });
      return { ok: true, total, revision: result.revision };
    },
    { timeout: 60000 },
  );
}
