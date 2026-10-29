import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import {ownerOnly} from "./financial-access";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectiveness, effectivenessLock } from "./effectiveness";
import type { Actor } from "./service";
type Target = { aliasId: string; country: string };
type Request = {
  tableId: string;
  since: string;
  until: string;
  targets: Target[];
};
const key = (row: Target) => JSON.stringify([row.aliasId, row.country]);
async function reviewRows(
  tx: Prisma.TransactionClient,
  actor: Actor,
  request: Request,
) {
  const targets = [...request.targets].sort((a, b) =>
    key(a).localeCompare(key(b)),
  );
  demand(
    targets.length > 0 &&
      targets.length <= 1000 &&
      new Set(targets.map(key)).size === targets.length,
    "Selección de filas inválida.",
  );
  const table = await tx.metaAliasTable.findUnique({
    where: { id: request.tableId },
    select: {
      id: true,
      name: true,
      defaultCountry: true,
      defaultCurrency: true,
    },
  });
  demand(table, "Hoja no disponible.", 404);
  const aliases = await tx.metaAlias.findMany({
    where: {
      id: { in: targets.map((t) => t.aliasId) },
      tableId: request.tableId,
    },
    select: { id: true, name: true, tableId: true },
    orderBy: { id: "asc" },
  });
  demand(
    new Set(aliases.map((a) => a.id)).size ===
      new Set(targets.map((t) => t.aliasId)).size,
    "El inventario ya no pertenece a esta hoja.",
    409,
  );
  const visible = new Set(
    (
      await effectiveness(
        actor,
        request.tableId,
        request.since,
        request.until,
        tx,
      )
    ).rows.map(key),
  );
  demand(
    targets.every((t) => visible.has(key(t))),
    "Una fila cambió o ya no está disponible. Revisa la selección.",
    409,
  );
  const rows = await tx.metaEffectivenessRow.findMany({
    where: { OR: [...targets, { presentation: { OR: targets } }] },
    include: {
      days: { orderBy: { day: "asc" } },
      salesApprovals: { orderBy: { day: "asc" } },
    },
    orderBy: { id: "asc" },
  });
  const states = await tx.metaEffectivenessState.findMany({
    where: { OR: targets },
    include: { events: { orderBy: { id: "asc" } } },
    orderBy: { id: "asc" },
  });
  const history = await tx.metaAdvisorAssignment.findMany({
    where: { OR: targets },
    orderBy: { id: "asc" },
  });
  const counts = {
    rows: targets.length,
    days: rows.reduce((n, r) => n + r.days.length, 0),
    approvals: rows.reduce((n, r) => n + r.salesApprovals.length, 0),
    advisorChanges: history.length,
    events: states.reduce((n, s) => n + s.events.length, 0),
  };
  const token = createHash("sha256")
    .update(JSON.stringify({ table, targets, aliases, rows, states, history }))
    .digest("hex");
  return {
    table,
    targets,
    rows,
    counts,
    token,
    items: targets.map((t) => ({
      ...t,
      name: aliases.find((a) => a.id === t.aliasId)!.name,
    })),
  };
}
export async function previewDeleteEffectivenessRows(
  actor: Actor,
  request: Request,
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const r = await reviewRows(tx, actor, request);
      return {
        table: r.table,
        items: r.items,
        counts: r.counts,
        token: r.token,
      };
    },
    { timeout: 60000 },
  );
}
export async function deleteEffectivenessRows(
  actor: Actor,
  request: Request & { token: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const r = await reviewRows(tx, actor, request);
      demand(
        r.token === request.token,
        "Las filas cambiaron desde la revisión. Revisa de nuevo antes de eliminarlas.",
        409,
      );
      const rowIds = r.rows.map((row) => row.id);
      await tx.metaAdvisorSalesApproval.deleteMany({
        where: { rowId: { in: rowIds } },
      });
      await tx.metaEffectivenessDay.deleteMany({
        where: { rowId: { in: rowIds } },
      });
      await tx.metaAdvisorAssignment.deleteMany({ where: { OR: r.targets } });
      await tx.metaEffectivenessState.deleteMany({ where: { OR: r.targets } });
      if (rowIds.length)
        await tx.metaEffectivenessRow.updateMany({
          where: { id: { in: rowIds } },
          data: { hidden: true, advisorId: null, revision: { increment: 1 } },
        });
      // Empty hidden identities prevent original Meta facts/default rows from reappearing on the next read.
      for (const target of r.targets)
        await tx.metaEffectivenessRow.upsert({
          where: { aliasId_country_currency: { ...target, currency: "" } },
          create: {
            ...target,
            currency: "",
            displayCurrency: r.table.defaultCurrency,
            hidden: true,
            revision: 1,
          },
          update: { hidden: true, advisorId: null },
        });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_FILAS_ELIMINADAS",
          resourceId: r.table.id,
          detail: { targets: r.targets, counts: r.counts },
        },
      });
      return { ok: true, removed: r.targets.length };
    },
    { timeout: 60000 },
  );
}
