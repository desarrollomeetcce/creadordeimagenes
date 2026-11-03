"use client";
import {
  InventoryCampaignControl,
  type InventoryCampaignChange,
} from "./inventory-campaign-control";
import { InventoryCacStatus as InventoryStatusLabel } from "./inventory-cac-status";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { financialRequest as api } from "./financial-request";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { cacStatusNames as trialStatusNames } from "../../lib/meta-ads/inventory-cac-policy";
import type { InventorySheetActivationReport } from "../../lib/meta-ads/inventory-sheet-activation";
export const inventoryCountryMetrics = [
  { key: "activation", label: "Activación", width: 136 },
  { key: "factor", label: "CAC", width: 68 },
  { key: "status", label: "Estado", width: 130 },
] as const;
export type SheetPoint = InventorySheetActivationReport["rows"][number];
export function useInventoryCountryEvaluation(
  listId: string,
  tableIds: string[],
  nonce: number,
  period?: { since?: string; until?: string; fromActivation?: boolean },
) {
  const key = tableIds.join(","),
    since = period?.since ?? "",
    until = period?.until ?? "",
    fromActivation = period?.fromActivation ?? false,
    stamp = JSON.stringify([listId, key, nonce, since, until, fromActivation]);
  const [state, setState] = useState<{
      stamp: string;
      report: InventorySheetActivationReport;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      pending = false;
    setState(null);
    setError("");
    async function load() {
      if (pending || !key || document.hidden) return;
      pending = true;
      if (alive) setLoading(true);
      try {
        const report: InventorySheetActivationReport = await api(
          "meta-ads/inventory/sheet-activation/report?" +
            new URLSearchParams({
              listId,
              tableIds: [
                ...new Set(tableIds.map((id) => id.split(":")[0])),
              ].join(","),
              byCountry: "true",
              ...(since && until ? { since, until } : {}),
              ...(fromActivation ? { fromActivation: "true" } : {}),
            }),
        );
        if (alive) {
          setState({ stamp, report });
          setError("");
        }
      } catch (e) {
        if (alive) {
          setState(null);
          setError((e as Error).message);
        }
      } finally {
        pending = false;
        if (alive) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60000),
      visible = () => {
        if (!document.hidden) void load();
      };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [listId, key, nonce, since, until, fromActivation]);
  const report = state?.stamp === stamp ? state.report : null;
  const lookup = useMemo(
    () =>
      new Map(
        report?.rows.map((r) => [
          JSON.stringify([
            categoryKey(r.name),
            r.country ? r.tableId + ":" + r.country : r.tableId,
          ]),
          r,
        ]) ?? [],
      ),
    [report],
  );
  return { lookup, loading, error, ready: !!report };
}
export function InventoryRowPinIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v7" />
    </svg>
  );
}
export function InventoryCountryCells({
  name,
  countries,
  hiddenColumns,
  evaluation,
  canEdit,
  busy,
  sheetLabel,
  onChange,
  onHistory,
  onReplace,
  onDetail,
  renderSync,
}: {
  renderSync?: (column: string, point?: SheetPoint) => ReactNode;
  name: string;
  countries: string[];
  hiddenColumns: string[];
  evaluation: ReturnType<typeof useInventoryCountryEvaluation>;
  canEdit: boolean;
  busy: boolean;
  sheetLabel: (id: string) => string;
  onChange: (
    tableId: string,
    name: string,
    change: InventoryCampaignChange,
  ) => void;
  onHistory: (tableId: string, name: string) => void;
  onReplace?: (tableId: string, name: string) => void;
  onDetail?: (tableId: string, name: string, aliasId: string) => void;
}) {
  return (
    <>
      {countries.map((tableId) => {
        if (
          inventoryCountryMetrics.every((metric) =>
            hiddenColumns.includes(`country:${tableId}:${metric.key}`),
          )
        )
          return null;
        const point = evaluation.lookup.get(
            JSON.stringify([categoryKey(name), tableId]),
          ),
          active = point?.activation === "ACTIVE",
          mixed = point?.activation === "MIXED",
          disabled =
            !canEdit || busy || !evaluation.ready || evaluation.loading,
          assessment = point?.cac?.meta.assessment ?? {
            status: "PENDING" as const,
            usage: null,
            limit: point?.cac?.rules.review ?? 35,
          };
        const title = `${name} · ${sheetLabel(tableId)}`,
          status = evaluation.error
            ? "No disponible"
            : evaluation.loading && !evaluation.ready
              ? "Cargando…"
              : !point
                ? "Sin asignar"
                : trialStatusNames[assessment!.status];
        return (
          <Fragment key={tableId}>
            <td
              data-inventory-country={tableId}
              data-country-metric="activation"
              hidden={hiddenColumns.includes(`country:${tableId}:activation`)}
            >
              <div className="inventory-sheet-row-controls">
                {renderSync?.(tableId, point)}
                <InventoryCampaignControl
                  title={title}
                  activation={point?.activation ?? "INACTIVE"}
                  task={point?.campaignTask ?? "NONE"}
                  disabled={disabled}
                  onChange={(change) => onChange(tableId, name, change)}
                />
                {onReplace && (
                  <button
                    type="button"
                    aria-label={`Reemplazar diplomado ${title}`}
                    title="Reemplazar solo en este país"
                    disabled={
                      disabled ||
                      !point ||
                      (point.activation !== "ACTIVE" &&
                        !point.campaignTasks.length)
                    }
                    onClick={() => onReplace(tableId, name)}
                  >
                    ↔
                  </button>
                )}
                {point?.activation !== "ACTIVE" &&
                  point?.activation !== "MIXED" && (
                    <button
                      type="button"
                      className="inventory-sheet-item-pin"
                      aria-pressed={point?.pinned ?? false}
                      aria-label={`${point?.pinned ? "Desfijar" : "Fijar"} diplomado ${title}`}
                      title={
                        point?.pinned
                          ? "Desfijar de la hoja"
                          : "Mantener en la hoja aunque esté desactivado"
                      }
                      disabled={disabled}
                      onClick={() =>
                        onChange(tableId, name, { pinned: !point?.pinned })
                      }
                    >
                      <InventoryRowPinIcon />
                    </button>
                  )}
                <button
                  type="button"
                  className="inventory-sheet-history-arrow"
                  aria-label={`Detalle del historial de ${title}`}
                  title="Historial de activación"
                  disabled={!point}
                  onClick={() => onHistory(tableId, name)}
                >
                  ↗
                </button>
              </div>
            </td>
            <td
              data-inventory-country={tableId}
              data-country-metric="factor"
              hidden={hiddenColumns.includes(`country:${tableId}:factor`)}
              title={
                point
                  ? `Gasto Meta: S/ ${point.cac?.meta.penAmount ?? "—"} · Ventas: ${point.cac?.sales ?? point.sales ?? "—"} · Límite: S/ ${assessment?.limit ?? "—"}. Últimos 14 días: hoy y 13 anteriores.`
                  : "Sin datos de evaluación"
              }
            >
              {assessment?.usage === null || assessment?.usage === undefined
                ? "—"
                : new Intl.NumberFormat("es-PE", {
                    style: "currency",
                    currency: "PEN",
                    maximumFractionDigits: 1,
                  }).format(assessment.usage)}
              {assessment?.usage !== null &&
              assessment?.usage !== undefined &&
              (point?.cac ? point.cac.meta.partial : !point?.complete)
                ? " *"
                : ""}
            </td>
            <td data-inventory-country={tableId} data-country-metric="status">
              <div className="inventory-state-cell-content">
                {point ? (
                  <button
                    type="button"
                    className={
                      "trial-status inventory-status-with-dot trial-" +
                      assessment!.status
                    }
                    aria-label={`Detalle de evaluación de ${title}`}
                    onClick={() =>
                      onDetail
                        ? onDetail(
                            tableId,
                            name,
                            point.targets[0]?.aliasId ?? "",
                          )
                        : onHistory(tableId, name)
                    }
                  >
                    <InventoryStatusLabel status={assessment!.status} />
                    {point.cac?.meta.provisional ? " *" : ""}
                  </button>
                ) : (
                  <small title={evaluation.error || undefined}>
                    <span
                      className="inventory-status-dot inventory-status-dot-PENDING"
                      aria-hidden="true"
                    />
                    {status}
                  </small>
                )}
                <button
                  type="button"
                  className="inventory-country-detail"
                  aria-label={`Ver detalle completo de ${title}`}
                  title="Ver estadísticas, ventas e historial completo"
                  onClick={() =>
                    onDetail
                      ? onDetail(
                          tableId,
                          name,
                          point?.targets[0]?.aliasId ?? "",
                        )
                      : onHistory(tableId, name)
                  }
                >
                  ↗
                </button>
              </div>
            </td>
          </Fragment>
        );
      })}
    </>
  );
}
