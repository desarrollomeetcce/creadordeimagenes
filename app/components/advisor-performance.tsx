"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { PerformanceTeam } from "./performance-team";
import { PerformanceMotivation } from "./performance-motivation";
import { MetaDailyChart } from "./meta-daily-chart";
import { MetaDateRange } from "./meta-date-range";
import { limaToday, shiftDay } from "./date-range";
import { performanceRatio } from "../../lib/meta-ads/performance-metrics";
import type { AdvisorPerformanceReport as Report } from "../../lib/meta-ads/advisor-performance";
type Settings = {
  people: {
    id: string;
    name: string;
    sheet: { name: string; archivedAt: string | null };
    portal: { userId: string | null; revision: number } | null;
  }[];
  accounts: { id: string; name: string; email: string }[];
};
const fmt = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const pct = (v: number | null) => (v === null ? "—" : fmt(v) + " %");
export function AdvisorPerformance({ owner }: { owner: boolean }) {
  const today = limaToday();
  const [panel, setPanel] = useState<"team" | "advisor">(
    owner ? "team" : "advisor",
  );
  const [settings, setSettings] = useState<Settings | null>(null),
    [advisorId, setAdvisorId] = useState(""),
    [since, setSince] = useState(shiftDay(today, -14)),
    [until, setUntil] = useState(today),
    [reload, setReload] = useState(0),
    [response, setResponse] = useState<{ key: string; data: Report } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [view, setView] = useState<"today" | "yesterday">("today");
  const query =
    "meta-ads/my-performance?" +
    new URLSearchParams({ since, until, ...(owner ? { advisorId } : {}) });
  const current = response?.key === query ? response.data : null;
  useEffect(() => {
    if (!owner || panel !== "advisor") return;
    let active = true;
    api("meta-ads/my-performance/settings")
      .then((s: Settings) => {
        if (active) {
          setSettings(s);
          setAdvisorId((id) => id || s.people[0]?.id || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [owner, panel]);
  useEffect(() => {
    if (owner && (!advisorId || panel !== "advisor")) return;
    let active = true,
      inFlight = false;
    setError("");
    const load = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const data: Report = await api(query);
        if (active) {
          setResponse({ key: query, data });
          setError("");
        }
      } catch (e) {
        if (active) {
          setResponse(null);
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el desempeño.",
          );
        }
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(load, 60000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [query, reload, owner, advisorId, panel]);
  const card = current?.[view];
  const goal = card?.goal;
  const achieved =
    card?.percent !== null && card?.percent !== undefined && goal
      ? card.percent >= goal.percent
      : null;
  const progress =
    card?.percent !== null && card?.percent !== undefined && goal
      ? goal.percent === 0
        ? 100
        : Math.min(100, (card.percent / goal.percent) * 100)
      : null;
  const positive =
    current?.products.filter((s) =>
      Object.values(s.days).some(
        (d) => !d.na && d.sales !== null && d.sales > 0,
      ),
    ) ?? [];
  return (
    <section className="advisor-performance" aria-label="Mi desempeño">
      <header className="performance-heading">
        <div>
          <p className="eyebrow">VENTAS Y OBJETIVOS · HORA DE LIMA</p>
          <h1>{owner ? "Desempeño de asesores" : "Mi desempeño"}</h1>
          <p>
            {owner
              ? "Consulta los resultados que verá cada asesor y define sus objetivos."
              : "Tus ventas, tus bases y el avance hacia tus objetivos."}
          </p>
        </div>
        <button disabled={false} onClick={() => setReload((n) => n + 1)}>
          Actualizar
        </button>
      </header>
      {owner && (
        <div
          role="tablist"
          aria-label="Vistas de Mi desempeño"
          className="performance-panel-tabs"
        >
          <button
            role="tab"
            aria-selected={panel === "team"}
            onClick={() => setPanel("team")}
          >
            Mis asesores
          </button>
          <button
            role="tab"
            aria-selected={panel === "advisor"}
            onClick={() => setPanel("advisor")}
          >
            Vista del asesor
          </button>
        </div>
      )}
      {owner && panel === "team" && (
        <PerformanceTeam
          reload={reload}
          onDetail={(id) => {
            setAdvisorId(id);
            setPanel("advisor");
          }}
        />
      )}
      <div hidden={owner && panel !== "advisor"}>
        {owner && panel === "advisor" && (
          <div className="performance-owner-picker">
            <SheetSearchSelect
              label="Asesor que deseas visualizar"
              value={advisorId}
              disabled={false}
              options={(settings?.people ?? []).map((p) => ({
                value: p.id,
                label: p.name + " · " + p.sheet.name,
              }))}
              onSelect={(id) => {
                setAdvisorId(id);
              }}
            />
            <span className="hint">
              Vista del asesor: sus propias ventas y bases de todas las hojas y
              países.
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {owner && settings && !settings.people.length ? (
          <p>No hay asesores. Regístralos primero en Efectividad.</p>
        ) : !current && !error ? (
          <p role="status">Cargando desempeño…</p>
        ) : null}
        {current && (!owner || panel === "advisor") && (
          <>
            <h2>{current.person.name}</h2>
            <div
              className="performance-view-picker"
              role="group"
              aria-label="Día del desempeño"
            >
              <button
                aria-pressed={view === "today"}
                onClick={() => setView("today")}
              >
                Hoy · avance provisional
              </button>
              <button
                aria-pressed={view === "yesterday"}
                onClick={() => setView("yesterday")}
              >
                Ayer · día completo
              </button>
            </div>
            {card && (
              <article
                className="performance-day"
                aria-label={
                  view === "today" ? "Desempeño de hoy" : "Desempeño de ayer"
                }
              >
                <div className="performance-day-heading">
                  <h3>
                    {view === "today"
                      ? "Así vas hoy"
                      : "Tus resultados de ayer"}
                  </h3>
                  <span>
                    {card.day} · Lima
                    {card.partial ? " · Cobertura parcial" : ""}
                  </span>
                </div>
                <div className="performance-values">
                  <div>
                    <span>Ventas registradas</span>
                    <strong>
                      {card.na ? "N.A." : fmt(card.sales)}
                      {card.partial ? " *" : ""}
                    </strong>
                  </div>
                  <div>
                    <span>
                      {view === "today"
                        ? "Base por contactar (BC)"
                        : "Base manual (BM)"}
                    </span>
                    <strong>{fmt(card.base)}</strong>
                  </div>
                  <div>
                    <span>Efectividad · V/{card.basis}</span>
                    <strong>
                      {pct(card.percent)}
                      {card.partial ? " *" : ""}
                    </strong>
                  </div>
                  <div>
                    <span>Meta de efectividad</span>
                    <strong>{goal ? pct(goal.percent) : "Sin definir"}</strong>
                  </div>
                </div>
                <PerformanceMotivation
                  percent={card.percent}
                  partial={card.partial}
                  basis={card.basis}
                  previousDay={card.previousDay}
                  previousPercent={card.previousPercent}
                  previousPartial={card.previousPartial}
                  goal={card.goal}
                />
                <p className="hint">
                  {view === "today"
                    ? "BC es la base que declaras disponible para contactar. No significa que ya hayas contactado a todas esas personas ni que sea exclusivamente la base ingresada hoy."
                    : "BM corresponde a las 24 horas de ayer, de 00:00 a 00:00 en Lima, y se registra al día siguiente en Totales."}
                </p>
                {card.base === null ? (
                  <p className="performance-pending">
                    Pendiente de registrar {card.basis}. Todavía no se puede
                    calcular tu efectividad.
                  </p>
                ) : card.base === 0 ? (
                  <p className="performance-pending">
                    La base registrada es 0. No se calcula un porcentaje sobre
                    cero.
                  </p>
                ) : card.sales === null ? (
                  <p className="performance-pending">
                    {card.na
                      ? "Ventas marcadas N.A."
                      : "Pendiente de registrar ventas."}
                  </p>
                ) : null}
                {(goal || card.salesTarget !== null) && (
                  <div className="performance-goal-progress">
                    <p>{goal ? "Meta diaria de efectividad · "+card.basis : "Meta diaria de ventas"}</p>
                    {progress !== null && (
                      <>
                        <progress
                          aria-label="Avance hacia la meta de efectividad"
                          max={100}
                          value={progress}
                        />
                        <strong>
                          {card.partial
                            ? "Resultado parcial: completa los registros para evaluar la meta."
                            : achieved
                              ? "¡Meta de efectividad alcanzada!"
                              : `Te faltan ${fmt(Math.max(0, (goal?.percent ?? 0) - (card.percent ?? 0)))} puntos porcentuales para tu meta.`}
                        </strong>
                      </>
                    )}
                    {card.salesTarget !== null && (
                      <p>
                        Meta diaria de ventas: {card.salesTarget} ·{" "}
                        {card.sales === null
                          ? "Pendiente"
                          : `${fmt(card.sales)} registradas · faltan ${fmt(Math.max(0, card.salesTarget! - card.sales))}`}
                      </p>
                    )}
                  </div>
                )}
                <div className="performance-attendance">
                  <span>
                    Asistencia:{" "}
                    <b>
                      {card.attendance === "PRESENT"
                        ? "Presente"
                        : card.attendance === "ABSENT"
                          ? "Ausente"
                          : card.attendance === "NA"
                            ? "N.A."
                            : "Sin registrar"}
                    </b>
                  </span>
                  <span>
                    Horas ausentes:{" "}
                    <b>
                      {fmt(card.hours)} h{card.pending ? " +" : ""}
                    </b>
                  </span>
                </div>
              </article>
            )}
            <details className="performance-history" open>
              <summary>Mi evolución e histórico diario</summary>
              <div className="row">
                <MetaDateRange
                  from={since}
                  to={until}
                  maxDays={31}
                  onChange={(a, b) => {
                    setSince(a);
                    setUntil(b);
                  }}
                />
                <span className="hint">
                  El período cambia el histórico; Hoy y Ayer conservan sus
                  fechas.
                </span>
              </div>
              <div
                className="performance-period-attendance"
                aria-label="Asistencia del período"
              >
                <span>
                  Asistencias registradas{" "}
                  <b>
                    {
                      current.history.filter((d) => d.attendance === "PRESENT")
                        .length
                    }
                  </b>
                </span>
                <span>
                  Ausencias registradas{" "}
                  <b>
                    {
                      current.history.filter((d) => d.attendance === "ABSENT")
                        .length
                    }
                  </b>
                </span>
                <span>
                  Horas ausentes registradas{" "}
                  <b>
                    {fmt(
                      current.history.some((d) => d.hours !== null)
                        ? current.history.reduce(
                            (n, d) => n + (d.hours ?? 0),
                            0,
                          )
                        : null,
                    )}{" "}
                    h
                  </b>
                </span>
              </div>
              <MetaDailyChart
                rows={current.history.map((d) => ({
                  day: d.day,
                  results: d.sales,
                  cost: view === "today" ? d.bc : d.bm,
                  spend: null,
                }))}
                bars="results"
                line="cost"
                currency="PEN"
                metricName="Ventas"
                since={since}
                until={until}
                labels={{
                  results: "Ventas (V)",
                  cost:
                    view === "today"
                      ? "Base por contactar (BC)"
                      : "Base manual (BM)",
                  spend: "",
                }}
                units={{ results: "count", cost: "count", spend: "count" }}
              />
              <p className="hint">
                Promedio por día con ventas registradas:{" "}
                {fmt(
                  current.history.some((d) => d.sales !== null)
                    ? current.history.reduce((n, d) => n + (d.sales ?? 0), 0) /
                        current.history.filter((d) => d.sales !== null).length
                    : null,
                )}
                . Barras de ventas y línea de base con escalas independientes.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Ventas</th>
                      <th>BC</th>
                      <th>V/BC</th>
                      <th>BM</th>
                      <th>V/BM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.history.map((d) => (
                      <tr key={d.day}>
                        <th>{d.day}</th>
                        <td>
                          {d.na ? "N.A." : fmt(d.sales)}
                          {d.partial ? " *" : ""}
                        </td>
                        <td>{fmt(d.bc)}</td>
                        <td>
                          {pct(performanceRatio(d.sales, d.bc, 100))}
                          {d.partial ? " *" : ""}
                        </td>
                        <td>{fmt(d.bm)}</td>
                        <td>
                          {pct(
                            d.day < today && !d.partial
                              ? performanceRatio(d.sales, d.bm, 100)
                              : null,
                          )}
                          {d.partial ? " *" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">
                * Cobertura parcial · — sin dato. BM y BC se reciben del reparto
                de Totales; las ventas respetan el reparto registrado por
                asesor, aunque cambie el responsable.
              </p>
            </details>
            <details className="performance-history">
              <summary>Qué diplomados vendí en el período</summary>
              {!positive.length ? (
                <p>No hay ventas positivas registradas en este período.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Diplomado / producto</th>
                        <th>Hoja · país</th>
                        <th>Ventas</th>
                        <th>Fechas y cantidades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positive.map((s, i) => (
                        <tr key={i}>
                          <th>{s.product}</th>
                          <td>
                            {s.sheet} · {s.country}
                          </td>
                          <td>
                            {fmt(
                              Object.values(s.days).reduce(
                                (n, d) => n + (!d.na ? (d.sales ?? 0) : 0),
                                0,
                              ),
                            )}
                          </td>
                          <td>
                            {Object.entries(s.days)
                              .filter(
                                ([, d]) =>
                                  !d.na && d.sales !== null && d.sales > 0,
                              )
                              .map(
                                ([day, d]) =>
                                  `${day}: ${fmt(d.sales)}${d.partial ? " *" : ""}`,
                              )
                              .join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          </>
        )}
      </div>
    </section>
  );
}
