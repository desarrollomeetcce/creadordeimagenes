"use client";
import { fetchJsonResponse } from "../../lib/http-response";
import { useEffect, useState } from "react";
import { compareDailyRows, type DailySort } from "../../lib/meta-ads/order";
import { localDay, summarize } from "../../lib/meta-ads/analytics";
import { quickRange } from "../../lib/meta-ads/date-range";
import { MetaDailyTrend } from "./meta-daily-trend";
import { MetaDailyChart } from "./meta-daily-chart";
import type { DailyChartMetric } from "../../lib/meta-ads/daily-chart";
import { campaignSalesPeriod } from "../../lib/meta-ads/campaign-performance";
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
  level?: string;
};
type DailySales = {
  linked: boolean;
  sharedCampaigns: number;
  days: { day: string; sales: number | null; partial: boolean }[];
};
const date = (value: string) =>
  new Date(value + "T12:00:00Z").toLocaleDateString("es-PE", {
    timeZone: "UTC",
  });
export function MetaDailyDetail({
  item,
  initialPeriod = "30",
  initialSince,
  initialUntil,
}: {
  item: DailyItem;
  initialPeriod?: string;
  initialSince?: string;
  initialUntil?: string;
}) {
  const today = localDay(item.timezone);
  const [preset, setPreset] = useState(initialPeriod),
    [range, setRange] = useState<[string, string]>(() =>
      initialSince && initialUntil
        ? [initialSince, initialUntil]
        : quickRange("30", today),
    ),
    [sales, setSales] = useState<DailySales | null>(null),
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
    setSales(null);
    const query =
      preset === "lifetime"
        ? new URLSearchParams({ all: "1" })
        : new URLSearchParams({ since, until });
    if (item.level === "campaign") query.set("sales", "1");
    void fetchJsonResponse<
      DailyRow[] | { rows: DailyRow[]; sales: DailySales | null }
    >(`/api/meta-ads/objects/${item.id}/daily?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setRows(Array.isArray(data) ? data : data.rows);
          setSales(Array.isArray(data) ? null : data.sales);
        }
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
  }, [item.id, item.level, preset, since, until]);
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
      impressions: row.impressions,
      clicks: row.clicks,
    };
  });
  const first =
    preset === "lifetime"
      ? ([
          ...rows.map((r) => r.day),
          ...(sales?.days.map((r) => r.day) ?? []),
        ].sort()[0] ?? today)
      : since;
  const last = preset === "lifetime" ? today : until;
  const entries = (sales?.days ?? []).map((r) => ({
    ...r,
    inventory: item.id,
    name: item.id,
    country: "",
  }));
  const selectedSales = sales
    ? campaignSalesPeriod(
        entries,
        first,
        last,
        values.reduce((s, r) => s + r.spend, 0),
        values.reduce((s, r) => s + (r.results ?? 0), 0),
        values.length > 0 && knownMetric,
        sales.sharedCampaigns,
        sales.linked,
      )
    : null;
  const days = new Map(values.map((r) => [r.day, r]));
  const sortedRows = [
    ...new Set([
      ...values.map((r) => r.day),
      ...(sales?.days.map((r) => r.day) ?? []),
    ]),
  ]
    .map((day) => {
      const row = days.get(day),
        sold = sales?.days.find((r) => r.day === day);
      const v =
        row && sales
          ? campaignSalesPeriod(
              entries,
              day,
              day,
              row.spend,
              row.results ?? 0,
              knownMetric,
              sales.sharedCampaigns,
              sales.linked,
            )
          : null;
      return {
        day,
        spend: row?.spend ?? null,
        results: row?.results ?? null,
        cost: row?.cost ?? null,
        sales: sold?.sales ?? null,
        partial: sold?.partial,
        cac: v?.cac ?? null,
      };
    })
    .sort((a, b) => compareDailyRows(a, b, sort));
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
        {!loading && !error && selectedSales && (
          <p className="meta-campaign-selected-sales">
            <strong>
              {!selectedSales.linked
                ? "Campaña sin vincular"
                : selectedSales.sales === null
                  ? "Ventas sin registro"
                  : `${selectedSales.sales}${selectedSales.partial ? "*" : ""} ventas`}
            </strong>{" "}
            · CAC {selectedSales.cac != null ? money(selectedSales.cac) : "—"} ·
            Efectividad V/B{" "}
            {selectedSales.effectiveness != null
              ? `${selectedSales.effectiveness.toFixed(1)}%`
              : "—"}
            {selectedSales.sharedCampaigns > 1 && (
              <small>
                Ventas compartidas entre {selectedSales.sharedCampaigns}{" "}
                campañas; no hay atribución ni CAC individual.
              </small>
            )}
            {selectedSales.partial && (
              <small>
                * Faltan días de ventas. No se interpretan como cero.
              </small>
            )}
          </p>
        )}
        {loading ? (
          <p role="status">Cargando histórico diario…</p>
        ) : error ? (
          <p role="alert" className="notice">
            {error}
          </p>
        ) : !sortedRows.length ? (
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
            <MetaDailyTrend
              rows={values}
              since={
                preset === "lifetime"
                  ? (rows.map((r) => r.day).sort()[0] ?? since)
                  : since
              }
              until={preset === "lifetime" ? today : until}
              today={today}
              currency={item.currency}
              metricName={item.metricName}
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
                    {sales && (
                      <>
                        <th>Ventas</th>
                        <th>CAC</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.day} data-day={row.day}>
                      <td>{date(row.day)}</td>
                      <td>{row.spend === null ? "—" : money(row.spend)}</td>
                      <td>
                        {row.results === null
                          ? "No identificado"
                          : row.results.toLocaleString("es-PE")}
                      </td>
                      <td>{row.cost === null ? "—" : money(row.cost)}</td>
                      {sales && (
                        <>
                          <td className="meta-sale-count">
                            {row.sales === null
                              ? "—"
                              : `${row.sales}${row.partial ? "*" : ""}`}
                          </td>
                          <td>{row.cac !== null ? money(row.cac) : "—"}</td>
                        </>
                      )}
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
