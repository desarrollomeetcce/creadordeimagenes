"use client";
import { CurrentUserId } from "./role-guide";
import { compactCountryHidden } from "../../lib/meta-ads/inventory-inline-policy";
import {
  InventoryCampaignControl,
  type InventoryCampaignChange,
} from "./inventory-campaign-control";
import { InventoryCacStatus as InventoryStatusLabel } from "./inventory-cac-status";
import {
  Fragment,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  summary = false,
) {
  const userId = useContext(CurrentUserId),
    key = [...new Set(tableIds.map((id) => id.split(":")[0]))].sort().join(","),
    since = period?.since ?? "",
    until = period?.until ?? "",
    fromActivation = period?.fromActivation ?? false;
  const stamp = JSON.stringify([
    userId,
    listId,
    since,
    until,
    fromActivation,
    summary,
  ]);
  type Report = InventorySheetActivationReport;
  const cache = useRef<{
    stamp: string;
    nonce: number;
    tables: Map<string, { rows: Report["rows"]; at: number }>;
    report: Report | null;
  }>({ stamp: "", nonce, tables: new Map(), report: null });
  const [state, setState] = useState<{
      stamp: string;
      signature: string;
      report: Report;
      tables: Set<string>;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [localReload, setLocalReload] = useState(0);
  const refresh = useCallback((columns?: string[]) => {
    const selected = columns
      ? new Set(columns.map((c) => c.split(":")[0]))
      : null;
    for (const [id, entry] of cache.current.tables)
      if (!selected || selected.has(id)) entry.at = 0;
    setLocalReload((n) => n + 1);
  }, []);
  useEffect(() => {
    let alive = true,
      pending = false;
    const controller = new AbortController();
    if (cache.current.stamp !== stamp) {
      cache.current = { stamp, nonce, tables: new Map(), report: null };
      setState(null);
    } else if (cache.current.nonce !== nonce) {
      cache.current.nonce = nonce;
      for (const entry of cache.current.tables.values()) entry.at = 0;
    }
    const current = cache.current,
      requested = key.split(",").filter(Boolean),
      ttl = summary ? 120000 : 60000;
    setError("");
    async function load(force = false) {
      if (!alive || pending || !requested.length || document.hidden) return;
      const needed = requested.filter(
        (id) =>
          force ||
          !current.tables.has(id) ||
          Date.now() - current.tables.get(id)!.at >= ttl,
      );
      if (!needed.length) return;
      pending = true;
      if (requested.some((id) => !current.tables.has(id))) setLoading(true);
      try {
        const report: Report = await api(
          "meta-ads/inventory/sheet-activation/report?" +
            new URLSearchParams({
              listId,
              tableIds: needed.join(","),
              byCountry: "true",
              ...(summary ? { summary: "true" } : {}),
              ...(since && until ? { since, until } : {}),
              ...(fromActivation ? { fromActivation: "true" } : {}),
            }),
          "GET",
          undefined,
          { signal: controller.signal },
        );
        if (alive && cache.current === current) {
          for (const id of needed)
            current.tables.set(id, {
              rows: report.rows.filter((row) => row.tableId === id),
              at: Date.now(),
            });
          const merged = {
            ...report,
            rows: [...current.tables.values()].flatMap((entry) => entry.rows),
          };
          current.report = merged;
          const signature = JSON.stringify(merged);
          setState((previous) =>
            previous?.stamp === stamp && previous.signature === signature
              ? previous
              : {
                  stamp,
                  report: merged,
                  signature,
                  tables: new Set(current.tables.keys()),
                },
          );
          setError("");
        }
      } catch (e) {
        if (alive && !controller.signal.aborted) {
          if ([401, 403].includes((e as { status?: number }).status ?? 0)) {
            current.tables.clear();
            current.report = null;
            setState(null);
          }
          setError((e as Error).message);
        }
      } finally {
        pending = false;
        if (alive) setLoading(false);
      }
    }
    const initial = setTimeout(() => void load(), summary ? 100 : 0),
      timer = setInterval(() => void load(true), ttl);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [stamp, key, nonce, localReload]);
  const report = state?.stamp === stamp ? state.report : null;
  const lookup = useMemo(
    () =>
      new Map(
        report?.rows.map((row) => [
          JSON.stringify([
            categoryKey(row.name),
            row.country ? row.tableId + ":" + row.country : row.tableId,
          ]),
          row,
        ]) ?? [],
      ),
    [report],
  );
  const loadedTables =
    state?.stamp === stamp ? state.tables : new Set<string>();
  const ready =
    !!report &&
    key
      .split(",")
      .filter(Boolean)
      .every((id) => loadedTables.has(id));
  return useMemo(
    () => ({ lookup, loading, error, ready, loadedTables, refresh }),
    [lookup, loading, error, ready, loadedTables, refresh],
  );
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
  onDetail,
  onHistory,
  renderSync,
  renderUsage,
  visibleCountries,
}: {
  visibleCountries?: string[];
  name: string;
  countries: string[];
  hiddenColumns: string[];
  evaluation: ReturnType<typeof useInventoryCountryEvaluation>;
  canEdit: boolean;
  busy: boolean;
  sheetLabel: (id: string) => string;
  onChange: (
    column: string,
    name: string,
    change: InventoryCampaignChange,
  ) => void;
  onDetail?: (column: string, name: string, aliasId: string) => void;
  onHistory: (column: string, name: string) => void;
  onReplace?: (column: string, name: string) => void;
  renderSync?: (column: string, point?: SheetPoint) => ReactNode;
  renderUsage?: (column: string, point?: SheetPoint) => ReactNode;
}) {
  return (
    <>
      {countries.map((column) => {
        if (compactCountryHidden(hiddenColumns, column)) return null;
        if (visibleCountries && !visibleCountries.includes(column))
          return (
            <td
              key={column}
              data-inventory-country={column}
              data-country-metric="compact"
              className="inventory-country-placeholder"
            />
          );
        const columnReady =
          evaluation.loadedTables?.has(column.split(":")[0]) ??
          evaluation.ready;
        const point = evaluation.lookup.get(
          JSON.stringify([categoryKey(name), column]),
        );
        const assessment = point?.cac?.meta.assessment;
        const status = assessment?.status ?? "PENDING";
        const title = `${name} · ${sheetLabel(column)}`;
        const detail = () =>
          onDetail
            ? onDetail(column, name, point?.targets[0]?.aliasId ?? "")
            : onHistory(column, name);
        return (
          <td
            key={column}
            data-inventory-country={column}
            data-country-metric="compact"
            className="inventory-country-compact"
          >
            <div className="inventory-country-actions">
              <InventoryCampaignControl
                title={title}
                activation={point?.activation ?? "UNKNOWN"}
                task={point?.campaignTask ?? "NONE"}
                disabled={!canEdit || busy}
                pending={!columnReady}
                onChange={(change) => onChange(column, name, change)}
                extraActions={
                  <>
                    {renderSync?.(column, point)}
                    {point && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy || !canEdit}
                        onClick={() =>
                          onChange(column, name, { pinned: !point.pinned })
                        }
                      >
                        {point.pinned
                          ? "Desfijar de la hoja"
                          : "Fijar en la hoja"}
                      </button>
                    )}
                  </>
                }
              />
              {renderUsage?.(column, point)}
            </div>
            {point ? (
              <button
                type="button"
                className={`trial-status inventory-status-with-dot trial-${status}`}
                aria-label={`Detalle de evaluación de ${title}`}
                title={`Gasto Meta: S/ ${point.cac?.meta.penAmount ?? "—"} · Ventas: ${point.cac?.sales ?? "—"} · CAC: ${assessment?.usage ?? "—"}`}
                onClick={detail}
              >
                <InventoryStatusLabel status={status} />
                {point.cac?.meta.provisional ? " *" : ""}
              </button>
            ) : (
              <button
                type="button"
                className="inventory-country-pending"
                onClick={detail}
                aria-label={`Ver detalle completo de ${title}`}
              >
                {evaluation.error
                  ? "No disponible"
                  : !columnReady
                    ? "Cargando…"
                    : "Sin asignar"}
              </button>
            )}
          </td>
        );
      })}
    </>
  );
}
