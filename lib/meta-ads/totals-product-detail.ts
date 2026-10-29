import { db } from "../db";
import {ownerOnly} from "./financial-access";
import type { Actor } from "./service";
import { effectiveness } from "./effectiveness";
import { advisorSalesPlan } from "./advisor-sales-plan";
import { sumEffectivenessDay } from "./effectiveness-total-values";
import type { TotalProductReport } from "./totals-product-summary";
/** One bounded read for all products and their sellers in an exact financial block. */
export async function totalsProductDetail(
  actor: Actor,
  q: {
    tableId: string;
    country: string;
    currency: string;
    since: string;
    until: string;
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      const [sheet, assignments, approvals] = await Promise.all([
        effectiveness(actor, q.tableId, q.since, q.until, tx),
        tx.metaAdvisorAssignment.findMany({
          where: { alias: { tableId: q.tableId }, country: q.country },
        }),
        tx.metaAdvisorSalesApproval.findMany({
          where: {
            row: { alias: { tableId: q.tableId }, country: q.country },
            day: { gte: q.since, lte: q.until },
          },
          include: { row: { select: { aliasId: true } } },
        }),
      ]);
      const history = new Map<string, typeof assignments>();
      for (const a of assignments) {
        const rows = history.get(a.aliasId) ?? [];
        rows.push(a);
        history.set(a.aliasId, rows);
      }
      const approved = new Map(
        approvals.map((a) => [JSON.stringify([a.row.aliasId, a.day]), a]),
      );
      const dates: string[] = [];
      for (
        let at = Date.parse(q.since);
        at <= Date.parse(q.until);
        at += 86400000
      )
        dates.push(new Date(at).toISOString().slice(0, 10));
      const ids = new Set<string>(),
        names = new Map(sheet.table.aliases.map((a) => [a.id, a.name]));
      const products: TotalProductReport[] = sheet.rows
        .filter((r) => r.country === q.country && r.currency === q.currency)
        .map((row) => ({
          aliasId: row.aliasId,
          name: names.get(row.aliasId) ?? "Inventario",
          active: row.active,
          days: Object.fromEntries(
            dates.map((day) => {
              const c = row.days[day],
                plan = advisorSalesPlan(
                  row.advisorId,
                  history.get(row.aliasId) ?? [],
                  day,
                  c?.sales ?? null,
                  !!c?.na.includes("sales"),
                  approved.get(JSON.stringify([row.aliasId, day])),
                );
              const advisors = plan.portions
                .filter((p) => p.sales !== null || p.na)
                .map((p) => {
                  if (p.advisorId) ids.add(p.advisorId);
                  return {
                    advisorId: p.advisorId,
                    name: "",
                    sales: p.sales,
                    na: p.na,
                    partial:
                      p.partial ||
                      plan.status === "PENDING" ||
                      !!c?.partialMetrics.includes("sales"),
                  };
                });
              return [day, { sums: sumEffectivenessDay([row], day), advisors }];
            }),
          ),
        }));
      const people = new Map(
        (
          await tx.metaAdvisor.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, name: true },
          })
        ).map((p) => [p.id, p.name]),
      );
      for (const p of products)
        for (const d of Object.values(p.days))
          for (const a of d.advisors)
            a.name = a.advisorId
              ? (people.get(a.advisorId) ?? "Asesor no disponible")
              : "Sin asesor / sin distribuir";
      return { ...q, products };
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
