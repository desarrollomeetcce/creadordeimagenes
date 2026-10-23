"use client";
import { fetchJsonResponse } from "../../lib/http-response";
import { useEffect, useState } from "react";
import { compareDailyRows, type DailySort } from "../../lib/meta-ads/order";
import { localDay, summarize } from "../../lib/meta-ads/analytics";
import { quickRange } from "../../lib/meta-ads/date-range";
import { MetaDailyChart } from "./meta-daily-chart";
import type { DailyChartMetric } from "../../lib/meta-ads/daily-chart";
import { MetaAnalysisPeriod } from "./meta-analysis-period";
type DailyRow = {
  day: string;
  spend: string;
  impressions: number;
  clicks: number;
  actions: Record<string, number>;
};
type DailyItem = {
  id: string;
  currency: string;
  timezone: string;
  metric: string;
  metricName: string;
};
const date = (value: string) =>
  new Date(value + "T12:00:00Z").toLocaleDateString("es-PE", {
    timeZone: "UTC",
  });
export function MetaDailyDetail({ item }: { item: DailyItem }) {
  const today = localDay(item.timezone);
  const [preset, setPreset] = useState("30"),
    [range, setRange] = useState(() => quickRange("30", today)),
    [rows, setRows] = useState<DailyRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [chart, setChart] = useState<DailyChartMetric>("cost"),
    [line, setLine] = useState<DailyChartMetric>("results");
  const [sort, setSort] = useState<DailySort>({
    key: "day",
    direction: "desc",
  });
  const [since, until] = range;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRows([]);
    const query =
      preset === "lifetime"
        ? new URLSearchParams({ all: "1" })
        : new URLSearchParams({ since, until });
    void fetchJsonResponse<DailyRow[]>(
      `/api/meta-ads/objects/${item.id}/daily?${query}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then((data) => {
        if (!controller.signal.aborted) setRows(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo consultar el histórico diario.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [item.id, preset, since, until]);
  const money = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: item.currency,
    }).format(value);
  const knownMetric = item.metric !== "UNKNOWN";
  const values = rows.map((row) => {
    const spend = Number(row.spend),
      summary = summarize(
        [{ ...row, spend }],
        item.metric,
        row.day,
        row.day,
        true,
      );
    return {
      day: row.day,
      spend,
      results: knownMetric ? summary.results : null,
      cost: summary.cost,
    };
  });
  const sortedRows = [...values].sort((a, b) => compareDailyRows(a, b, sort));
  return (
    <section className="meta-daily-detail stack" aria-label="Histórico diario">
      <div className="meta-daily-toolbar">
        <MetaAnalysisPeriod
          label="Periodo del histórico diario"
          lifetimeLabel="Todo el histórico diario guardado"
          today={today}
          timezoneLabel={item.timezone}
          value={preset}
          since={since}
          until={until}
          onPreset={(key) => {
            setPreset(key);
            if (key !== "lifetime") setRange(quickRange(key, today));
          }}
          onRange={(start, end) => {
            setPreset("custom");
            setRange([start, end]);
          }}
        />
        <label>
          1 · Barras · eje izquierdo
          <select
            aria-label="1 · Variable de las barras"
            value={chart}
            onChange={(e) => {
              const next = e.target.value as DailyChartMetric;
              if (next === line) setLine(chart);
              setChart(next);
            }}
          >
            <option value="results">{item.metricName}</option>
            <option value="spend">Gasto</option>
            <option value="cost">Costo por resultado</option>
          </select>
        </label>
        <label>
          2 · Línea con puntos · eje derecho
          <select
            aria-label="2 · Variable de la línea"
            value={line}
            onChange={(e) => {
              const next = e.target.value as DailyChartMetric;
              if (next === chart) setChart(line);
              setLine(next);
            }}
          >
            <option value="results">{item.metricName}</option>
            <option value="spend">Gasto</option>
            <option value="cost">Costo por resultado</option>
          </select>
        </label>
      </div>
      <div className="meta-daily-history" aria-busy={loading}>
        <h3>Histórico por día</h3>
        <p className="hint">
          {preset === "lifetime"
            ? "Todo el desglose diario guardado"
            : `${date(since)} – ${date(until)}`}{" "}
          · {item.timezone}
        </p>
        {loading ? (
          <p role="status">Cargando histórico diario…</p>
        ) : error ? (
          <p role="alert" className="notice">
            {error}
          </p>
        ) : !rows.length ? (
          <p role="status">
            No hay estadísticas diarias guardadas en este periodo. El acumulado
            histórico no contiene el desglose por día.
          </p>
        ) : (
          <>
            <p className="meta-daily-chart-title">
              {rows.length} día(s) con datos · barras y línea por fecha
            </p>
            <MetaDailyChart
              rows={values}
              bars={chart}
              line={line}
              currency={item.currency}
              metricName={item.metricName}
              since={preset === "lifetime" ? undefined : since}
              until={preset === "lifetime" ? undefined : until}
            />
            <div className="meta-table meta-daily-table">
              <table>
                <caption>Detalle diario · {item.metricName}</caption>
                <thead>
                  <tr>
                    {(
                      [
                        ["day", "Fecha"],
                        ["spend", "Gasto"],
                        ["results", "Resultados"],
                        ["cost", "Costo por resultado"],
                      ] as const
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        scope="col"
                        aria-sort={
                          sort.key === key
                            ? sort.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <button
                          type="button"
                          className="meta-daily-sort"
                          onClick={() =>
                            setSort((current) => ({
                              key,
                              direction:
                                current.key === key &&
                                current.direction === "asc"
                                  ? "desc"
                                  : "asc",
                            }))
                          }
                        >
                          {label}{" "}
                          <span aria-hidden="true">
                            {sort.key === key
                              ? sort.direction === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.day} data-day={row.day}>
                      <td>{date(row.day)}</td>
                      <td>{money(row.spend)}</td>
                      <td>
                        {row.results === null
                          ? "No identificado"
                          : row.results.toLocaleString("es-PE")}
                      </td>
                      <td>
                        {row.cost === null ? "Sin resultados" : money(row.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <small className="meta-daily-note">
        Solo se muestran días con datos importados. Las fechas sin registros no
        se consideran cero; hoy puede estar incompleto.
      </small>
    </section>
  );
}
