"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { countryName } from "../../lib/meta-ads/countries";
import { trialStatusNames } from "../../lib/meta-ads/inventory-trial-policy";
import { limaToday } from "./date-range";
import type { EffectivenessSheet } from "../../lib/meta-ads/effectiveness";
import type {
  InventoryCatalogTrialReport,
  TrialDirectory,
  TrialReport,
} from "../../lib/meta-ads/inventory-trials";
export const inventoryCountryMetrics = [
  { key: "activation", label: "Activación", width: 118 },
  { key: "factor", label: "Factor %", width: 86 },
  { key: "status", label: "Estado", width: 140 },
] as const;
type Point = {
  row: TrialReport["rows"][number];
  groupId: string;
  groupName: string;
};
export function useInventoryCountryEvaluation(
  listId: string,
  directory: TrialDirectory | null,
  visibleNames: string[],
  enabled: boolean,
  nonce: number,
) {
  const visible = new Set(visibleNames.map(categoryKey));
  const namesById = new Map(
    directory?.catalog.map((i) => [i.id, i.name]) ?? [],
  );
  const groupIds = (directory?.groups ?? [])
    .filter(
      (g) =>
        !g.reserve &&
        (g.members.some((m) =>
          visible.has(categoryKey(namesById.get(m.itemId) ?? m.name)),
        ) ||
          g.cycles.some(
            (c) =>
              !c.until &&
              visible.has(categoryKey(namesById.get(c.itemId) ?? c.name)),
          )),
    )
    .map((g) => g.id)
    .sort();
  const requestKey = groupIds.join(",");
  const revisionKey = groupIds
    .map((id) => directory?.groups.find((g) => g.id === id)?.revision ?? 0)
    .join(",");
  const stamp = JSON.stringify([
    listId,
    requestKey,
    revisionKey,
    enabled,
    nonce,
  ]);
  const [responseStamp, setResponseStamp] = useState("");
  const [response, setResponse] = useState<InventoryCatalogTrialReport | null>(
      null,
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      inFlight = false;
    setResponse(null);
    setError("");
    setLoading(false);
    async function load() {
      if (!enabled || !requestKey || document.hidden || inFlight) return;
      inFlight = true;
      if (active) setLoading(true);
      try {
        const result: InventoryCatalogTrialReport = await api(
          "meta-ads/inventory/trials/catalog-report?" +
            new URLSearchParams({
              listId,
              groupIds: requestKey,
              until: limaToday(),
            }),
        );
        if (active) {
          setResponse(result);
          setResponseStamp(stamp);
          setError("");
        }
      } catch (e) {
        if (active) {
          setResponse(null);
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo actualizar la evaluación.",
          );
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [listId, requestKey, revisionKey, enabled, nonce]);
  const currentResponse = responseStamp === stamp ? response : null;
  const lookup = useMemo(() => {
    const map = new Map<string, Point[]>();
    for (const report of currentResponse?.reports ?? [])
      for (const row of report.rows) {
        const key = JSON.stringify([categoryKey(row.name), row.country]);
        const points = map.get(key) ?? [];
        points.push({
          row,
          groupId: report.groupId,
          groupName:
            directory?.groups.find((g) => g.id === report.groupId)?.name ??
            "Grupo",
        });
        map.set(key, points);
      }
    return map;
  }, [currentResponse, directory]);
  return {
    lookup,
    loading,
    error,
    errors: currentResponse?.errors ?? [],
    until: currentResponse?.until ?? limaToday(),
  };
}
const money = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("es-PE", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(n);
const number = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(n);
const percent = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("es-PE", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(n);
export function InventoryCountryCells({
  name,
  countries,
  evaluation,
  group,
  reserved,
  onOpen,
  canEdit = false,
  onChanged,
}: {
  name: string;
  countries: string[];
  evaluation: ReturnType<typeof useInventoryCountryEvaluation>;
  group?: string;
  reserved?: boolean;
  onOpen: (groupId: string) => void;
  canEdit?: boolean;
  onChanged: () => void;
}) {
  const [changing, setChanging] = useState(""),
    [changeError, setChangeError] = useState("");
  async function toggle(point: Point) {
    if (changing || !canEdit) return;
    setChanging(point.row.country);
    setChangeError("");
    let changed = 0;
    try {
      const active = point.row.activation !== "ACTIVE",
        today = limaToday();
      const tables = [...new Set(point.row.sheets.map((s) => s.tableId))];
      for (const tableId of tables) {
        const sheet: EffectivenessSheet = await api(
          "meta-ads/effectiveness?" +
            new URLSearchParams({ tableId, since: today, until: today }),
        );
        const ids = new Set(
          sheet.table.aliases
            .filter((a) => categoryKey(a.name) === categoryKey(name))
            .map((a) => a.id),
        );
        const targets = sheet.rows.filter(
          (r) =>
            ids.has(r.aliasId) &&
            r.country === point.row.country &&
            r.active !== active,
        );
        if (targets.length) {
          await api("meta-ads/effectiveness/states", "PATCH", {
            tableId,
            since: today,
            until: today,
            metrics: ["sales", "budget"],
            active,
            targets: targets.map((r) => ({
              aliasId: r.aliasId,
              country: r.country,
              revision: r.stateRevision,
            })),
          });
          changed += targets.length;
        }
      }
    } catch (e) {
      setChangeError(
        (changed ? "Algunas hojas se actualizaron. " : "") +
          (e instanceof Error
            ? e.message
            : "No se pudo cambiar la activación."),
      );
    } finally {
      setChanging("");
      onChanged();
    }
  }
  return (
    <>
      {countries.map((country) => {
        const points =
          evaluation.lookup.get(JSON.stringify([categoryKey(name), country])) ??
          [];
        const problem =
          evaluation.error ||
          evaluation.errors.find((e) => e.groupId === group)?.message;
        if (points.length !== 1) {
          const text =
            points.length > 1
              ? "Varios seguimientos"
              : problem
                ? "No disponible"
                : evaluation.loading && group
                  ? "Cargando…"
                  : reserved
                    ? "Reserva"
                    : "Sin seguimiento";
          return (
            <Fragment key={country}>
              <td
                data-inventory-country={country}
                data-country-metric="activation"
              >
                <span className="trial-sheet-activation trial-sheet-UNKNOWN">
                  <i aria-hidden="true" />
                  N.A.
                </span>
              </td>
              <td data-inventory-country={country} data-country-metric="factor">
                —
              </td>
              <td
                data-inventory-country={country}
                data-country-metric="status"
                title={problem || undefined}
              >
                {text}
                {points.map((p) => (
                  <button
                    key={p.groupId}
                    aria-label={`Detalle de ${name} en ${countryName(country)} · ${p.groupName}`}
                    onClick={() => onOpen(p.groupId)}
                  >
                    {p.groupName}
                  </button>
                ))}
              </td>
            </Fragment>
          );
        }
        const { row, groupId, groupName } = points[0],
          assessment = row.budgetEvaluation;
        const label = {
          ACTIVE: "Activado",
          INACTIVE: "Desactivado",
          MIXED: "Mixto",
          UNKNOWN: "Sin registro",
        }[row.activation];
        const title =
          `${groupName} · ${countryName(country)} · Desde ${row.since}. Hojas: ` +
          row.sheets
            .map((s) => `${s.name}: ${s.active ? "activado" : "desactivado"}`)
            .join("; ");
        return (
          <Fragment key={country}>
            <td
              data-inventory-country={country}
              data-country-metric="activation"
              title={title}
            >
              <button
                type="button"
                disabled={
                  !canEdit || !!changing || row.activation === "UNKNOWN"
                }
                onClick={() => void toggle(points[0])}
                role="switch"
                aria-checked={
                  row.activation === "MIXED"
                    ? "mixed"
                    : row.activation === "ACTIVE"
                }
                aria-label={`Activación de ${name} en ${countryName(country)}: ${label}`}
                className={
                  "trial-sheet-activation trial-sheet-" + row.activation
                }
              >
                <i aria-hidden="true" />
                {changing === country ? "Guardando…" : label}
              </button>
              {changeError && <small role="alert">{changeError}</small>}
            </td>
            <td
              data-inventory-country={country}
              data-country-metric="factor"
              title={`Presupuesto acumulado: S/ ${money(row.budget)} · Ventas: ${number(row.sales)} · Días evaluados: ${row.activeDays} · Límite: S/ ${money(assessment.limit)}. Factor = presupuesto acumulado ÷ límite × 100.`}
            >
              {percent(assessment.usage)}
              {(!row.complete.sales || !row.complete.budget) &&
              assessment.usage !== null
                ? " *"
                : ""}
            </td>
            <td data-inventory-country={country} data-country-metric="status">
              <button
                type="button"
                className={
                  "trial-status trial-" +
                  (row.paused ? "PAUSED" : assessment.status)
                }
                aria-label={`Detalle de ${name} en ${countryName(country)}`}
                title={title}
                onClick={() => onOpen(groupId)}
              >
                {row.paused
                  ? "Seguimiento pausado"
                  : trialStatusNames[assessment.status]}
              </button>
            </td>
          </Fragment>
        );
      })}
    </>
  );
}
