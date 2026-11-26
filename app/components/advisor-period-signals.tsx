"use client";
import { setPerformancePeriod, usePerformancePeriod } from "./use-performance-period";

import { Fragment, useEffect, useRef, useState } from "react";
import type { advisorPeriodSignals, advisorWhatsAppActivity } from "../../lib/meta-ads/advisor-period-signals";
import { cacStatusNames } from "../../lib/meta-ads/inventory-cac-policy";
import { MetaDateRange } from "./meta-date-range";
import { PerformanceMotivation } from "./performance-motivation";
import { limaToday, shiftDay } from "./date-range";

type Data = Awaited<ReturnType<typeof advisorPeriodSignals>>;
type Activity = Awaited<ReturnType<typeof advisorWhatsAppActivity>>;
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
  const period = usePerformancePeriod();
  const since = period?.from ?? today;
  const until = period?.to ?? today;
  const [day, setDay] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [country, setCountry] = useState("");
  const [activity, setActivity] = useState<{ key: string; data: Activity } | null>(null);
  const activityKey = JSON.stringify([advisorId, since, until]);
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
  useEffect(() => {
    if (section !== "products") return;
    const controller = new AbortController();
    const query = new URLSearchParams({ since, until, section: "whatsapp", ...(advisorId ? { advisorId } : {}) });
    void fetch(endpoint + "?" + query, { signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as Activity : null)
      .then((data) => {
        if (!controller.signal.aborted) setActivity({ key: activityKey, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setActivity({ key: activityKey, data: null });
      });
    return () => controller.abort();
  }, [activityKey, advisorId, since, until, section, reload]);
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
  const activityResult = activity?.key === activityKey ? activity : null;
  const whatsapp = activityResult?.data?.items ?? [];
  const countries = [...new Set([...groups.keys(), ...whatsapp.map((item) => item.country).filter(Boolean), ...(activityResult?.data?.totals ?? []).map((item) => item.country).filter(Boolean)])]
    .sort((a, b) => countryLabel(a).localeCompare(countryLabel(b), "es"));
  const selectedCountry = countries.includes(country) ? country : "";
  const activityTotals = activityResult?.data?.totals;
  const whatsappTotal = selectedCountry
    ? activityTotals?.find((item) => item.country === selectedCountry)?.contacts
    : activityTotals?.reduce((total, item) => total + item.contacts, 0);
  const ranked = (selectedCountry ? [...(groups.get(selectedCountry) ?? [])] : [...groups.values()].flat())
    .sort((a, b) =>
      Number(b.currentAssignment && b.campaignActive) - Number(a.currentAssignment && a.campaignActive) ||
      (b.sales ?? -1) - (a.sales ?? -1) ||
      (b.metaBase ?? -1) - (a.metaBase ?? -1) ||
      a.name.localeCompare(b.name, "es"),
    );
  const top = ranked.filter((item) => item.currentAssignment).slice(0, 10);
  const topKeys = new Set(top.map((item) => item.key));
  const products = [...top, ...ranked.filter((item) => !topKeys.has(item.key))];
  const catalogMatches = new Map<string, string[]>();
  for (const item of products) {
    if (!item.catalogKey) continue;
    const key = JSON.stringify([...item.catalogKey, item.country]);
    const keys = catalogMatches.get(key) ?? [];
    keys.push(item.key);
    catalogMatches.set(key, keys);
  }
  const candidates = whatsapp.filter((item) => !selectedCountry || item.country === selectedCountry);
  const possibleMatches = candidates.map((item) => ({
    item,
    keys: [...new Set(item.links.flatMap((link) =>
      catalogMatches.get(JSON.stringify([...link, item.country])) ?? []))],
  }));
  const matchCounts = new Map<string, number>();
  for (const { keys } of possibleMatches)
    if (keys.length === 1) matchCounts.set(keys[0], (matchCounts.get(keys[0]) ?? 0) + 1);
  const contactsByProduct = new Map<string, number>();
  const additional = possibleMatches.filter(({ item, keys }) => {
    if (keys.length !== 1 || matchCounts.get(keys[0]) !== 1) return true;
    contactsByProduct.set(keys[0], item.contacts);
    return false;
  }).map(({ item }) => item);

  function setBasePeriod(from: string, to: string) {
    setPerformancePeriod(from, to);
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
            {advisorId === "all" ? "La base de Meta y las ventas corresponden al diplomado en el país y período seleccionados." :
              "La base cuenta los ingresos de Meta asignados al asesor."} Abre el estado para consultar su evaluación.
          </p>
          {error && <p role="alert">{error}</p>}
          {!valid && !error && <p role="status">Cargando diplomados…</p>}
          {valid && !products.length && !additional.length && (
            <p>No hay diplomados vigentes ni actividad reciente para este asesor.</p>
          )}
          {(products.length > 0 || additional.length > 0) && (
            <table
              className="advisor-diploma-table"
              aria-label="Diplomados vigentes"
            >
              <thead>
                <tr>
                  <th scope="col">Diplomado</th>
                  <th scope="col">Base de Meta</th>
                  <th scope="col">Ventas</th>
                  <th scope="col">Contactos WhatsApp</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {products.map((item, index) => {
                  const open = focus === item.key;
                  const custom =
                    reviewPeriods[item.key] && reviewResults[item.key];
                  const state = custom
                    ? (custom.item?.cacStatus ?? "PENDING")
                    : item.cacStatus;
                  return (
                    <Fragment key={item.key}>
                      {(index === 0 || index === top.length) && (
                        <tr><th colSpan={5} scope="colgroup">
                          {topKeys.has(item.key) ? "Top de diplomados vigentes" : "Otros diplomados y actividad reciente"}
                        </th></tr>
                      )}
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
                        <td className="advisor-diploma-base">
                          {(item.sales ?? item.recordedSales)?.toLocaleString("es-PE") ?? "—"}
                          {item.sales === null && item.recordedSales !== null && <small>Total del diplomado</small>}
                        </td>
                        <td className="advisor-diploma-base">{contactsByProduct.get(item.key)?.toLocaleString("es-PE") ?? "—"}</td>
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
                          <td colSpan={5}>
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
                                  {advisorId !== "all" && <form
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
                                  </form>}
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
                {additional.length > 0 && (
                  <tr><th scope="colgroup" colSpan={5}>Otros ingresos de WhatsApp</th></tr>
                )}
                {additional.map((item) => (
                  <tr key={item.id + ":" + item.country}>
                    <th scope="row">
                      {item.name}
                      <small>{item.country ? countryLabel(item.country) : "Sin país confirmado"} · {item.folders.join(", ")}</small>
                    </th>
                    <td>—</td>
                    <td>—</td>
                    <td className="advisor-diploma-base">{item.contacts.toLocaleString("es-PE")}</td>
                    <td>Etiqueta de producto</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!activityResult && <p role="status" className="hint">Cargando contactos de WhatsApp…</p>}
          {activityResult && !activityResult.data && <p className="hint">Contactos de WhatsApp no disponibles para esta cuenta vinculada.</p>}
          {whatsappTotal !== undefined && (
            <p className="hint">Contactos de WhatsApp del período: <strong>{whatsappTotal}</strong>. Incluye contactos sin diplomado identificado.</p>
          )}
          {activityResult?.data?.truncated && <p className="hint">WhatsApp muestra las 500 etiquetas con más actividad.</p>}
        </>
      )}
    </section>
  );
}
