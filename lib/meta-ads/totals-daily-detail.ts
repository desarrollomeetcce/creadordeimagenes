import { db } from "../db";
import { ownerOnly } from "../auth";
import type { Actor } from "./service";
import { effectiveness } from "./effectiveness";
import { sumEffectivenessDay } from "./effectiveness-total-values";
import { advisorSalesPlan } from "./advisor-sales-plan";
import { manualBaseAllocationsSchema } from "./manual-base-policy";

/** Read the same effective cells as Totales, without changing assignments or sources. */
export async function totalsDailyDetail(
  actor: Actor,
  q: { tableId: string; country: string; currency: string; day: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      const [sheet, assignments, approvals, base, advisorBase] =
        await Promise.all([
          effectiveness(actor, q.tableId, q.day, q.day, tx),
          tx.metaAdvisorAssignment.findMany({
            where: { alias: { tableId: q.tableId }, country: q.country },
          }),
          tx.metaAdvisorSalesApproval.findMany({
            where: {
              row: { alias: { tableId: q.tableId }, country: q.country },
              day: q.day,
            },
            include: { row: { select: { aliasId: true } } },
          }),
          tx.metaManualBaseDay.findFirst({
            where: { tableId: q.tableId, country: q.country, day: q.day },
          }),
          tx.metaAdvisorBaseDay.findFirst({
            where: { tableId: q.tableId, country: q.country, day: q.day },
          }),
        ]);
      const people = new Map<
        string | null,
        {
          advisorId: string | null;
          sales: number | null;
          partial: boolean;
          na: boolean;
          manualBase: number | null;
          advisorBase: number | null;
        }
      >();
      const person = (advisorId: string | null) => {
        if (!people.has(advisorId))
          people.set(advisorId, {
            advisorId,
            sales: null,
            manualBase: null,
            advisorBase: null,
            partial: false,
            na: false,
          });
        return people.get(advisorId)!;
      };
      if (base?.state === "VALUE")
        for (const entry of manualBaseAllocationsSchema.parse(base.allocations))
          person(entry.advisorId).manualBase = entry.quantity;
      if (advisorBase?.state === "VALUE")
        for (const entry of manualBaseAllocationsSchema.parse(
          advisorBase.allocations,
        ))
          person(entry.advisorId).advisorBase = entry.quantity;
      const products = sheet.rows
        .filter((r) => r.country === q.country && r.currency === q.currency)
        .map((r) => {
          const c = r.days[q.day];
          const plan = advisorSalesPlan(
            r.advisorId,
            assignments.filter((a) => a.aliasId === r.aliasId),
            q.day,
            c?.sales ?? null,
            !!c?.na.includes("sales"),
            approvals.find((a) => a.row.aliasId === r.aliasId),
          );
          for (const portion of plan.portions) {
            const p = person(portion.advisorId);
            p.na ||= portion.na;
            if (portion.sales !== null && !portion.na)
              p.sales = (p.sales ?? 0) + portion.sales;
            p.partial ||=
              portion.partial ||
              (!portion.na && portion.sales === null) ||
              !!c?.partialMetrics.includes("sales");
          }
          return {
            aliasId: r.aliasId,
            name:
              sheet.table.aliases.find((a) => a.id === r.aliasId)?.name ??
              "Inventario",
            active: r.active,
            sums: sumEffectivenessDay([r], q.day),
          };
        });
      const names = new Map(
        (
          await tx.metaAdvisor.findMany({
            where: {
              id: {
                in: [...people.keys()].filter(
                  (id): id is string => id !== null,
                ),
              },
            },
            select: { id: true, name: true },
          })
        ).map((p) => [p.id, p.name]),
      );
      return {
        ...q,
        baseState: base?.state ?? null,
        advisorBaseState: advisorBase?.state ?? null,
        advisors: [...people.values()]
          .map((p) => ({
            ...p,
            name: p.advisorId
              ? (names.get(p.advisorId) ?? "Asesor no disponible")
              : "Sin asesor / sin distribuir",
          }))
          .sort(
            (a, b) =>
              (b.sales ?? -1) - (a.sales ?? -1) || a.name.localeCompare(b.name),
          ),
        products,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
export type TotalsDailyData = Awaited<ReturnType<typeof totalsDailyDetail>>;
