"use client";
import { applyMetaStatusAck, type MetaStatusAck } from "../../lib/meta-ads/status-ack";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "./meta-ads";
import { fetchJsonResponse } from "../../lib/http-response";
import {
  formatMetaMoney,
  localMetaDay,
} from "../../lib/meta-ads/display-format";
import { quickRange } from "../../lib/meta-ads/date-range";
import { campaignEvaluationWindow } from "../../lib/meta-ads/campaign-evaluation-window";
import { MetaCampaignAssessment } from "./meta-campaign-assessment";
import { DetailStickyHeader } from "./detail-sticky-header";
import { MetaAnalysisPeriod } from "./meta-analysis-period";
import { MetaDiplomaOverview } from "./meta-diploma-overview";
import { MetaDailyDetail } from "./meta-daily-detail";
type MetricRow = {
  id: string;
  name: string;
  value: number | null;
  text: string;
  shared?: boolean;
};
function ComparisonBars({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: MetricRow[];
  tone: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <section className={"meta-selection-bars " + tone} aria-label={title}>
      <h3>{title}</h3>
      <div className="meta-selection-bar-list">
        {rows.map((r) => (
          <div className="meta-selection-bar-row" key={r.id} title={r.name}>
            <span className="meta-selection-bar-name">{r.name}</span>
            <strong>
              {r.text}
              {r.shared ? " · compartidas" : ""}
            </strong>
            <div
              className="meta-selection-bar-track"
              role="img"
              aria-label={`${r.name}: ${r.text}${r.shared ? ", ventas compartidas" : ""}`}
            >
              {r.value !== null && (
                <span style={{ width: `${(r.value / max) * 100}%` }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
export function MetaSelectionDetail({
  ids,
  accounts,
  level,
  initialPeriod = "7",
  initialSince,
  initialUntil,
  onClose,
  dataRevision = 0,
  statusAck = null,
}: {
  dataRevision?: number;
  statusAck?: MetaStatusAck | null;
  ids: string[];
  accounts: string[];
  level: string;
  initialPeriod?: string;
  initialSince?: string;
  initialUntil?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    today = localMetaDay("America/Lima");
  const [preset, setPreset] = useState(initialPeriod),
    [range, setRange] = useState<[string, string]>(() =>
      initialSince && initialUntil
        ? [initialSince, initialUntil]
        : quickRange(
            initialPeriod === "custom" || initialPeriod === "lifetime"
              ? "7"
              : initialPeriod,
            today,
          ),
    );
  const requestedScope = useRef("");
  const [rows, setRows] = useState<Item[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [expanded, setExpanded] = useState<Set<string>>(new Set());
  const latestAck = useRef(statusAck);
  latestAck.current = statusAck;
  useEffect(() => {
    if (statusAck) setRows(old => old.map(item => applyMetaStatusAck(item, statusAck)));
  }, [statusAck]);
  const [since, until] = range,
    idsKey = [...ids].sort().join(","),
    accountsKey = [...accounts].sort().join(","),
    period = preset === "lifetime" ? "lifetime" : "custom";
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const scope = JSON.stringify([
      accountsKey,
      idsKey,
      level,
      period,
      since,
      until,
    ]);
    if (requestedScope.current !== scope) {
      setRows([]);
      setExpanded(new Set());
      requestedScope.current = scope;
    }
    const q = new URLSearchParams({
      accounts: accountsKey,
      level,
      objectSelection: idsKey,
      limit: "100",
      summary: "0",
      sort: "start",
      analysisPeriod: period,
      ...(period === "custom" ? { since, until } : {}),
    });
    void fetchJsonResponse<{ items: Item[] }>("/api/meta-ads/dashboard?" + q, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setRows(data.items.map(item => latestAck.current ? applyMetaStatusAck(item, latestAck.current) : item));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo consultar la selección.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accountsKey, idsKey, level, period, since, until, reload, dataRevision]);
  const comparison = useMemo(
    () =>
      rows.map((o) => {
        const p = o.periods[period],
          available =
            !!p &&
            (p.reportedMeta ||
              (p.state !== "UNAVAILABLE" && p.metaAvailable !== false));
        const evaluation = campaignEvaluationWindow(
          o.periods,
          period,
          localMetaDay(o.timezone),
        );
        return {
          o,
          p,
          spend: available ? p.spend : null,
          results: available && o.metric !== "UNKNOWN" ? p.results : null,
          v: p?.sales,
          evaluation,
        };
      }),
    [rows, period],
  );
  const currencies = [...new Set(rows.map((o) => o.currency))];
  const salesRows = comparison.map(({ o, v }) => ({
    id: o.id,
    name: o.name,
    value: v?.sales ?? null,
    text:
      v?.sales == null ? "Sin registro" : `${v.sales}${v.partial ? "*" : ""}`,
    shared: (v?.sharedCampaigns ?? 0) > 1,
  }));
  return (
    <dialog
      ref={dialog}
      className="meta-detail meta-selection-detail"
      aria-label="Detalle comparativo de la selección"
      onCancel={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <DetailStickyHeader>
      <header className="row spread">
        <div>
          <h2>
            Comparar selección · {ids.length}{" "}
            {level === "campaign"
              ? "campañas"
              : level === "adset"
                ? "conjuntos"
                : "anuncios"}
          </h2>
          <p>Ventas, gasto y resultados del mismo período.</p>
        </div>
        <button type="button" className="ui-close-button" onClick={onClose}>
          Cerrar detalle
        </button>
      </header>
      <div className="meta-selection-period row">
        <MetaAnalysisPeriod
          label="Período de comparación"
          lifetimeLabel="Desde el inicio guardado"
          today={today}
          value={preset}
          since={since}
          until={until}
          onPreset={(key, selectedRange) => {
            setPreset(key);
            if (key !== "lifetime")
              setRange(selectedRange ?? quickRange(key, today));
          }}
          onRange={(from, to) => {
            setPreset("custom");
            setRange([from, to]);
          }}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => setReload((v) => v + 1)}
        >
          Actualizar comparación
        </button>
      </div>
      </DetailStickyHeader>
      {level === "campaign" && (
        <div hidden={!rows.length}>
          <MetaDiplomaOverview
            items={rows}
            period={period}
            since={since}
            until={until}
            onChanged={() => setReload((v) => v + 1)}
          />
        </div>
      )}
      {loading && rows.length > 0 && (
        <small role="status">Actualizando métricas del período…</small>
      )}
      {error && rows.length > 0 && (
        <p role="alert">{error} Se conserva la última lectura.</p>
      )}
      {loading && !rows.length ? (
        <p role="status">Consultando los elementos seleccionados…</p>
      ) : error && !rows.length ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <div className="meta-selection-kpis">
            <strong>{rows.length} elementos comparados</strong>
            {currencies.map((currency) => {
              const values = comparison.filter(
                  (r) => r.o.currency === currency,
                ),
                known = values.filter((r) => r.spend !== null);
              return (
                <span key={currency}>
                  Gasto Meta · {currency}{" "}
                  <b>
                    {known.length
                      ? formatMetaMoney(
                          known.reduce((n, r) => n + r.spend!, 0),
                          currency,
                        ) +
                        (known.length < values.length ||
                        known.some((r) => r.p?.metaPartial)
                          ? "*"
                          : "")
                      : "Sin informe"}
                  </b>
                </span>
              );
            })}
          </div>
          <details
            className="meta-selection-campaign-breakdown"
            open={level !== "campaign"}
          >
            <summary>
              Campañas seleccionadas e histórico individual ({rows.length})
            </summary>
            <div className="meta-selection-chart-grid">
              {level === "campaign" ? (
                <ComparisonBars
                  title="Ventas registradas"
                  rows={salesRows}
                  tone="sales"
                />
              ) : (
                <section className="meta-selection-bars">
                  <h3>Resultados por elemento</h3>
                  <p>
                    Las ventas se vinculan a campañas. Este nivel no tiene
                    ventas propias atribuidas.
                  </p>
                  {[...new Set(rows.map((o) => o.metric))].map((metric) => (
                    <ComparisonBars
                      key={metric}
                      title={
                        rows.find((o) => o.metric === metric)?.metricName ??
                        metric
                      }
                      tone="results"
                      rows={comparison
                        .filter((r) => r.o.metric === metric)
                        .map((r) => ({
                          id: r.o.id,
                          name: r.o.name,
                          value: r.results,
                          text:
                            r.results === null
                              ? "Sin informe"
                              : String(r.results),
                        }))}
                    />
                  ))}
                </section>
              )}
              <div>
                {currencies.map((currency) => (
                  <ComparisonBars
                    key={currency}
                    title={`Gasto Meta · ${currency}`}
                    tone="spend"
                    rows={comparison
                      .filter((r) => r.o.currency === currency)
                      .map((r) => ({
                        id: r.o.id,
                        name: r.o.name,
                        value: r.spend,
                        text:
                          r.spend === null
                            ? "Sin informe"
                            : formatMetaMoney(r.spend, currency) +
                              (r.p?.metaPartial ? "*" : ""),
                      }))}
                  />
                ))}
              </div>
            </div>
            <p className="hint">
              Cada barra corresponde a un elemento seleccionado. Las ventas
              compartidas se señalan; no se suman como ventas distintas. *
              Parcial; sin registro no equivale a cero. Monedas separadas.
            </p>
            <div className="meta-table">
              <table className="meta-selection-comparison">
                <caption>
                  Comparación del período · estado reciente indicado por campaña
                </caption>
                <thead>
                  <tr>
                    <th>Campaña / elemento</th>
                    <th>Ventas</th>
                    <th>Resultados</th>
                    <th>Gasto Meta</th>
                    <th>CAC del período</th>
                    <th>Efectividad V/B</th>
                    <th>Evaluación / entrega</th>
                    <th>Histórico</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map(({ o, p, v, spend, results, evaluation }) => (
                    <Fragment key={o.id}>
                      <tr data-selected-detail-id={o.id}>
                        <th>
                          {o.name}
                          <small>
                            {o.accountName} ·{" "}
                            {o.alias?.name ?? "Sin inventario"} ·{" "}
                            {o.aliasCountry ?? "Sin país"}
                          </small>
                        </th>
                        <td>
                          {o.level !== "campaign"
                            ? "No atribuibles"
                            : v?.sales == null
                              ? "Sin registro"
                              : `${v.sales}${v.partial ? "*" : ""}${(v.sharedCampaigns ?? 0) > 1 ? " · compartidas" : ""}`}
                        </td>
                        <td>{results ?? "Sin informe"}</td>
                        <td>
                          {spend === null
                            ? "Sin informe"
                            : formatMetaMoney(spend, o.currency) +
                              (p?.metaPartial ? "*" : "")}
                        </td>
                        <td>
                          {v?.cac == null
                            ? "—"
                            : formatMetaMoney(v.cac, o.currency) +
                              (v.provisional ? "*" : "")}
                        </td>
                        <td>
                          {v?.effectiveness == null
                            ? "—"
                            : `${v.effectiveness.toFixed(2)}%${v.provisional ? "*" : ""}`}
                        </td>
                        <td>
                          {o.level === "campaign" ? (
                            <>
                              <MetaCampaignAssessment
                                value={evaluation.period?.sales}
                                compact
                                today={localMetaDay(o.timezone)}
                              />
                              <small>
                                {evaluation.label} ·{" "}
                                {evaluation.period
                                  ? `${evaluation.period.since} – ${evaluation.period.until}`
                                  : "Sin período reciente"}
                              </small>
                            </>
                          ) : (
                            <span>
                              {o.status === "ACTIVE"
                                ? "Activo"
                                : o.status === "PAUSED"
                                  ? "Pausado"
                                  : o.status}
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            aria-expanded={expanded.has(o.id)}
                            aria-label={`Ver histórico de ${o.name}`}
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(o.id)) next.delete(o.id);
                                else next.add(o.id);
                                return next;
                              })
                            }
                          >
                            {expanded.has(o.id)
                              ? "Ocultar histórico"
                              : "Ver histórico"}
                          </button>
                        </td>
                      </tr>
                      {expanded.has(o.id) && (
                        <tr>
                          <td colSpan={8}>
                            <section aria-label={`Histórico de ${o.name}`}>
                              <h3>{o.name} · histórico guardado</h3>
                              <MetaDailyDetail
                                item={o}
                                initialPeriod="lifetime"
                              />
                            </section>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="hint">
            El histórico diario se consulta solo al desplegar un elemento. Desde
            el inicio incluye lo guardado; no descarga automáticamente el
            histórico de Meta.
          </p>
        </>
      )}
    </dialog>
  );
}
