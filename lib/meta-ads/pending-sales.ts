import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import {
  authorizeFinancialRequest,
  financialAccess,
  scopePermission,
} from "./financial-access";
import { localDay, shiftDay } from "./analytics";
import { isCountryCode } from "./countries";
import { effectivenessLock } from "./effectiveness";
import {
  applyAdvisorSalesApproval,
  reviewAdvisorSalesCell,
} from "./advisor-sales-approval";
import type { Actor } from "./service";

const id = z.string().min(1).max(100);
const entry = z
  .object({
    id: z.string().uuid(),
    tableId: id,
    aliasId: id,
    advisorId: id,
    country: z.string().refine(isCountryCode),
    day: z.string().date(),
    customer: z.string().trim().min(2).max(180),
  })
  .strict();
const authorize = (actor: Actor, tableId: string) =>
  authorizeFinancialRequest(
    actor,
    "effectiveness/advisor-sales",
    "POST",
    new URLSearchParams({ tableId }),
    null,
    "TABLE:" + tableId,
  );

export async function pendingSales(actor: Actor, input: URLSearchParams) {
  const month = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(input.get("month") ?? localDay("America/Lima").slice(0, 7));
  const selected = input.get("table");
  const access = await financialAccess(actor);
  const all = scopePermission(access, "ALL") === "EDIT";
  const ids = access.grants
    .filter((g) => g.scope.startsWith("TABLE:") && g.permission === "EDIT")
    .map((g) => g.scope.slice(6));
  demand(
    all || ids.length,
    "Necesitas acceso de edición a una hoja de Ventas.",
    403,
  );
  const tables = await db.metaAliasTable.findMany({
    where: all ? {} : { id: { in: ids } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, defaultCountry: true },
  });
  demand(
    !selected || tables.some((t) => t.id === selected),
    "Hoja no disponible.",
    403,
  );
  const today = localDay("America/Lima");
  const pending = await db.metaPendingSale.findMany({
    where: {
      tableId: { in: tables.map((t) => t.id) },
      day: { gte: month + "-01", lte: month + "-31" },
      approvedAt: null,
    },
    orderBy: [{ day: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const [aliases, advisors] = await Promise.all([
    db.metaAlias.findMany({
      where: {
        OR: [
          { id: { in: pending.map((row) => row.aliasId) } },
          ...(selected ? [{ tableId: selected }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        tableId: true,
        effectivenessRows: {
          where: { hidden: false, legacy: false },
          select: { country: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.metaAdvisor.findMany({
      where: { sheet: { archivedAt: null } },
      select: { id: true, name: true, sheet: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const tableMap = new Map(tables.map((t) => [t.id, t]));
  const diploma = new Map(aliases.map((a) => [a.id, a.name]));
  const people = new Map(advisors.map((p) => [p.id, p.name]));
  return {
    month,
    tables,
    advisors,
    aliases: aliases
      .filter((a) => a.tableId === selected)
      .map((a) => ({
        id: a.id,
        name: a.name,
        countries: [
          ...new Set(
            [
              tableMap.get(a.tableId)?.defaultCountry,
              ...a.effectivenessRows.map((r) => r.country),
            ].filter((code): code is string => Boolean(code)),
          ),
        ],
      })),
    rows: pending.map(
      ({ id, day, customer, country, aliasId, advisorId, tableId }) => ({
        id,
        day,
        customer,
        country,
        advisor: people.get(advisorId) ?? "Asesor archivado",
        diploma: diploma.get(aliasId) ?? "Diplomado archivado",
        table: tableMap.get(tableId)?.name,
        overdue: day < shiftDay(today, -14),
      }),
    ),
  };
}

export async function createPendingSale(actor: Actor, input: unknown) {
  const data = entry.parse(input);
  const scoped = await authorize(actor, data.tableId);
  demand(
    data.day <= localDay("America/Lima"),
    "La fecha del pendiente aún no ha llegado.",
  );
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, scoped);
      demand(
        await tx.metaAlias.findFirst({
          where: {
            id: data.aliasId,
            tableId: data.tableId,
            inventorySheet: { archivedAt: null },
          },
        }),
        "Diplomado no disponible.",
        404,
      );
      const reviewed = await reviewAdvisorSalesCell(
        tx,
        scoped,
        data.aliasId,
        data.country,
        data.day,
      );
      demand(
        reviewed.advisors.some((p) => p.id === data.advisorId),
        "Asesor no disponible.",
        404,
      );
      const existing = await tx.metaPendingSale.findUnique({
        where: { id: data.id },
      });
      if (existing) {
        demand(
          existing.createdBy === actor.id &&
            Object.entries(data).every(
              ([key, value]) => Reflect.get(existing, key) === value,
            ),
          "Este registro ya existe.",
          409,
        );
        return { id: existing.id };
      }
      return tx.metaPendingSale.create({
        data: { ...data, createdBy: actor.id },
        select: { id: true },
      });
    },
    { timeout: 60000 },
  );
}

export async function confirmPendingSale(actor: Actor, input: unknown) {
  const { id: pendingId } = z
    .object({ id: z.string().uuid() })
    .strict()
    .parse(input);
  const pending = await db.metaPendingSale.findUnique({
    where: { id: pendingId },
  });
  demand(pending, "No se encontró el pendiente.", 404);
  const scoped = await authorize(actor, pending.tableId);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, scoped);
      const row = await tx.metaPendingSale.findUniqueOrThrow({
        where: { id: pendingId },
      });
      if (row.approvedAt) return { ok: true };
      demand(
        await tx.metaAlias.findFirst({
          where: {
            id: row.aliasId,
            tableId: row.tableId,
            inventorySheet: { archivedAt: null },
          },
        }),
        "La hoja del pendiente cambió.",
        409,
      );
      const old = await reviewAdvisorSalesCell(
        tx,
        scoped,
        row.aliasId,
        row.country,
        row.day,
      );
      demand(
        !old.na &&
          !old.linked &&
          old.status !== "PENDING" &&
          old.allocations.reduce((sum, p) => sum + (p.sales ?? 0), 0) ===
            (old.total ?? 0),
        "Revisa el reparto de ventas de esa fecha antes de confirmar el pago.",
        409,
      );
      const allocations = old.allocations
        .filter((p) => p.sales !== null)
        .map((p) => ({ advisorId: p.advisorId, sales: p.sales! }));
      const assigned = allocations.find((p) => p.advisorId === row.advisorId);
      if (assigned) assigned.sales++;
      else allocations.push({ advisorId: row.advisorId, sales: 1 });
      await applyAdvisorSalesApproval(
        tx,
        scoped,
        { ...row, token: old.token, revision: old.revision },
        allocations,
      );
      await tx.metaPendingSale.update({
        where: { id: pendingId },
        data: { approvedAt: new Date(), approvedBy: actor.id },
      });
      return { ok: true };
    },
    { timeout: 60000 },
  );
}
