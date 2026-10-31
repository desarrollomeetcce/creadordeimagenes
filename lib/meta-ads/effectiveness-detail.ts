import { inventoryCacSummary } from "./inventory-cac";
import { recordedTableFloor } from "./recorded-starts";
import { activePeriods } from "./active-periods";
import { db } from "../db";
import { ownerOnly } from "./financial-access";
import { demand } from "../errors";
import { inventoryEffectivenessSource } from "./effectiveness";
import { inventoryReportSummary } from "./inventory-report-summary";
import { activationSettings } from "./inventory-sheet-activation";
import { inventoryLifetimeSummary } from "./inventory-lifetime-summary";
import { accountWhere } from "./service";
import { limaDay } from "./advisor-attribution";
import type { FxRates } from "./exchange-rates";
import { aliasStateTimeline } from "./alias-state-timeline";
import type { Actor } from "./service";
export async function effectivenessDetail(
  actor: Actor,
  b: {
    aliasId: string;
    country: string;
    since: string;
    until: string;
    reportSince?: string;
    reportUntil?: string;
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      const alias = await tx.metaAlias.findUnique({
        where: { id: b.aliasId },
        include: { table: { select: { id: true, name: true } } },
      });
      demand(alias, "Inventario no disponible.", 404);
      const since = new Date(b.since + "T00:00:00-05:00"),
        until = new Date(
          Math.min(
            Date.parse(b.until + "T00:00:00-05:00") + 86400000,
            Date.now(),
          ),
        ),
        asOf = new Date().toISOString();
      const state = await tx.metaEffectivenessState.findUnique({
        where: { aliasId_country: { aliasId: b.aliasId, country: b.country } },
      });
      const [sheet, prior, events, fullEvents] = await Promise.all([
        inventoryEffectivenessSource(
          actor,
          alias.tableId,
          b.since,
          b.until,
          tx,
        ),
        state
          ? tx.metaEffectivenessEvent.findFirst({
              where: { stateId: state.id, createdAt: { lt: since } },
              select: { id: true, active: true, createdAt: true },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            })
          : null,
        state
          ? tx.metaEffectivenessEvent.findMany({
              where: {
                stateId: state.id,
                createdAt: { gte: since, lt: until },
              },
              select: { id: true, active: true, createdAt: true },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 10001,
            })
          : [],
        state
          ? tx.metaEffectivenessEvent.findMany({
              where: { stateId: state.id, createdAt: { lte: new Date(asOf) } },
              select: {
                id: true,
                active: true,
                createdAt: true,
                snapshot: true,
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 10001,
            })
          : [],
      ]);
      demand(
        fullEvents.length <= 10000,
        "El historial supera el límite de 10000 cambios que se pueden consultar a la vez.",
      );
      demand(
        events.length <= 10000,
        "El período tiene demasiados cambios de estado. Elige menos días.",
      );
      let row = sheet.rows.find(
        (r) => r.aliasId === b.aliasId && r.country === b.country,
      );
      // Unpinning hides a financial row, not its authorized statistics or recorded history.
      if (!row)
        row = (
          await inventoryEffectivenessSource(
            actor,
            alias.tableId,
            b.since,
            b.until,
            tx,
          )
        ).rows.find((r) => r.aliasId === b.aliasId && r.country === b.country);
      demand(row, "Fila de inventario y país no disponible.", 404);
      const serialize = (e: {
        id: string;
        active: boolean;
        createdAt: Date;
      }) => ({
        id: e.id,
        active: e.active,
        createdAt: e.createdAt.toISOString(),
      });
      const today = limaDay(new Date(asOf));
      const [firstDay, meta] = await Promise.all([
        tx.metaEffectivenessDay.aggregate({
          where: {
            row: { aliasId: alias.id, country: b.country },
            day: { lte: today },
          },
          _min: { day: true },
        }),
        tx.metaAdDaily.findMany({
          where: {
            scope: "7d_click,1d_view|impression",
            day: { lte: today },
            object: {
              aliasId: alias.id,
              aliasCountry: b.country,
              level: "campaign",
              account: await accountWhere(actor),
            },
          },
          select: {
            day: true,
            spend: true,
            account: { select: { currency: true } },
          },
        }),
      ]);
      const allPeriods = activePeriods(fullEvents.map(serialize), asOf);
      const first =
        [
          firstDay._min.day,
          b.reportSince ?? b.since,
          await recordedTableFloor(tx, alias.tableId, today),
          ...meta.map((d) => d.day),
          ...allPeriods.map((p) => p.since),
        ]
          .filter((d): d is string => !!d && d <= today)
          .sort()[0] ?? today;
      const lifetimeRow =
        b.since <= first && b.until >= today
          ? row
          : (
              await inventoryEffectivenessSource(
                actor,
                alias.tableId,
                first,
                today,
                tx,
              )
            ).rows.find(
              (r) => r.aliasId === alias.id && r.country === b.country,
            );
      demand(
        lifetimeRow,
        "No se pudo consultar el acumulado de este diplomado.",
        404,
      );
      const rates = await tx.metaFxDay.findMany({
        where: { day: { gte: first, lte: today } },
        select: { day: true, rates: true },
      });
      const initial = fullEvents[0];
      const timeComplete =
        !!initial &&
        initial.active &&
        (initial.snapshot as Record<string, unknown>)?.priorActive !== true;
      const lifetime = inventoryLifetimeSummary({
        since: first,
        today,
        asOf,
        currency: lifetimeRow.currency,
        periods: allPeriods,
        timeComplete,
        days: lifetimeRow.days,
        meta: meta.map((d) => ({
          day: d.day,
          currency: d.account.currency,
          amount: Number(d.spend),
        })),
        rates: new Map(rates.map((r) => [r.day, r.rates as FxRates])),
      });
      const inventory = alias.inventorySheetId
        ? await tx.metaEffectivenessSheet.findUnique({
            where: { id: alias.inventorySheetId },
            select: { config: true },
          })
        : null;
      const report = inventoryReportSummary({
        row: lifetimeRow,
        events: fullEvents.map(serialize),
        asOf,
        rates: new Map(rates.map((r) => [r.day, r.rates as FxRates])),
        limits: activationSettings(inventory?.config ?? {}).limits,
      });
      const reportSince = b.reportSince ?? b.since,
        reportUntil = b.reportUntil ?? b.until;
      demand(
        reportSince <= reportUntil &&
          reportUntil <= today &&
          (Date.parse(reportUntil) - Date.parse(reportSince)) / 86400000 < 3660,
        "Elige un período válido de hasta diez años.",
      );
      const periodCac = inventoryCacSummary({
        row: lifetimeRow,
        since: reportSince,
        until: reportUntil,
        rates: new Map(rates.map((r) => [r.day, r.rates as FxRates])),
        rules: activationSettings(inventory?.config ?? {}).cacRules,
      });
      const legacyRemoval = !state
        ? await tx.auditEvent.findFirst({
            where: {
              action: "META_EFECTIVIDAD_FILAS_ELIMINADAS",
              resourceId: alias.tableId,
              detail: {
                path: ["targets"],
                array_contains: [{ aliasId: alias.id, country: b.country }],
              },
            },
            orderBy: { createdAt: "desc" },
            select: { id: true, createdAt: true, detail: true },
          })
        : null;
      const legacyHistoryUnavailable =
        !!legacyRemoval &&
        !(legacyRemoval.detail as Record<string, unknown>)?.preservedHistory;
      return {
        lifetime,
        report,
        periodCac,
        legacyHistoryUnavailable,
        removals: legacyHistoryUnavailable
          ? [
              {
                id: legacyRemoval.id,
                createdAt: legacyRemoval.createdAt.toISOString(),
                since: null,
                until: null,
                sales: null,
                salesPartial: true,
              },
            ]
          : fullEvents
              .filter(
                (e) =>
                  (e.snapshot as Record<string, unknown>)?.reason ===
                  "ROW_REMOVED_FROM_SHEET",
              )
              .slice(-100)
              .reverse()
              .map((e) => {
                const snap = e.snapshot as Record<string, unknown>;
                return {
                  id: e.id,
                  createdAt: e.createdAt.toISOString(),
                  since: typeof snap.since === "string" ? snap.since : null,
                  until: typeof snap.until === "string" ? snap.until : null,
                  sales:
                    typeof snap.sales === "number" &&
                    Number.isFinite(snap.sales)
                      ? snap.sales
                      : null,
                  salesPartial: snap.salesPartial !== false,
                };
              }),
        aliasId: alias.id,
        name: alias.name,
        tableId: alias.tableId,
        tableName: alias.table.name,
        country: b.country,
        currency: row.currency,
        active: row.active,
        activePeriods: allPeriods,
        asOf,
        days: row.days,
        timeline: aliasStateTimeline(
          b.since,
          b.until,
          prior ? serialize(prior) : null,
          events.map(serialize),
          asOf,
        ),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
