"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { trialStatusNames } from "../../lib/meta-ads/inventory-trial-policy";
import type { InventorySheetActivationReport } from "../../lib/meta-ads/inventory-sheet-activation";
export const inventoryCountryMetrics = [
  { key: "activation", label: "Activación", width: 136 },
  { key: "factor", label: "FX", width: 68 },
  { key: "status", label: "Estado", width: 130 },
] as const;
export type SheetPoint = InventorySheetActivationReport["rows"][number];
export function useInventoryCountryEvaluation(
  listId: string,
  tableIds: string[],
  nonce: number,
) {
  const key = tableIds.join(","),
    stamp = JSON.stringify([listId, key, nonce]);
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
            new URLSearchParams({ listId, tableIds: key }),
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
  }, [listId, key, nonce]);
  const report = state?.stamp === stamp ? state.report : null;
  const lookup = useMemo(
    () =>
      new Map(
        report?.rows.map((r) => [
          JSON.stringify([categoryKey(r.name), r.tableId]),
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
  evaluation,
  canEdit,
  busy,
  sheetLabel,
  onChange,
  onHistory,
}: {
  name: string;
  countries: string[];
  evaluation: ReturnType<typeof useInventoryCountryEvaluation>;
  canEdit: boolean;
  busy: boolean;
  sheetLabel: (id: string) => string;
  onChange: (
    tableId: string,
    name: string,
    change: { active?: boolean; pinned?: boolean },
  ) => void;
  onHistory: (tableId: string, name: string) => void;
}) {
  return (
    <>
      {countries.map((tableId) => {
        const point = evaluation.lookup.get(
            JSON.stringify([categoryKey(name), tableId]),
          ),
          active = point?.activation === "ACTIVE",
          mixed = point?.activation === "MIXED",
          disabled =
            !canEdit || busy || !evaluation.ready || evaluation.loading,
          assessment = point?.assessment;
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
            >
              <div className="inventory-sheet-row-controls">
                <button
                  type="button"
                  className={
                    "trial-sheet-activation trial-sheet-" +
                    (active ? "ACTIVE" : mixed ? "MIXED" : "INACTIVE")
                  }
                  role="switch"
                  aria-checked={active}
                  aria-label={`Activación de ${title}`}
                  title={`${active ? "Desactivar" : mixed ? "Activar todas las filas" : "Activar"} en ${sheetLabel(tableId)}`}
                  disabled={disabled}
                  onClick={() => onChange(tableId, name, { active: !active })}
                >
                  <i aria-hidden="true" />
                  <span className="sr-only">
                    {active ? "Activado" : mixed ? "Mixto" : "Desactivado"}
                  </span>
                </button>
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
              title={
                point
                  ? `Presupuesto: S/ ${point.budget ?? "—"} · Ventas: ${point.sales ?? "—"} · Límite: S/ ${assessment?.limit ?? "—"}. Datos diarios del período de activación.`
                  : "Sin datos de evaluación"
              }
            >
              {assessment?.usage === null || assessment?.usage === undefined
                ? "—"
                : new Intl.NumberFormat("es-PE", {
                    style: "percent",
                    maximumFractionDigits: 1,
                  }).format(assessment.usage)}
              {assessment?.usage !== null &&
              assessment?.usage !== undefined &&
              !point?.complete
                ? " *"
                : ""}
            </td>
            <td data-inventory-country={tableId} data-country-metric="status">
              {point ? (
                <button
                  type="button"
                  className={"trial-status trial-" + assessment!.status}
                  aria-label={`Detalle de evaluación de ${title}`}
                  onClick={() => onHistory(tableId, name)}
                >
                  {status}
                </button>
              ) : (
                <small title={evaluation.error || undefined}>{status}</small>
              )}
            </td>
          </Fragment>
        );
      })}
    </>
  );
}
