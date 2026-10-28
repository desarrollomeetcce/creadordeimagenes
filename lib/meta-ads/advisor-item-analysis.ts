import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import type { Actor } from "./service";
import { effectiveness } from "./effectiveness";
import { advisorSalesPlan } from "./advisor-sales-plan";
import type { InventorySalesEntry } from "./inventory-advisor-sales";
export async function advisorItemAnalysis(
  actor: Actor,
  b: {
    tableId: string;
    aliasId: string;
    country?: string;
    since: string;
    until: string;
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      const alias = await tx.metaAlias.findUnique({ where: { id: b.aliasId } });
      demand(
        alias && (b.tableId === "all" || alias.tableId === b.tableId),
        "Inventario no disponible.",
        404,
      );
      const [sheet, changes, approvals, people] = await Promise.all([
        effectiveness(actor, alias.tableId, b.since, b.until, tx),
        tx.metaAdvisorAssignment.findMany({
          where: {
            aliasId: b.aliasId,
            ...(b.country ? { country: b.country } : {}),
          },
        }),
        tx.metaAdvisorSalesApproval.findMany({
          where: {
            row: {
              aliasId: b.aliasId,
              ...(b.country ? { country: b.country } : {}),
            },
            day: { gte: b.since, lte: b.until },
          },
          include: { row: { select: { country: true } } },
        }),
        tx.metaAdvisor.findMany({
          select: { id: true, name: true, sheet: { select: { name: true } } },
        }),
      ]);
      const names = new Map(
        people.map((p) => [
          p.id,
          p.name +
            (people.filter((x) => x.name === p.name).length > 1
              ? " · " + p.sheet.name
              : ""),
        ]),
      );
      const daily: InventorySalesEntry[] = [];
      const sums = new Map<
        string | null,
        {
          advisorId: string | null;
          name: string;
          sales: number | null;
          known: Set<string>;
          pending: boolean;
          na: number;
        }
      >();
      for (const row of sheet.rows.filter(
        (r) =>
          r.aliasId === b.aliasId && (!b.country || r.country === b.country),
      ))
        for (
          let at = Date.parse(b.since);
          at <= Date.parse(b.until);
          at += 86400000
        ) {
          const day = new Date(at).toISOString().slice(0, 10),
            c = row.days[day],
            plan = advisorSalesPlan(
              row.advisorId,
              changes.filter((e) => e.country === row.country),
              day,
              c?.sales ?? null,
              !!c?.na.includes("sales"),
              approvals.find(
                (a) => a.row.country === row.country && a.day === day,
              ),
            );
          for (const p of plan.portions) {
            if (p.sales !== null || p.na)
              daily.push({
                day,
                country: row.country,
                advisorId: p.advisorId,
                name: p.advisorId
                  ? (names.get(p.advisorId) ?? "Asesor no disponible")
                  : "Sin asesor",
                sales: p.sales,
                na: p.na,
                partial:
                  p.partial ||
                  plan.status === "PENDING" ||
                  !!c?.partialMetrics.includes("sales"),
              });
            const sum = sums.get(p.advisorId) ?? {
              advisorId: p.advisorId,
              name: p.advisorId
                ? (names.get(p.advisorId) ?? "Asesor no disponible")
                : "Sin asesor",
              sales: null,
              known: new Set<string>(),
              pending: false,
              na: 0,
            };
            if (p.sales !== null && !p.na) {
              sum.sales = (sum.sales ?? 0) + p.sales;
              sum.known.add(day);
            }
            if (p.na) sum.na++;
            sum.pending ||=
              p.partial ||
              plan.status === "PENDING" ||
              !!c?.partialMetrics.includes("sales");
            sums.set(p.advisorId, sum);
          }
        }
      const rows = [...sums.values()]
        .filter((s) => s.known.size || s.na)
        .map((s) => ({
          ...s,
          knownDays: s.known.size,
          known: undefined,
        }))
        .sort(
          (a, b) =>
            (b.sales ?? -1) - (a.sales ?? -1) || a.name.localeCompare(b.name),
        );
      return {
        aliasId: alias.id,
        alias: alias.name,
        daily,
        rows,
        total: rows.some((r) => r.sales !== null)
          ? rows.reduce((n, r) => n + (r.sales ?? 0), 0)
          : null,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
