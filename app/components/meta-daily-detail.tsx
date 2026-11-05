"use client";
import { MetaCampaignAssessment } from "./meta-campaign-assessment";
import type { CacRules } from "../../lib/meta-ads/inventory-cac-policy";
import { fetchJsonResponse } from "../../lib/http-response";
import { useEffect, useMemo, useRef, useState } from "react";
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
  rules?: CacRules;
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
  dataRevision = 0,
  initialPeriod = "7",
  initialSince,
  initialUntil,
}: {
  item: DailyItem;
  dataRevision?: number;
  initialPeriod?: string;
  initialSince?: string;
  initialUntil?: string;
}) {
  const today = localDay(item.timezone);
  const [preset, setPreset] = useState(initialPeriod),
    [range, setRange] = useState<[string, string]>(() =>
      initialSince && initialUntil
        ? [initialSince, initialUntil]
        : quickRange("7", today),
    ),
    [sales, setSales] = useState<DailySales | null>(null),
    [rows, setRows] = useState<DailyRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [chart, setChart] = useState<DailyChartMetric>(
      item.level === "campaign" ? "sales" : "cost",
    ),
    [line, setLine] = useState<DailyChartMetric>(
      item.level === "campaign" ? "spend" : "results",
    );
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
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
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
  const recentRevision = useRef(dataRevision);
  useEffect(() => {
    if (recentRevision.current === dataRevision) return;
    if (loading) return;
    recentRevision.current = dataRevision;
    // Reuse the parent's saved-data signal: refresh only intersecting today/yesterday, never all history.
    const yesterday = new Date(today + "T12:00:00Z");
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const from = preset === "lifetime" ? yesterday.toISOString().slice(0,10) : [since, yesterday.toISOString().slice(0,10)].sort()[1];
    const to = preset === "lifetime" ? today : [until, today].sort()[0];
    if (from > to) return;
    const controller = new AbortController();
    const query = new URLSearchParams({since:from,until:to});
    if(item.level === "campaign") query.set("sales","1");
    void fetchJsonResponse<DailyRow[] | {rows:DailyRow[];sales:DailySales|null}>(`/api/meta-ads/objects/${item.id}/daily?${query}`,{
      cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),
    }).then(data=>{
      if(controller.signal.aborted)return;
      const incoming=Array.isArray(data)?data:data.rows;
      setRows(old=>[...old.filter(r=>r.day<from||r.day>to),...incoming]);
      if(!Array.isArray(data)&&data.sales) {
        const fresh=data.sales;
        setSales(old=>({...fresh,days:[...(old?.days??[]).filter(r=>r.day<from||r.day>to),...fresh.days]}));
      }
    }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"No se pudo actualizar el dato reciente.")});
    return ()=>controller.abort();
  },[dataRevision,item.id,item.level,preset,since,until,today,loading]);
  const money = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: item.currency,
    }).format(value);
  const knownMetric = item.metric !== "UNKNOWN";
  const values = useMemo(
    () =>
      rows.map((row) => {
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
      }),
    [rows, item.metric, knownMetric],
  );
  const first =
    preset === "lifetime"
      ? ([
          ...rows.map((r) => r.day),
          ...(sales?.days.map((r) => r.day) ?? []),
        ].sort()[0] ?? today)
      : since;
  const last = preset === "lifetime" ? today : until;
  const entries = useMemo(
    () =>
      (sales?.days ?? []).map((r) => ({
        ...r,
        inventory: item.id,
        name: item.id,
        country: "",
      })),
    [sales, item.id],
  );
  const selectedSales = useMemo(
    () =>
      sales
        ? campaignSalesPeriod(
            entries,
            first,
            last,
            values.reduce((s, r) => s + r.spend, 0),
            values.reduce((s, r) => s + (r.results ?? 0), 0),
            values.length > 0 && knownMetric,
            sales.sharedCampaigns,
            sales.linked,
            { currency: item.currency, rules: sales.rules },
          )
        : null,
    [entries, first, last, values, knownMetric, sales, item.currency],
  );
  const sortedRows = useMemo(() => {
    const days = new Map(values.map((r) => [r.day, r]));
    const salesDays = new Map((sales?.days ?? []).map((r) => [r.day, r]));
    return [
      ...new Set([
        ...values.map((r) => r.day),
        ...(sales?.days.map((r) => r.day) ?? []),
      ]),
    ]
      .map((day) => {
        const row = days.get(day),
          sold = salesDays.get(day);
        const v =
          row && sales
            ? campaignSalesPeriod(
                sold
                  ? [
                      {
                        ...sold,
                        inventory: item.id,
                        name: item.id,
                        country: "",
                      },
                    ]
                  : [],
                day,
                day,
                row.spend,
                row.results ?? 0,
                knownMetric,
                sales.sharedCampaigns,
                sales.linked,
                { currency: item.currency, rules: sales.rules },
              )
            : null;
        return {
          day,
          spend: row?.spend ?? null,
          results: row?.results ?? null,
          cost: row?.cost ?? null,
          sales: sold?.sales ?? null,
          partial: sold?.partial,
          salesPartial: sold?.partial,
          cac: v?.cac ?? null,
        };
      })
      .sort((a, b) => compareDailyRows(a, b, sort));
  }, [values, sales, knownMetric, item.id, item.currency, sort]);
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
            {item.level === "campaign" && (
              <option value="sales">Ventas por día</option>
            )}
            <option value="results">{item.metricName} por día</option>
            <option value="spend">Gasto Meta por día</option>
            <option value="cost">Costo por resultado por día</option>
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
            {item.level === "campaign" && (
              <option value="sales">Ventas por día</option>
            )}
            <option value="results">{item.metricName} por día</option>
            <option value="spend">Gasto Meta por día</option>
            <option value="cost">Costo por resultado por día</option>
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
            · CAC{" "}
            {selectedSales.cac != null
              ? money(selectedSales.cac) +
                (selectedSales.provisional ? "*" : "")
              : "—"}{" "}
            · Efectividad V/B{" "}
            {selectedSales.effectiveness != null
              ? `${selectedSales.effectiveness.toFixed(2)}%${selectedSales.provisional ? "*" : ""}`
              : "—"}
            {" · "}
            <MetaCampaignAssessment value={selectedSales} today={today} />
            <small>
              Gasto Meta del período:{" "}
              {values.length
                ? money(values.reduce((n, r) => n + r.spend, 0))
                : "—"}{" "}
              · Resultados Meta:{" "}
              {values.length && knownMetric
                ? values.reduce((n, r) => n + (r.results ?? 0), 0)
                : "—"}
              . CAC = G/V; efectividad = V/B × 100.
            </small>
            {selectedSales.sharedCampaigns > 1 && (
              <small>
                Ventas compartidas entre {selectedSales.sharedCampaigns}{" "}
                campañas; no hay atribución ni CAC individual.
              </small>
            )}
            {selectedSales.partial && (
              <small>
                * Cálculo provisional con las ventas registradas: faltan días de
                ventas. CAC y efectividad pueden cambiar al completarlos.
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
              {sortedRows.length} día(s) con registros · valores diarios, sin
              acumulados
            </p>
            <MetaDailyChart
              rows={sortedRows}
              bars={chart}
              line={line}
              currency={item.currency}
              metricName={item.metricName}
              since={first}
              until={last}
              labels={{
                sales:
                  sales && sales.sharedCampaigns > 1
                    ? "Ventas por día · compartidas"
                    : "Ventas por día",
                spend: "Gasto Meta por día",
                cost: "Costo por resultado por día",
                results: item.metricName + " por día",
              }}
            />
            {item.level === "campaign" && (
              <p className="hint">
                Ventas registradas del diplomado y país vinculados. Días sin
                registro de ventas quedan sin dato; cero significa una cifra
                registrada. * Ventas parciales. El gasto es el importe de Meta
                de cada día, no un acumulado.
              </p>
            )}
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
                        ["spend", "Gasto Meta por día"],
                        ["results", "Resultados por día"],
                        ["cost", "Costo por resultado por día"],
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
                        <th>Ventas por día</th>
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
