import { salesAllocationsSchema } from "./advisor-sales-plan";
import { limaDay } from "./advisor-attribution";
import { db } from "../db";
import {ownerOnly} from "./financial-access";
import { demand } from "../errors";
import type { Actor } from "./service";
import {
  advisorAssignmentPeriods,
  salesDayPeriodId,
  type AssignmentPeriod,
} from "./advisor-periods";
export type AdvisorPeriodView = AssignmentPeriod & {
  tableId: string;
  tableName: string;
  aliasId: string;
  alias: string;
  country: string;
  advisorName: string;
  nextAdvisorName: string | null;
  kind: "ASSIGNMENT" | "SALES_DAY";
  recordedSales?: number;
};
export async function advisorPeriodHistory(
  actor: Actor,
  b: { tableId: string; advisorId: string; aliasId?: string; country?: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      demand(
        await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
        "Asesor no disponible.",
        404,
      );
      const tables = await tx.metaAliasTable.findMany({
        where: b.tableId === "all" ? {} : { id: b.tableId },
        select: { id: true, name: true },
      });
      demand(
        b.tableId === "all" || tables.length === 1,
        "Hoja no disponible.",
        404,
      );
      if (b.aliasId)
        demand(
          await tx.metaAlias.findFirst({
            where: { id: b.aliasId, tableId: { in: tables.map((t) => t.id) } },
          }),
          "Inventario no disponible en estas hojas.",
          404,
        );
      const where = {
        ...(b.aliasId ? { aliasId: b.aliasId } : {}),
        ...(b.country ? { country: b.country } : {}),
        alias: { tableId: { in: tables.map((t) => t.id) } },
      };
      const [rows, changes, people] = await Promise.all([
        tx.metaEffectivenessRow.findMany({
          where: { ...where, legacy: false, hidden: false, currency: "" },
          select: {
            id: true,
            aliasId: true,
            country: true,
            advisorId: true,
            alias: { select: { name: true, tableId: true } },
          },
        }),
        tx.metaAdvisorAssignment.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 10001,
        }),
        tx.metaAdvisor.findMany({
          select: { id: true, name: true, sheet: { select: { name: true } } },
        }),
      ]);
      demand(
        changes.length <= 10000,
        "El historial supera10000 cambios. Elige un inventario y país.",
      );
      const asOf = new Date(),
        names = new Map(
          people.map((p) => [
            p.id,
            p.name +
              (people.filter((x) => x.name === p.name).length > 1
                ? " · " + p.sheet.name
                : ""),
          ]),
        );
      const periods: AdvisorPeriodView[] = [];
      for (const row of rows) {
        if (!row.country) continue;
        for (const p of advisorAssignmentPeriods(
          row.advisorId,
          changes.filter(
            (e) => e.aliasId === row.aliasId && e.country === row.country,
          ),
          asOf,
        )) {
          if (!(b.aliasId && b.country) && p.advisorId !== b.advisorId)
            continue;
          periods.push({
            ...p,
            kind: "ASSIGNMENT",
            tableId: row.alias.tableId,
            tableName: tables.find((t) => t.id === row.alias.tableId)!.name,
            aliasId: row.aliasId,
            alias: row.alias.name,
            country: row.country,
            advisorName: names.get(p.advisorId) ?? "Asesor no disponible",
            nextAdvisorName: p.nextAdvisorId
              ? (names.get(p.nextAdvisorId) ?? "Asesor no disponible")
              : null,
          });
        }
      }
      const daily = await tx.metaAdvisorSalesApproval.findMany({
        where: {
          rowId: { in: rows.map((r) => r.id) },
          day: { lte: limaDay(asOf) },
        },
        orderBy: [{ day: "desc" }],
        take: 10001,
      });
      demand(
        daily.length <= 10000,
        "Hay más de10000 repartos diarios. Elige un inventario y país.",
      );
      for (const entry of daily) {
        const row = rows.find((r) => r.id === entry.rowId)!;
        const allocations = salesAllocationsSchema.safeParse(entry.allocations);
        if (!allocations.success) continue;
        for (const allocation of allocations.data) {
          if (
            !allocation.advisorId ||
            (!(b.aliasId && b.country) && allocation.advisorId !== b.advisorId)
          )
            continue;
          if (
            periods.some(
              (p) =>
                p.kind === "ASSIGNMENT" &&
                p.aliasId === row.aliasId &&
                p.country === row.country &&
                p.advisorId === allocation.advisorId &&
                p.since &&
                p.since <= entry.day &&
                p.through >= entry.day,
            )
          )
            continue;
          periods.push({
            id: salesDayPeriodId(row.id, entry.day, allocation.advisorId),
            kind: "SALES_DAY",
            advisorId: allocation.advisorId,
            advisorName:
              names.get(allocation.advisorId) ?? "Asesor no disponible",
            from: entry.day + "T00:00:00-05:00",
            until: new Date(
              Date.parse(entry.day + "T00:00:00-05:00") + 86400000,
            ).toISOString(),
            since: entry.day,
            through: entry.day,
            nextAdvisorId: null,
            nextAdvisorName: null,
            recordedSales: allocation.sales,
            tableId: row.alias.tableId,
            tableName: tables.find((t) => t.id === row.alias.tableId)!.name,
            aliasId: row.aliasId,
            alias: row.alias.name,
            country: row.country,
          });
        }
      }
      periods.sort(
        (a, b) =>
          (b.from ? Date.parse(b.from) : -Infinity) -
            (a.from ? Date.parse(a.from) : -Infinity) ||
          a.id.localeCompare(b.id),
      );
      return { periods, asOf: asOf.toISOString() };
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
