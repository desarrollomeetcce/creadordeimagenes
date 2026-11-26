"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { advisorPeriodSignals } from "../../lib/meta-ads/advisor-period-signals";
import { cacStatusNames } from "../../lib/meta-ads/inventory-cac-policy";
import { MetaDateRange } from "./meta-date-range";
import { PerformanceMotivation } from "./performance-motivation";
import { limaToday, shiftDay } from "./date-range";

type Data = Awaited<ReturnType<typeof advisorPeriodSignals>>;
type Item = Data["items"][number];
type Period = { since: string; until: string };
const regionNames = new Intl.DisplayNames(["es"], { type: "region" });
const countryLabel = (country: string) =>
  /^[A-Z]{2}$/.test(country) ? (regionNames.of(country) ?? country) : country;

export function AdvisorPeriodSignals({
  advisorId,
  section,
  reload = 0,
}: {
  advisorId?: string;
  section: "summary" | "products";
  reload?: number;
}) {
  const today = limaToday();
  const [view, setView] = useState<"today" | "yesterday">("today");
  const [since, setSince] = useState(today);
  const [until, setUntil] = useState(today);
  const [day, setDay] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [country, setCountry] = useState("");
  const [focus, setFocus] = useState("");
  const [reviewPeriods, setReviewPeriods] = useState<Record<string, Period>>(
    {},
  );
  const [reviewResults, setReviewResults] = useState<
    Record<string, { period: Period; item: Item | null }>
  >({});
  const [reviewError, setReviewError] = useState("");
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
      section,
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
  }, [advisorId, since, until, section, reload]);
  const selected = data?.items.find((item) => item.key === focus);
  const review = reviewPeriods[focus] ?? data?.evaluation;
  const reviewSince = review?.since;
  const reviewUntil = review?.until;
  const reviewResult = reviewResults[focus];
  const detail =
    reviewResult?.period.since === reviewSince &&
    reviewResult?.period.until === reviewUntil
      ? reviewResult?.item
      : undefined;
  useEffect(() => {
    if (!focus || !reviewSince || !reviewUntil) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      since: reviewSince,
      until: reviewUntil,
      section: "detail",
      product: focus,
      ...(advisorId ? { advisorId } : {}),
    });
    void fetch(endpoint + "?" + query, { signal: controller.signal })
      .then(async (result) => {
        const value = (await result.json()) as Data & { error?: string };
        if (!result.ok) throw new Error(value.error);
        if (!controller.signal.aborted)
          setReviewResults((previous) => ({
            ...previous,
            [focus]: {
              period: { since: reviewSince, until: reviewUntil },
              item: value.items[0] ?? null,
            },
          }));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setReviewError(cause.message);
      });
    return () => controller.abort();
  }, [advisorId, focus, reviewSince, reviewUntil, refresh, reload]);

  function resetObservation(date: string) {
    setDay(date);
    setBody("");
    setStatus("");
    setReviewError("");
    requestId.current = "";
  }
  async function submit() {
    if (!selected || !review || !detail || busy) return;
    requestId.current ||= crypto.randomUUID();
    setBusy(true);
    setReviewError("");
    setStatus("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId.current,
          ...(advisorId ? { advisorId } : {}),
          since: review.since,
          until: review.until,
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
      setReviewError((cause as Error).message);
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
  const products = (selectedCountry ? [...(groups.get(selectedCountry) ?? [])] : [...groups.values()].flat()).sort(
    (a, b) =>
      Number(b.campaignActive === true) - Number(a.campaignActive === true) ||
      a.name.localeCompare(b.name, "es"),
  );
  function setBasePeriod(from: string, to: string) {
    setSince(from);
    setUntil(to);
    setFocus("");
    setError("");
  }
  const performance = section === "summary" ? data?.performance : null;
  const summary = performance?.[view];
  return (
    <section
      className="advisor-period-signals"
      aria-label={
        section === "summary" ? "Mi desempeño" : "Productos vigentes"
      }
    >
      {!advisorId && section === "summary" && (
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
              awaitingSales={summary.awaitingSales}
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
      {section === "summary" ? (
        error ? (
          <p role="alert">{error}</p>
        ) : !summary ? (
          <p role="status">Cargando desempeño…</p>
        ) : null
      ) : (
        <>
          <h2>Diplomados</h2>
          <div className="row advisor-period-controls">
            <div
              className="row advisor-base-period"
              role="group"
              aria-label="Periodo de la base de Meta"
            >
              <button
                type="button"
                disabled={busy}
                aria-pressed={since === today && until === today}
                onClick={() => setBasePeriod(today, today)}
              >
                Hoy
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={
                  since === shiftDay(today, -1) && until === shiftDay(today, -1)
                }
                onClick={() =>
                  setBasePeriod(shiftDay(today, -1), shiftDay(today, -1))
                }
              >
                Ayer
              </button>
              <MetaDateRange
                from={since}
                to={until}
                triggerAriaLabel="Calendario de la base de Meta"
                triggerLabel={
                  since === until &&
                  (since === today || since === shiftDay(today, -1))
                    ? "Calendario"
                    : undefined
                }
                applyLabel="Aplicar a la base"
                onChange={(from, to) => {
                  if (!busy) setBasePeriod(from, to);
                }}
              />
            </div>
            {countries.length > 0 && (
              <label>
                País
                <select
                  value={selectedCountry}
                  disabled={busy}
                  onChange={(event) => {
                    setCountry(event.target.value);
                    setFocus("");
                  }}
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
            La base cuenta los ingresos de Meta asignados al asesor. Abre el
            estado para consultar su evaluación.
          </p>
          {error && <p role="alert">{error}</p>}
          {!valid && !error && <p role="status">Cargando diplomados…</p>}
          {valid && !products.length && (
            <p>No hay diplomados vigentes para este asesor.</p>
          )}
          {products.length > 0 && (
            <table
              className="advisor-diploma-table"
              aria-label="Diplomados vigentes"
            >
              <thead>
                <tr>
                  <th scope="col">Diplomado</th>
                  <th scope="col">Base de Meta</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {products.map((item) => {
                  const open = focus === item.key;
                  const custom =
                    reviewPeriods[item.key] && reviewResults[item.key];
                  const state = custom
                    ? (custom.item?.cacStatus ?? "PENDING")
                    : item.cacStatus;
                  return (
                    <Fragment key={item.key}>
                      <tr>
                        <th scope="row" data-cac-status={state}>
                          {item.name}
                          {!selectedCountry && <small>{countryLabel(item.country)}</small>}
                          {item.campaignActive && (
                            <small>
                              <span
                                aria-hidden="true"
                                className="advisor-campaign-active"
                              />{" "}
                              Campaña activa en Meta
                            </small>
                          )}
                        </th>
                        <td className="advisor-diploma-base">
                          {item.metaBase?.toLocaleString("es-PE") ?? "—"}
                          {item.metaBasePartial && <small>Parcial</small>}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="advisor-period-badge"
                            data-cac-status={state}
                            aria-expanded={open}
                            aria-label={`${cacStatusNames[state]} · ${item.name}`}
                            disabled={busy}
                            onClick={() => {
                              setFocus(open ? "" : item.key);
                              resetObservation(
                                (reviewPeriods[item.key] ?? data?.evaluation)
                                  ?.until ?? today,
                              );
                            }}
                          >
                            {cacStatusNames[state]}
                          </button>
                        </td>
                      </tr>
                      {open && review && (
                        <tr>
                          <td colSpan={3}>
                            <div className="advisor-period-notes">
                              <MetaDateRange
                                from={review.since}
                                to={review.until}
                                triggerAriaLabel="Periodo de evaluación del diplomado"
                                applyLabel="Evaluar periodo"
                                onChange={(from, to) => {
                                  if (busy) return;
                                  setReviewPeriods((previous) => ({
                                    ...previous,
                                    [item.key]: { since: from, until: to },
                                  }));
                                  resetObservation(to);
                                }}
                              />
                              {reviewError && <p role="alert">{reviewError}</p>}
                              {detail === undefined && !reviewError && (
                                <p role="status">Cargando evaluación…</p>
                              )}
                              {detail === null && (
                                <p>Sin datos asignados en este periodo.</p>
                              )}
                              {detail && (
                                <>
                                  <p>
                                    Ventas registradas del asesor ·{" "}
                                    {detail.sales?.toLocaleString("es-PE") ??
                                      "—"}
                                  </p>
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
                                        min={review.since}
                                        max={review.until}
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
                                  {detail.notes.map((note) => (
                                    <p key={note.id}>
                                      <time dateTime={note.day}>
                                        {note.day}
                                      </time>{" "}
                                      · {note.body}
                                    </p>
                                  ))}
                                  {!detail.notes.length && (
                                    <p>Sin observaciones en el periodo.</p>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
