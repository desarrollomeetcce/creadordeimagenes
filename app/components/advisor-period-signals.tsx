"use client";

import { useEffect, useRef, useState } from "react";
import type { advisorPeriodSignals } from "../../lib/meta-ads/advisor-period-signals";
import { cacStatusNames } from "../../lib/meta-ads/inventory-cac-policy";
import { MetaDateRange } from "./meta-date-range";
import { PerformanceMotivation } from "./performance-motivation";
import { limaToday, shiftDay } from "./date-range";

type Data = Awaited<ReturnType<typeof advisorPeriodSignals>>;
const regionNames = new Intl.DisplayNames(["es"], { type: "region" });
const countryLabel = (country: string) =>
  /^[A-Z]{2}$/.test(country) ? (regionNames.of(country) ?? country) : country;

export function AdvisorPeriodSignals({ advisorId }: { advisorId?: string }) {
  const today = limaToday();
  const [view, setView] = useState<"today" | "yesterday">("today");
  const [since, setSince] = useState(shiftDay(today, -6));
  const [until, setUntil] = useState(today);
  const [day, setDay] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [country, setCountry] = useState("");
  const [focus, setFocus] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const requestId = useRef("");
  const endpoint = "/api/meta-ads/my-performance/period-signals";
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      since,
      until,
      ...(advisorId ? { advisorId } : {}),
    });
    void fetch(endpoint + "?" + query, { signal: controller.signal })
      .then(async (result) => {
        const value = await result.json();
        if (!result.ok) throw Error(value.error);
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [advisorId, since, until, refresh]);
  const selected = data?.items.find((item) => item.key === focus);
  async function submit() {
    if (!selected || busy) return;
    requestId.current ||= crypto.randomUUID();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId.current,
          since,
          until,
          day,
          aliasId: selected.aliasId,
          tableId: selected.tableId,
          country: selected.country,
          body,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      requestId.current = "";
      setBody("");
      setStatus("Observación guardada.");
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const valid = data?.since === since && data.until === until;
  const groups = new Map<string, Data["items"]>();
  if (valid) {
    for (const item of data.items) {
      const items = groups.get(item.country) ?? [];
      items.push(item);
      groups.set(item.country, items);
    }
  }
  const countries = [...groups.keys()].sort((a, b) =>
    countryLabel(a).localeCompare(countryLabel(b), "es"),
  );
  const selectedCountry = groups.has(country) ? country : "";
  const visibleCountries = selectedCountry ? [selectedCountry] : countries;
  const performance = data?.performance;
  const summary = performance?.[view];
  return (
    <section
      className="advisor-period-signals"
      aria-label="Diplomados por periodo"
    >
      {!advisorId && (
        <header>
          <h1>
            {performance?.advisorName
              ? `¡Hola, ${performance.advisorName}!`
              : "Mi desempeño"}
          </h1>
          <p>
            Revisa tus resultados y elige qué seguimiento priorizar para
            acercarte a tus metas.
          </p>
        </header>
      )}
      {performance && summary && (
        <article className="performance-day">
          <div
            className="performance-view-picker"
            role="group"
            aria-label="Día del desempeño"
          >
            <button
              type="button"
              aria-pressed={view === "today"}
              onClick={() => setView("today")}
            >
              Hoy
            </button>
            <button
              type="button"
              aria-pressed={view === "yesterday"}
              onClick={() => setView("yesterday")}
            >
              Ayer
            </button>
          </div>
          <div className="performance-overview-row">
            <div className="performance-values">
              <div>
                <span>Efectividad · Base de Meta</span>
                <strong>
                  {summary.percent === null
                    ? "Sin datos"
                    : summary.percent.toLocaleString("es-PE", {
                        maximumFractionDigits: 2,
                      }) + " %"}
                </strong>
              </div>
            </div>
            <PerformanceMotivation
              percent={summary.percent}
              effectivenessTarget={performance.goal}
              partial={summary.partial}
              salesTarget={performance.salesTarget}
              salesStatus={summary.dailySalesGoal}
              previous={
                view === "today"
                  ? performance.yesterday
                  : performance.dayBeforeYesterday
              }
            />
          </div>
          {summary.partial && summary.percent !== null && (
            <p className="hint">Datos parciales para esta fecha.</p>
          )}
        </article>
      )}
      <h2 id="diplomados-por-periodo">Diplomados por periodo</h2>
      <div className="row advisor-period-controls">
        <MetaDateRange
          from={since}
          to={until}
          maxDays={31}
          triggerAriaLabel="Periodo de evaluación de diplomados"
          applyLabel="Evaluar periodo"
          onChange={(from, to) => {
            setSince(from);
            setUntil(to);
            setDay(to);
            setFocus("");
            setBody("");
            setStatus("");
            setError("");
            requestId.current = "";
          }}
        />
        {countries.length > 0 && (
          <label>
            País
            <select
              value={selectedCountry}
              disabled={busy}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="">Todos los países</option>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {countryLabel(code)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="hint">
        Evaluación de Inventario con gasto de Meta y ventas registradas en las
        fechas elegidas.
      </p>
      {error && <p role="alert">{error}</p>}
      {!valid && !error && <p role="status">Cargando diplomados…</p>}
      {valid && !data?.items.length && (
        <p>No hay diplomados con datos en este periodo.</p>
      )}
      {visibleCountries.length > 0 && (
        <>
          <div
            className="advisor-period-legend"
            aria-label="Estados de los diplomados"
          >
            {Object.entries(cacStatusNames).map(([signal, caption]) => (
              <span
                key={signal}
                className="advisor-period-badge"
                data-cac-status={signal}
              >
                {caption}
              </span>
            ))}
          </div>
          {visibleCountries.map((code) => (
            <section
              className="advisor-country-group"
              key={code}
              aria-label={countryLabel(code)}
            >
              <h3>{countryLabel(code)}</h3>
              <ul>
                {groups.get(code)?.map((item) => (
                  <li key={item.key} data-cac-status={item.cacStatus}>
                    <button
                      type="button"
                      className="advisor-period-item"
                      aria-expanded={focus === item.key}
                      onClick={() => {
                        setFocus(focus === item.key ? "" : item.key);
                        setBody("");
                        requestId.current = "";
                        setStatus("");
                        setDay(until);
                      }}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.table}</small>
                      </span>
                      <span
                        className="advisor-period-badge"
                        data-cac-status={item.cacStatus}
                      >
                        {cacStatusNames[item.cacStatus]}
                      </span>
                    </button>
                    {focus === item.key && (
                      <div className="advisor-period-notes">
                        {!advisorId && (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void submit();
                            }}
                          >
                            <label>
                              Día de la observación
                              <input
                                type="date"
                                value={day}
                                min={since}
                                max={until}
                                disabled={busy}
                                onChange={(event) => {
                                  setDay(event.target.value);
                                  requestId.current = "";
                                }}
                                required
                              />
                            </label>
                            <label>
                              Observación
                              <textarea
                                value={body}
                                maxLength={2000}
                                disabled={busy}
                                onChange={(event) => {
                                  setBody(event.target.value);
                                  requestId.current = "";
                                }}
                                required
                              />
                            </label>
                            <button
                              type="submit"
                              disabled={busy || !body.trim()}
                            >
                              Guardar observación
                            </button>
                            {status && <p role="status">{status}</p>}
                          </form>
                        )}
                        {item.notes.map((note) => (
                          <p key={note.id}>
                            <time dateTime={note.day}>{note.day}</time> ·{" "}
                            {note.body}
                          </p>
                        ))}
                        {advisorId && !item.notes.length && (
                          <p>Sin observaciones en el periodo.</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
