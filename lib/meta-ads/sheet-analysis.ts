import { inventoryCacSummary, cacWindow } from "./inventory-cac";
import { Prisma } from "@prisma/client";
import { financialContext, checkFinancialContext } from "./financial-access";
import { demand } from "../errors";
import { recordedStarts, recordedTableFloor } from "./recorded-starts";
import { db } from "../db";
import { inventoryEffectivenessSource } from "./effectiveness";
import { inventoryReportSummary } from "./inventory-report-summary";
import { activationSettings } from "./inventory-sheet-activation";
import {
  manualBaseAllocationsSchema,
  manualBaseValue,
} from "./manual-base-policy";
import { limaDay } from "./advisor-attribution";
import type { FxRates } from "./exchange-rates";
import type { Actor } from "./service";
/** Only financial document readers reach this service; source authorizes the exact table before other reads. */
export async function sheetAnalysis(
  actor: Actor,
  q: { tableId: string; since: string; until: string },
) {
  return db.$transaction(
    async (tx) => {
      await checkFinancialContext(actor, tx);
      const capability = financialContext(actor);
      demand(
        !capability ||
          capability.access.isOwner ||
          capability.scope === "ALL" ||
          capability.tableIds.includes(q.tableId),
        "Hoja fuera del documento.",
        403,
      );
      const visible = await inventoryEffectivenessSource(
        actor,
        q.tableId,
        q.since,
        q.until,
        tx,
      );
      const asOf = new Date().toISOString(),
        today = limaDay(new Date(asOf));
      const aliases = await tx.metaAlias.findMany({
        where: {
          tableId: q.tableId,
          id: { in: visible.rows.map((r) => r.aliasId) },
        },
        select: {
          id: true,
          inventorySheet: { select: { config: true } },
          effectivenessStates: {
            select: {
              country: true,
              events: {
                select: { id: true, active: true, createdAt: true },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              },
            },
          },
        },
      });
      const first = await tx.metaEffectivenessDay.aggregate({
        where: {
          row: { aliasId: { in: aliases.map((a) => a.id) } },
          day: { lte: today },
        },
        _min: { day: true },
      });
      const since =
        [
          first._min.day,
          cacWindow(today).since,
          await recordedTableFloor(tx, q.tableId, today),
          ...aliases.flatMap((a) =>
            a.effectivenessStates.flatMap((s) =>
              s.events.map((e) => limaDay(e.createdAt)),
            ),
          ),
        ]
          .filter((d): d is string => !!d && d <= today)
          .sort()[0] ?? today;
      const source = await inventoryEffectivenessSource(
        actor,
        q.tableId,
        since,
        today,
        tx,
      );
      const rates = await tx.metaFxDay.findMany({
          where: { day: { gte: since, lte: today } },
          select: { day: true, rates: true },
        }),
        fx = new Map(rates.map((r) => [r.day, r.rates as FxRates]));
      const rows = source.rows
        .filter((r) => aliases.some((a) => a.id === r.aliasId))
        .map((row) => {
          const alias = aliases.find((a) => a.id === row.aliasId)!;
          return {
            aliasId: row.aliasId,
            country: row.country,
            evaluation: inventoryCacSummary({
              row,
              ...cacWindow(today),
              rates: fx,
              rules: activationSettings(alias.inventorySheet?.config ?? {})
                .cacRules,
            }),
            report: inventoryReportSummary({
              row,
              events: (
                alias.effectivenessStates.find((s) => s.country === row.country)
                  ?.events ?? []
              ).map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
              asOf,
              rates: fx,
              limits: activationSettings(alias.inventorySheet?.config ?? {})
                .limits,
            }),
          };
        });
      const where = { tableId: q.tableId, day: { gte: q.since, lte: q.until } };
      const [bm, bc, legacy] = await Promise.all([
        tx.metaManualBaseDay.findMany({ where }),
        tx.metaAdvisorBaseDay.findMany({ where }),
        tx.metaEffectivenessTotalDay.findMany({
          where,
          orderBy: [{ sheetId: "asc" }, { currency: "asc" }],
        }),
      ]);
      const keys = [
        ...new Set(
          [...bm, ...bc, ...legacy].map((r) =>
            JSON.stringify([r.country, r.day]),
          ),
        ),
      ];
      const bases = keys.map((k) => {
        const [country, day] = JSON.parse(k) as [string, string];
        const value = (records: typeof bm) => {
          const r = records.find((v) => v.country === country && v.day === day);
          return r
            ? manualBaseValue(
                r.state,
                manualBaseAllocationsSchema.parse(r.allocations),
              )
            : undefined;
        };
        const previous = legacy
          .filter((r) => r.country === country && r.day === day)
          .map((r) => (r.values as Record<string, unknown>).baseManual)
          .find((v) => typeof v === "number" || v === "NA");
        return {
          country,
          day,
          bm: bm.some((r) => r.country === country && r.day === day)
            ? (value(bm) ?? null)
            : (previous ?? null),
          bc: value(bc) ?? null,
        };
      });
      return { rows, bases };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 60000,
    },
  );
}
export type SheetAnalysis = Awaited<ReturnType<typeof sheetAnalysis>>;

export async function sheetActivityStart(actor: Actor, tableId: string) {
  const ctx = financialContext(actor);
  await checkFinancialContext(actor);
  demand(
    !ctx ||
      ctx.access.isOwner ||
      ctx.scope === "ALL" ||
      ctx.tableIds.includes(tableId),
    "Hoja fuera del documento.",
    403,
  );
  const today = limaDay(new Date());
  await inventoryEffectivenessSource(actor, tableId, today, today, db);
  const aliases = await db.metaAlias.findMany({
    where: { tableId },
    select: { id: true },
  });
  const registered = await recordedStarts(
    db,
    aliases.map((a) => a.id),
    today,
  );
  const floor = await recordedTableFloor(db, tableId, today);
  const projected = floor
    ? await inventoryEffectivenessSource(actor, tableId, floor, today, db)
    : null;
  const projectedDates =
    projected?.rows.flatMap((r) =>
      Object.keys(r.days).filter(
        (day) =>
          (typeof r.days[day].sales === "number" &&
            !r.days[day].na.includes("sales")) ||
          (typeof r.days[day].budget === "number" &&
            !r.days[day].na.includes("budget")),
      ),
    ) ?? [];
  const event = await db.metaEffectivenessEvent.findFirst({
    where: {
      state: { alias: { tableId } },
      active: true,
      createdAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return {
    since:
      [
        ...registered.values(),
        ...projectedDates,
        ...(event ? [limaDay(event.createdAt)] : []),
      ].sort()[0] ?? null,
  };
}
