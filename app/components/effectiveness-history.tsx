"use client";
import { useEffect, useId, useRef, useState } from "react";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { engineRequest as api } from "./generation-engine";
import {
  sheetMetrics,
  type SheetMetric,
} from "../../lib/meta-ads/period-summary";
import { MetaDateRange } from "./meta-date-range";
import { MetaDailyChart } from "./meta-daily-chart";
import type { ActivePeriod } from "../../lib/meta-ads/active-periods";
type Cell = Record<SheetMetric, number | null> & {
  na: SheetMetric[];
  fxMissing: boolean;
};
type Detail = {
  name: string;
  tableName: string;
  currency: string;
  active: boolean;
  days: Record<string, Cell>;
  activePeriods: ActivePeriod[];
  asOf: string;
};
const stamp = (s: string) =>
  new Date(s).toLocaleString("es-PE", { timeZone: "America/Lima" });
export function EffectivenessHistory({
  aliasId,
  country,
  name,
  initialSince,
  initialUntil,
  onPeriod,
}: {
  aliasId: string;
  country: string;
  name: string;
  initialSince: string;
  initialUntil: string;
  onPeriod: (period: ActivePeriod) => void;
}) {
  const id = useId(),
    pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [since, setSince] = useState(initialSince),
    [until, setUntil] = useState(initialUntil),
    [data, setData] = useState<Detail | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [bars, setBars] = useState<SheetMetric>("sales"),
    [line, setLine] = useState<SheetMetric>("budget"),
    [page, setPage] = useState(0),
    [reload, setReload] = useState(0),
    [position, setPosition] = useState({ top: 8, left: 8 });
  const query =
      "meta-ads/effectiveness/detail?" +
      new URLSearchParams({ aliasId, country, since, until }),
    valid =
      since <= until && (Date.parse(until) - Date.parse(since)) / 86400000 < 31;
  useEffect(() => {
    if (!open || !valid) return;
    let active = true;
    setLoading(true);
    setData(null);
    setMessage("");
    let version = 0;
    const load = () => {
      if (document.hidden) return;
      const request = ++version;
      void api(query)
        .then((v: Detail) => {
          if (active && request === version) setData(v);
        })
        .catch((e) => {
          if (active && request === version) setMessage(e.message);
        })
        .finally(() => {
          if (active && request === version) setLoading(false);
        });
    };
    load();
    const timer = setInterval(load, 30000),
      unsubscribe = subscribeAdvisorSalesChanged(load);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [query, open, valid, reload]);
  const pageCount = Math.max(
      1,
      Math.ceil((data?.activePeriods.length ?? 0) / 5),
    ),
    currentPage = Math.min(page, pageCount - 1);
  const dates: string[] = [];
  if (valid)
    for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
      dates.push(new Date(d).toISOString().slice(0, 10));
  const metric = (key: SheetMetric) => sheetMetrics.find((m) => m.key === key)!,
    bar = metric(bars),
    dot = metric(line),
    value = (day: string, key: SheetMetric) =>
      data?.days[day]?.na.includes(key)
        ? null
        : (data?.days[day]?.[key] ?? null);
  const chart = dates.map((day) => ({
    day,
    results: value(day, bars),
    cost: value(day, line),
    spend: null,
  }));
  return (
    <>
      <button
        type="button"
        className="sheet-history-trigger"
        aria-label={`Detalle de ${name} ${country || "sin país"}`}
        disabled={!country}
        title="Ver estados por fecha y evolución de parámetros"
        popoverTarget={id}
        onClick={(e) => {
          setSince(initialSince);
          setUntil(initialUntil);
          setPage(0);
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 920)),
            top: Math.max(8, Math.min(r.bottom + 3, innerHeight - 640)),
          });
        }}
      >
        ⓘ
      </button>
      <div
        id={id}
        ref={pop}
        popover="auto"
        className="sheet-state-history alias-state-detail"
        aria-label={`Detalle del inventario ${name} ${country}`}
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
        onToggle={(e) => setOpen(e.newState === "open")}
      >
        {open && (
          <>
            <header className="row">
              <strong>
                {name} · {country}
              </strong>
              <button type="button" onClick={() => pop.current?.hidePopover()}>
                Cerrar
              </button>
            </header>
            <div className="row alias-detail-controls">
              <MetaDateRange
                from={since}
                to={until}
                onChange={(a, b) => {
                  setSince(a);
                  setUntil(b);
                  setPage(0);
                }}
              />
              <button
                type="button"
                disabled={loading || !valid}
                onClick={() => setReload((v) => v + 1)}
              >
                Actualizar detalle
              </button>
            </div>
            {!valid && <p role="alert">Elige hasta 31 días.</p>}
            {message && <p role="alert">{message}</p>}
            {loading && <p role="status">Cargando detalle…</p>}
            {data && (
              <>
                <p>
                  Estado actual:{" "}
                  <b>{data.active ? "Activado" : "Desactivado"}</b>. Historial
                  de Efectividad de este inventario y país; no cambia estados en
                  Meta Ads.
                </p>
                <h3>Últimas activaciones</h3>
                <p className="hint">
                  Historial completo, de más reciente a más antiguo. Fechas
                  guardadas automáticamente (Lima).
                </p>
                {data.activePeriods.length ? (
                  <ol className="alias-active-periods">
                    {data.activePeriods
                      .slice(currentPage * 5, currentPage * 5 + 5)
                      .map((period) => (
                        <li key={period.id}>
                          <div>
                            <strong
                              title={`Activado el ${stamp(period.from)} (Lima)`}
                            >
                              {period.until
                                ? `Del ${new Date(period.since + "T12:00:00Z").toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "America/Lima" })} al ${new Date(period.through + "T12:00:00Z").toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "America/Lima" })}`
                                : `Desde el ${new Date(period.since + "T12:00:00Z").toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "America/Lima" })} hasta la fecha`}
                            </strong>
                            <small>
                              {period.until
                                ? `Se desactivó el ${stamp(period.until)} (Lima).`
                                : `Activo al ${stamp(data.asOf)} (Lima).`}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="alias-period-link"
                            aria-label={`Ir al período activo ${period.since} — ${period.through}`}
                            onClick={() => {
                              pop.current?.hidePopover();
                              onPeriod(period);
                            }}
                          >
                            Ir al período
                          </button>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p>
                    No hay períodos activos registrados. Se registrarán
                    automáticamente cuando actives esta fila.
                  </p>
                )}
                {data.activePeriods.length > 5 && (
                  <nav
                    className="alias-period-pagination"
                    aria-label="Páginas de activaciones"
                  >
                    <span>
                      {currentPage * 5 + 1}–
                      {Math.min(currentPage * 5 + 5, data.activePeriods.length)}{" "}
                      de {data.activePeriods.length} activaciones · Página{" "}
                      {currentPage + 1} de {pageCount}
                    </span>
                    <div className="row">
                      <button
                        disabled={currentPage === 0}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        Más recientes
                      </button>
                      <button
                        disabled={currentPage + 1 >= pageCount}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        Anteriores
                      </button>
                    </div>
                  </nav>
                )}
                <h3>Evolución de parámetros</h3>
                <div className="row alias-detail-controls">
                  <label>
                    1 · Barras
                    <select
                      aria-label="Barras del detalle del inventario"
                      value={bars}
                      onChange={(e) => {
                        const v = e.target.value as SheetMetric;
                        setBars(v);
                        if (v === line)
                          setLine(v === "sales" ? "budget" : "sales");
                      }}
                    >
                      {sheetMetrics.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.key === "base" ? "Base" : m.name} ({m.label})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    2 · Línea con puntos
                    <select
                      aria-label="Línea del detalle del inventario"
                      value={line}
                      onChange={(e) => {
                        const v = e.target.value as SheetMetric;
                        setLine(v);
                        if (v === bars)
                          setBars(v === "sales" ? "budget" : "sales");
                      }}
                    >
                      {sheetMetrics.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.key === "base" ? "Base" : m.name} ({m.label})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <MetaDailyChart
                  rows={chart}
                  bars="results"
                  line="cost"
                  currency={data.currency || "PEN"}
                  metricName="Ventas"
                  since={since}
                  until={until}
                  labels={{
                    results: `${bar.name} (${bar.label})`,
                    cost: `${dot.name} (${dot.label})`,
                  }}
                  units={{
                    results: bar.money && data.currency ? "currency" : "count",
                    cost: dot.money && data.currency ? "currency" : "count",
                  }}
                />
                <div className="table-scroll">
                  <table className="alias-parameter-days">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        {sheetMetrics.map((m) => (
                          <th key={m.key} title={m.name}>
                            {m.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dates.map((day) => (
                        <tr key={day}>
                          <th>{day}</th>
                          {sheetMetrics.map((m) => (
                            <td
                              key={m.key}
                              data-na={
                                data.days[day]?.na.includes(m.key) || undefined
                              }
                            >
                              {data.days[day]?.na.includes(m.key)
                                ? "N.A."
                                : value(day, m.key) === null
                                  ? "—"
                                  : new Intl.NumberFormat("es-PE", {
                                      maximumFractionDigits: m.money ? 2 : 0,
                                    }).format(value(day, m.key)!)}
                              {m.money &&
                              value(day, m.key) !== null &&
                              data.currency
                                ? " " + data.currency
                                : ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  Los parámetros corresponden a los datos actuales guardados por
                  día; el historial de estados conserva las fechas reales de
                  cada cambio. N.A. y los vacíos no se convierten en cero.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
