import { advisorSalesPlan } from "./advisor-sales-plan";
import { createHash } from "node:crypto";
import {
  attributeDailySales,
  assignmentTimeline,
  limaDay,
} from "./advisor-attribution";
import {
  advisorAbsenceSchema,
  absenceClockSummary,
  absenceSummary,
  type AbsenceInput,
} from "./advisor-absence";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { accountWhere, type Actor } from "./service";
import { effectiveness, effectivenessLock } from "./effectiveness";

export async function advisors(actor: Actor) {
  return db.metaAdvisor.findMany({
    where:
      actor.role === "OWNER"
        ? {}
        : { objects: { some: { account: accountWhere(actor) } } },
    select: { id: true, name: true, revision: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
}
export async function saveAdvisor(
  actor: Actor,
  b: { id?: string; name: string; revision?: number },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    if (b.id) {
      const old = await tx.metaAdvisor.findUnique({ where: { id: b.id } });
      demand(old, "Asesor no disponible.", 404);
      demand(
        old.revision === b.revision,
        "El asesor cambió. Recarga antes de guardar.",
        409,
      );
    } else
      demand((await tx.metaAdvisor.count()) < 1000, "Máximo 1000 asesores.");
    demand(
      !(await tx.metaAdvisor.findFirst({
        where: {
          name: { equals: b.name, mode: "insensitive" },
          ...(b.id ? { id: { not: b.id } } : {}),
        },
      })),
      "Ya existe ese asesor.",
      409,
    );
    const row = b.id
      ? await tx.metaAdvisor.update({
          where: { id: b.id },
          data: { name: b.name, revision: { increment: 1 } },
        })
      : await tx.metaAdvisor.create({ data: { name: b.name } });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_ASESOR_GUARDADO",
        resourceId: row.id,
      },
    });
    return row;
  });
}
export async function assignmentReview(
  actor: Actor,
  aliasId: string,
  country: string,
  day: string,
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      return reviewAssignment(tx, actor, aliasId, country, day);
    },
    { timeout: 60000 },
  );
}
async function reviewAssignment(
  tx: import("@prisma/client").Prisma.TransactionClient,
  actor: Actor,
  aliasId: string,
  country: string,
  day: string,
) {
  const alias = await tx.metaAlias.findUnique({ where: { id: aliasId } });
  demand(alias, "Inventario no disponible.", 404);
  const sheet = await effectiveness(actor, alias.tableId, day, day, tx);
  const row = sheet.rows.find(
    (r) => r.aliasId === aliasId && r.country === country,
  );
  demand(row, "Fila no disponible.", 404);
  const changes = await tx.metaAdvisorAssignment.findMany({
    where: { aliasId, country },
    orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const cell = row.days[day];
  const sales = cell?.na.includes("sales") ? null : (cell?.sales ?? null);
  const salesApproval = await tx.metaAdvisorSalesApproval.findFirst({
    where: { row: { aliasId, country, currency: "" }, day },
  });
  const salesApprovalValid = advisorSalesPlan(
    row.advisorId,
    changes,
    day,
    sales,
    !!cell?.na.includes("sales"),
    salesApproval,
  ).reconciled;
  return {
    salesApprovalValid,
    sales,
    rowRevision: row.rowRevision,
    advisorId: row.advisorId,
    changes: changes.map((c) => ({
      ...c,
      effectiveAt: c.effectiveAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    })),
    token: createHash("sha256")
      .update(JSON.stringify([aliasId, country, day, row, changes]))
      .digest("hex"),
  };
}
export async function assignRowAdvisor(
  actor: Actor,
  b: {
    aliasId: string;
    country: string;
    advisorId: string | null;
    revision: number;
    day?: string;
    mode?: "DAY" | "CLOCK";
    time?: string;
    cutoffSales?: number;
    token?: string;
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const alias = await tx.metaAlias.findUnique({
        where: { id: b.aliasId },
        include: { table: true },
      });
      demand(alias, "Inventario no disponible.", 404);
      if (b.advisorId)
        demand(
          await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
          "Asesor no disponible.",
          404,
        );
      const where = {
        aliasId_country_currency: {
          aliasId: b.aliasId,
          country: b.country,
          currency: "",
        },
      };
      const old = await tx.metaEffectivenessRow.findUnique({ where });
      demand(
        !old?.hidden && (old?.revision ?? 0) === b.revision,
        "La fila cambió. Recarga antes de asignar.",
        409,
      );
      if ((old?.advisorId ?? null) === b.advisorId) return { ok: true };
      const day = b.day ?? limaDay(),
        mode = b.mode ?? "DAY";
      demand(mode !== "CLOCK" || !!b.time, "Indica la hora del cambio.");
      const at = new Date(
        day + "T" + (mode === "DAY" ? "00:00" : b.time) + ":00-05:00",
      );
      demand(
        Number.isFinite(at.getTime()) && at.getTime() <= Date.now(),
        "La asignación no puede comenzar en el futuro.",
      );
      const history = await tx.metaAdvisorAssignment.findMany({
        where: { aliasId: b.aliasId, country: b.country },
      });
      const last = assignmentTimeline(history).at(-1);
      demand(
        !last ||
          at >= last.effectiveAt ||
          (mode === "DAY" && day === limaDay(last.effectiveAt)),
        "El inicio debe ser igual o posterior al último cambio. Solo un cambio de día completo puede reemplazar los cortes de esa misma fecha.",
        409,
      );
      demand(
        history.length < 1000,
        "Máximo1000 cambios por inventario y país.",
      );
      let cutoff: number | null = null;
      if (mode === "CLOCK") {
        // Capture the latest registered daily sales under the same lock as the transfer.
        // Legacy client cutoff/token fields never decide ownership of sales.
        const review = await reviewAssignment(
          tx,
          actor,
          b.aliasId,
          b.country,
          day,
        );
        cutoff = review.sales ?? 0;
        const previousCut =
          last && limaDay(last.effectiveAt) === day
            ? (last.cutoffSales ?? 0)
            : 0;
        demand(
          cutoff >= previousCut || review.salesApprovalValid,
          "Las ventas registradas son menores que un corte anterior. Corrige el total del día o elige Todo el día.",
          409,
        );
      }
      const row = await tx.metaEffectivenessRow.upsert({
        where,
        create: {
          aliasId: b.aliasId,
          country: b.country,
          currency: "",
          displayCurrency: alias.table.defaultCurrency,
          advisorId: b.advisorId,
          revision: 1,
        },
        update: { advisorId: b.advisorId, revision: { increment: 1 } },
      });
      const change = await tx.metaAdvisorAssignment.create({
        data: {
          aliasId: b.aliasId,
          country: b.country,
          advisorId: b.advisorId,
          previousAdvisorId: old?.advisorId ?? null,
          effectiveAt: at,
          mode,
          cutoffSales: cutoff,
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_ASESOR",
          resourceId: row.id,
          detail: {
            advisorId: b.advisorId,
            previousAdvisorId: old?.advisorId ?? null,
            country: b.country,
            effectiveAt: at.toISOString(),
            mode,
            cutoffSales: cutoff,
            assignmentId: change.id,
          },
        },
      });
      return { ok: true };
    },
    { timeout: 60000 },
  );
}
export async function saveAttendance(
  actor: Actor,
  b: {
    advisorId: string;
    day: string;
    status: "PRESENT" | "ABSENT" | "NA" | null;
    revision: number;
  },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
      "Asesor no disponible.",
      404,
    );
    const where = { advisorId_day: { advisorId: b.advisorId, day: b.day } };
    const old = await tx.metaAdvisorAttendance.findUnique({ where });
    demand(
      (old?.revision ?? 0) === b.revision,
      "La asistencia cambió. Recarga antes de guardar.",
      409,
    );
    const row = await tx.metaAdvisorAttendance.upsert({
      where,
      create: { advisorId: b.advisorId, day: b.day, status: b.status },
      update: { status: b.status, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_ASESOR_ASISTENCIA",
        resourceId: b.advisorId,
        detail: { day: b.day, status: b.status },
      },
    });
    return row;
  });
}
export async function saveAdvisorAbsence(actor: Actor, input: AbsenceInput) {
  ownerOnly(actor);
  const b = advisorAbsenceSchema.parse(input);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
      "Asesor no disponible.",
      404,
    );
    const where = { advisorId_day: { advisorId: b.advisorId, day: b.day } };
    const old = await tx.metaAdvisorAbsence.findUnique({ where });
    demand(
      (old?.revision ?? 0) === b.revision,
      "Las horas de ausencia cambiaron. Recarga antes de guardar.",
      409,
    );
    if (b.mode === "CLOCK") {
      const current = absenceClockSummary(b.intervals),
        day = Date.parse(b.day) / 60000;
      const neighbors = await tx.metaAdvisorAbsence.findMany({
        where: {
          advisorId: b.advisorId,
          mode: "CLOCK",
          day: {
            in: [
              new Date(Date.parse(b.day) - 86400000).toISOString().slice(0, 10),
              new Date(Date.parse(b.day) + 86400000).toISOString().slice(0, 10),
            ],
          },
        },
      });
      for (const neighbor of neighbors) {
        const other = absenceSummary(neighbor),
          offset = Date.parse(neighbor.day) / 60000;
        for (const a of current.ranges)
          for (const c of absenceClockSummary(other.intervals).ranges)
            demand(
              !(
                day + a.start < offset + c.end && offset + c.start < day + a.end
              ),
              "La ausencia se superpone con un horario del día anterior o siguiente.",
            );
      }
    }
    const data =
      b.mode === "MANUAL"
        ? { mode: b.mode, manualHours: b.hours, intervals: [] }
        : { mode: b.mode, manualHours: null, intervals: b.intervals };
    const row = await tx.metaAdvisorAbsence.upsert({
      where,
      create: { advisorId: b.advisorId, day: b.day, ...data },
      update: { ...data, revision: { increment: 1 } },
    });
    const summary = absenceSummary(row);
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_ASESOR_HORAS_AUSENTES",
        resourceId: b.advisorId,
        detail: {
          day: b.day,
          mode: b.mode,
          hours: summary.hours,
          pending: summary.pending,
          intervals: summary.intervals.length,
          before: absenceSummary(old),
          after: summary,
        },
      },
    });
    return summary;
  });
}
/** V is shared by both views, attributed only to exact alias+advisor+country rows. */
export async function advisorSheet(
  actor: Actor,
  tableId: string,
  since: string,
  until: string,
  filters: { aliasId?: string; country?: string; advisorId?: string } = {},
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      const personWhere = filters.advisorId ? { id: filters.advisorId } : {};
      const [people, attendance, absences, tables] = await Promise.all([
        tx.metaAdvisor.findMany({
          where: personWhere,
          select: { id: true, name: true, revision: true },
          orderBy: { name: "asc" },
        }),
        tx.metaAdvisorAttendance.findMany({
          where: {
            ...(filters.advisorId ? { advisorId: filters.advisorId } : {}),
            day: { gte: since, lte: until },
          },
        }),
        tx.metaAdvisorAbsence.findMany({
          where: {
            ...(filters.advisorId ? { advisorId: filters.advisorId } : {}),
            day: { gte: since, lte: until },
          },
        }),
        tx.metaAliasTable.findMany({
          where: tableId === "all" ? {} : { id: tableId },
          select: { id: true, name: true },
        }),
      ]);
      demand(
        tableId === "all" || tables.length === 1,
        "Tabla no disponible.",
        404,
      );
      if (filters.advisorId)
        demand(people.length === 1, "Asesor no disponible.", 404);
      if (filters.aliasId) {
        const a = await tx.metaAlias.findUnique({
          where: { id: filters.aliasId },
        });
        demand(
          a && tables.some((t) => t.id === a.tableId),
          "Inventario no disponible en las hojas elegidas.",
          404,
        );
      }
      const dates: string[] = [];
      for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
        dates.push(new Date(d).toISOString().slice(0, 10));
      const key = (advisorId: string, day: string) =>
        JSON.stringify([advisorId, day]);
      const attendanceByDay = new Map(
          attendance.map((a) => [key(a.advisorId, a.day), a]),
        ),
        absenceByDay = new Map(
          absences.map((a) => [key(a.advisorId, a.day), a]),
        );
      const totals = new Map<
        string,
        Map<
          string,
          {
            sales: number | null;
            known: number;
            expected: number;
            na: number;
            partial: boolean;
          }
        >
      >();
      const breakdown: {
        tableId: string;
        tableName: string;
        aliasId: string;
        alias: string;
        country: string;
        advisorId: string;
        days: Record<
          string,
          { sales: number | null; na: boolean; partial: boolean }
        >;
      }[] = [];
      const assignmentHistory: {
        id: string;
        alias: string;
        country: string;
        tableName: string;
        effectiveAt: string;
        advisorId: string | null;
        previousAdvisorId: string | null;
        mode: string;
        cutoffSales: number | null;
      }[] = [];
      for (const table of tables) {
        const sheet = await effectiveness(actor, table.id, since, until, tx),
          names = new Map(sheet.table.aliases.map((a) => [a.id, a.name]));
        const assignments = await tx.metaAdvisorAssignment.findMany({
          where: { alias: { tableId: table.id } },
          orderBy: [
            { effectiveAt: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
        });
        const approvals = await tx.metaAdvisorSalesApproval.findMany({
          where: {
            row: { alias: { tableId: table.id } },
            day: { gte: since, lte: until },
          },
          include: { row: { select: { aliasId: true, country: true } } },
        });
        for (const row of sheet.rows) {
          if (
            !row.country ||
            (filters.aliasId && row.aliasId !== filters.aliasId) ||
            (filters.country && row.country !== filters.country)
          )
            continue;
          const changes = assignments.filter(
            (e) => e.aliasId === row.aliasId && e.country === row.country,
          );
          if (filters.advisorId)
            for (const e of assignmentTimeline(changes))
              if (
                (e.advisorId === filters.advisorId ||
                  e.previousAdvisorId === filters.advisorId) &&
                limaDay(e.effectiveAt) <= until
              )
                assignmentHistory.push({
                  id: e.id,
                  alias: names.get(row.aliasId) ?? "Inventario",
                  country: row.country,
                  tableName: table.name,
                  effectiveAt: e.effectiveAt.toISOString(),
                  advisorId: e.advisorId,
                  previousAdvisorId: e.previousAdvisorId,
                  mode: e.mode,
                  cutoffSales: e.cutoffSales,
                });
          const sources = new Map<string, (typeof breakdown)[number]>();
          for (const day of dates) {
            const c = row.days[day];
            const approval = approvals.find(
              (a) =>
                a.row.aliasId === row.aliasId &&
                a.row.country === row.country &&
                a.day === day,
            );
            const plan = advisorSalesPlan(
              row.advisorId,
              changes,
              day,
              c?.sales ?? null,
              !!c?.na.includes("sales"),
              approval,
            );
            for (const portion of plan.portions) {
              if (!portion.advisorId) continue;
              if (filters.advisorId && portion.advisorId !== filters.advisorId)
                continue;
              if (!totals.has(portion.advisorId))
                totals.set(portion.advisorId, new Map());
              const byDay = totals.get(portion.advisorId)!;
              const sum = byDay.get(day) ?? {
                sales: null,
                known: 0,
                expected: 0,
                na: 0,
                partial: false,
              };
              sum.expected++;
              if (portion.na) sum.na++;
              else if (portion.sales !== null) {
                sum.sales = (sum.sales ?? 0) + portion.sales;
                sum.known++;
              }
              sum.partial ||=
                portion.partial ||
                !!c?.partialMetrics.includes("sales") ||
                plan.status === "PENDING";
              byDay.set(day, sum);
              if (filters.advisorId) {
                if (!sources.has(portion.advisorId))
                  sources.set(portion.advisorId, {
                    tableId: table.id,
                    tableName: table.name,
                    aliasId: row.aliasId,
                    alias: names.get(row.aliasId) ?? "Inventario",
                    country: row.country,
                    advisorId: portion.advisorId,
                    days: {},
                  });
                sources.get(portion.advisorId)!.days[day] = {
                  sales: portion.sales,
                  na: portion.na,
                  partial:
                    portion.partial || !!c?.partialMetrics.includes("sales"),
                };
              }
            }
          }
          breakdown.push(...sources.values());
        }
      }
      return {
        tableId,
        since,
        until,
        aliasId: filters.aliasId ?? "",
        country: filters.country ?? "",
        breakdown,
        assignmentHistory,
        rows: people.map((p) => ({
          ...p,
          days: Object.fromEntries(
            dates.map((day) => {
              const att = attendanceByDay.get(key(p.id, day)),
                sum = totals.get(p.id)?.get(day),
                absence = absenceSummary(absenceByDay.get(key(p.id, day)));
              return [
                day,
                {
                  status: att?.status ?? null,
                  revision: att?.revision ?? 0,
                  sales: sum?.sales ?? null,
                  partial:
                    !!sum &&
                    (sum.partial ||
                      (sum.known > 0 && sum.known + sum.na < sum.expected)),
                  na: !!sum && sum.na === sum.expected,
                  absence,
                },
              ];
            }),
          ),
        })),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
