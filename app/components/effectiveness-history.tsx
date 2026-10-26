"use client";
import { useEffect, useId, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import {
  sheetMetrics,
  type SheetMetric,
} from "../../lib/meta-ads/period-summary";
import { MetaDateRange } from "./meta-date-range";
import { MetaDailyChart } from "./meta-daily-chart";
import type { aliasStateTimeline } from "../../lib/meta-ads/alias-state-timeline";
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
  timeline: ReturnType<typeof aliasStateTimeline>;
};
const stamp = (s: string) =>
  new Date(s).toLocaleString("es-PE", { timeZone: "America/Lima" });
export function EffectivenessHistory({
  aliasId,
  country,
  name,
  initialSince,
  initialUntil,
}: {
  aliasId: string;
  country: string;
  name: string;
  initialSince: string;
  initialUntil: string;
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
    [limit, setLimit] = useState(50),
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
    void api(query)
      .then((v: Detail) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, open, valid, reload]);
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
          setLimit(50);
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
        aria-label={`Detalle del alias ${name} ${country}`}
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
                  setLimit(50);
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
                  de Efectividad de este alias y país; no cambia estados en Meta
                  Ads.
                </p>
                <h3>Estado por fecha · horas de Lima</h3>
                <div className="row alias-state-legend">
                  <span>● Activado</span>
                  <span>● Desactivado</span>
                </div>
                <small>
                  Solo se dibujan tramos respaldados por cambios registrados.
                  Los espacios sin registro quedan vacíos; hoy llega hasta la
                  última consulta.
                </small>
                <div className="alias-state-bars">
                  <div className="alias-state-scale">
                    <span>Fecha</span>
                    <span>00:00</span>
                    <span>12:00</span>
                    <span>24:00</span>
                  </div>
                  {data.timeline.days.map((day) => (
                    <div className="alias-state-day" key={day.day}>
                      <span>
                        {day.day.slice(8)}.{day.day.slice(5, 7)}
                      </span>
                      <div
                        className="alias-state-daybar"
                        role="img"
                        aria-label={`${day.day}: ${day.activeHours.toFixed(2)} h activado, ${day.inactiveHours.toFixed(2)} h desactivado; ${day.knownHours.toFixed(2)} h con registro`}
                      >
                        {day.parts.map((part, i) => (
                          <span
                            key={i}
                            data-state={part.active ? "active" : "inactive"}
                            style={{
                              left: (part.offsetHours / 24) * 100 + "%",
                              width: (part.hours / 24) * 100 + "%",
                            }}
                            title={`${part.active ? "Activado" : "Desactivado"}: ${stamp(part.from)} — ${stamp(part.until)}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="alias-state-events">
                  {data.timeline.baseline && (
                    <p>
                      Al inicio del período:{" "}
                      <b>
                        {data.timeline.baseline.active
                          ? "Activado"
                          : "Desactivado"}
                      </b>{" "}
                      · último cambio {stamp(data.timeline.baseline.createdAt)}{" "}
                      (Lima)
                    </p>
                  )}
                  {[...data.timeline.events]
                    .reverse()
                    .slice(0, limit)
                    .map((e) => (
                      <p
                        key={e.id}
                        data-state={e.active ? "active" : "inactive"}
                      >
                        <b>{e.active ? "Activado" : "Desactivado"}</b> ·{" "}
                        {stamp(e.createdAt)} (Lima)
                      </p>
                    ))}
                  {!data.timeline.events.length && (
                    <p>Sin cambios registrados dentro de estas fechas.</p>
                  )}
                  {limit < data.timeline.events.length && (
                    <button
                      type="button"
                      onClick={() => setLimit((v) => v + 50)}
                    >
                      Ver más cambios
                    </button>
                  )}
                </div>
                <h3>Evolución de parámetros</h3>
                <div className="row alias-detail-controls">
                  <label>
                    1 · Barras
                    <select
                      aria-label="Barras del detalle del alias"
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
                      aria-label="Línea del detalle del alias"
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
