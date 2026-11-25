"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { AdvisorPeriodSignals } from "./advisor-period-signals";
import { PerformanceConfiguration } from "./performance-configuration";
import { PerformanceTeam } from "./performance-team";
import { advisorGoalStatus } from "../../lib/meta-ads/advisor-motivation";
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
type PerformancePanel = "team" | "advisor";

function PerformanceNavigation({
  panel,
  onSelect,
}: {
  panel?: PerformancePanel;
  onSelect?: (panel: PerformancePanel) => void;
}) {
  return (
    <nav className="performance-workspace-nav" aria-label="Seguimiento">
      <a href="https://pulpo.agenciamagneto.org/?section=Vista%20general">
        Vista general
      </a>
      {onSelect ? (
        <>
          <button
            type="button"
            aria-pressed={panel === "team"}
            onClick={() => onSelect("team")}
          >
            Configuración de desempeño
          </button>
          <button
            type="button"
            aria-pressed={panel === "advisor"}
            onClick={() => onSelect("advisor")}
          >
            Desempeño del asesor
          </button>
        </>
      ) : (
        <a href="?view=performance" aria-current="page">
          Mi desempeño
        </a>
      )}
    </nav>
  );
}

export function AdvisorPerformance({ owner }: { owner: boolean }) {
  return owner ? (
    <ManagedAdvisorPerformance owner />
  ) : (
    <section className="advisor-performance" aria-label="Mi desempeño">
      <PerformanceNavigation />
      <AdvisorPeriodSignals />
    </section>
  );
}

function ManagedAdvisorPerformance({ owner }: { owner: boolean }) {
  const today = limaToday();
  const [accountsOpen, setAccountsOpen] = useState(false);

  const [panel, setPanel] = useState<PerformancePanel>(
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
  const card = view === "today" ? current?.metaToday : current?.metaYesterday;
  const positive =
    current?.products.filter((s) =>
      Object.values(s.days).some(
        (d) => !d.na && d.sales !== null && d.sales > 0,
      ),
    ) ?? [];
  return (
    <section className="advisor-performance" aria-label="Mi desempeño">
      <PerformanceNavigation panel={panel} onSelect={setPanel} />
      <header className="performance-heading">
        <div>
          <h1>
            {panel === "team" ? "Metas diarias" : "Desempeño de asesores"}
          </h1>
        </div>
        <button type="button" onClick={() => setReload((n) => n + 1)}>
          Actualizar
        </button>
      </header>
      {owner && panel === "team" && (
        <>
          <PerformanceConfiguration reload={reload} />
          <details
            className="performance-history"
            onToggle={(event) => setAccountsOpen(event.currentTarget.open)}
          >
            <summary>Cuentas de acceso</summary>
            {accountsOpen && (
              <PerformanceTeam
                reload={reload}
                onDetail={(id) => {
                  setAdvisorId(id);
                  setPanel("advisor");
                }}
              />
            )}
          </details>
        </>
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
                Hoy
              </button>
              <button
                aria-pressed={view === "yesterday"}
                onClick={() => setView("yesterday")}
              >
                Ayer
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
                <div className="performance-overview-row">
                  <div className="performance-values">
                    <div>
                      <span>Ventas registradas</span>
                      <strong>
                        {card.na ? "N.A." : fmt(card.sales)}
                        {card.partial ? " *" : ""}
                      </strong>
                    </div>
                    <div>
                      <span>Base de Meta</span>
                      <strong>{fmt(card.base)}</strong>
                    </div>
                    <div>
                      <span>Efectividad</span>
                      <strong>
                        {pct(card.percent)}
                        {card.partial ? " *" : ""}
                      </strong>
                    </div>
                  </div>
                  <PerformanceMotivation
                    percent={card.percent}
                    effectivenessTarget={card.goal?.percent ?? null}
                    partial={card.partial}
                    salesTarget={card.salesTarget}
                    salesStatus={advisorGoalStatus(
                      card.sales,
                      card.salesTarget,
                      card.salesPartial,
                      1,
                    )}
                    salesRemaining={
                      card.sales === null || card.salesTarget === null
                        ? undefined
                        : Math.max(0, card.salesTarget - card.sales)
                    }
                    previous={{
                      percent: card.previousPercent,
                      partial: card.previousPartial,
                    }}
                  />
                </div>
                {card.base === null ? (
                  <p className="performance-pending">
                    Aún no hay conversaciones reportadas por Meta para esta
                    fecha.
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
            {advisorId && (
              <AdvisorPeriodSignals key={advisorId} advisorId={advisorId} />
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
                  cost: d.metaBase,
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
                  cost: "Base de Meta",
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
                      <th>Base de Meta</th>
                      <th>Efectividad</th>
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
                        <td>{fmt(d.metaBase)}</td>
                        <td>
                          {pct(performanceRatio(d.sales, d.metaBase, 100))}
                          {d.metaPartial ? " *" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">
                * Cobertura parcial · — sin dato. Las ventas respetan el reparto
                registrado por asesor.
              </p>
            </details>
            <details className="performance-history">
              <summary>Ventas registradas por diplomado</summary>
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
