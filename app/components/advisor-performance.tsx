"use client";
import { useEffect, useState } from "react";
import { setPerformancePeriod, setWorkspaceQuery, usePerformancePeriod, useWorkspaceQuery } from "./use-performance-period";
import { withPerformancePeriod } from "../../lib/performance-period";
import { WorkspaceHeaderNavigation } from "./workspace-header-navigation";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { AdvisorPeriodSignals } from "./advisor-period-signals";
import { PerformanceConfiguration } from "./performance-configuration";
import { PerformanceTeam } from "./performance-team";
import { advisorGoalStatus } from "../../lib/meta-ads/advisor-motivation";
import { PerformanceMotivation } from "./performance-motivation";
import { MetaDailyChart } from "./meta-daily-chart";
import { MetaDateRange } from "./meta-date-range";
import { limaToday } from "./date-range";
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

function usePerformancePanel(initialPanel: PerformancePanel | undefined, manager: boolean) {
  const requested = useWorkspaceQuery().get("panel") ?? initialPanel;
  const panel = requested === "advisor" || requested === "products" || !manager ? "advisor" : "team";
  return [panel, (next: PerformancePanel) => setWorkspaceQuery({ panel: next })] as const;
}


function PerformanceNavigation({
  panel,
  onSelect,
  manager,
}: {
  panel: PerformancePanel;
  onSelect: (panel: PerformancePanel) => void;
  manager?: boolean;
}) {
  const period = usePerformancePeriod();
  return (
    <WorkspaceHeaderNavigation>
      <nav className="performance-workspace-nav" aria-label="Seguimiento">
        <a href={withPerformancePeriod("https://pulpo.agenciamagneto.org/?section=Vista%20general", period)}>
          Vista general
        </a>
        <button
          type="button"
          aria-pressed={panel === "advisor"}
          onClick={() => onSelect("advisor")}
        >
          {manager ? "Desempeño del asesor" : "Mi desempeño"}
        </button>
        <a href={withPerformancePeriod("https://pulpo.agenciamagneto.org/?section=Vista%20general&panel=productos", period)}>
          Ingresos
        </a>
        {manager && (
          <button
            className="performance-settings-link"
            type="button"
            aria-pressed={panel === "team"}
            onClick={() => onSelect("team")}
          >
            <span aria-hidden="true">⚙</span> Configuración de desempeño
          </button>
        )}
      </nav>
    </WorkspaceHeaderNavigation>
  );
}

export function AdvisorPerformance({
  owner,
  initialPanel,
}: {
  owner: boolean;
  initialPanel?: PerformancePanel;
}) {
  return owner ? (
    <ManagedAdvisorPerformance owner initialPanel={initialPanel} />
  ) : (
    <PersonalAdvisorPerformance initialPanel={initialPanel} />
  );
}

function PersonalAdvisorPerformance({
  initialPanel,
}: {
  initialPanel?: PerformancePanel;
}) {
  const [panel, setPanel] = usePerformancePanel(initialPanel, false);
  return (
    <section className="advisor-performance" aria-label="Desempeño">
      <PerformanceNavigation panel={panel} onSelect={setPanel} />
      <AdvisorPeriodSignals
        key={panel}
        section="summary"
      />
    </section>
  );
}

function ManagedAdvisorPerformance({
  owner,
  initialPanel,
}: {
  owner: boolean;
  initialPanel?: PerformancePanel;
}) {
  const today = limaToday();
  const [accountsOpen, setAccountsOpen] = useState(false);

  const [panel, setPanel] = usePerformancePanel(initialPanel, true);
  const search = useWorkspaceQuery();
  const period = usePerformancePeriod();
  const since = period?.from ?? today;
  const until = period?.to ?? today;
  const [settings, setSettings] = useState<Settings | null>(null),
    [reload, setReload] = useState(0),
    [response, setResponse] = useState<{ key: string; data: Report } | null>(
      null,
    ),
    [error, setError] = useState("");
  const view = search.get("day") === "yesterday" ? "yesterday" : "today";
  const defaultAdvisor = settings?.people[0]?.id ?? "";
  const requestedAdvisor = search.get("advisor");
  const advisorId = settings?.people.some((p) => p.id === requestedAdvisor)
    ? requestedAdvisor! : defaultAdvisor;
  const query =
    "meta-ads/my-performance?" +
    new URLSearchParams({ since, until, ...(owner ? { advisorId } : {}) });
  const current = response?.key === query ? response.data : null;
  useEffect(() => {
    if (!owner || panel === "team" || settings) return;
    let active = true;
    api("meta-ads/my-performance/settings")
      .then((s: Settings) => {
        if (active) {
          setSettings(s);

        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [owner, panel, settings]);
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
  return (
    <section className="advisor-performance" aria-label="Mi desempeño">
      <PerformanceNavigation
        panel={panel}
        onSelect={(next) => {
          if (next !== panel) {
            setError("");
            setPanel(next);
          }
        }}
        manager
      />
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
                  setWorkspaceQuery({ panel: "advisor", advisor: id });
                }}
              />
            )}
          </details>
        </>
      )}
      <div hidden={owner && panel === "team"}>
        {owner && panel !== "team" && (
          <div className="performance-owner-picker">
            <SheetSearchSelect
              label="Asesor que deseas visualizar"
              value={advisorId}
              disabled={false}
              options={(settings?.people ?? []).map((p) => ({
                value: p.id,
                label: p.name + " · " + p.sheet.name,
              }))}
              onSelect={(id) => setWorkspaceQuery({ advisor: id })}
            />
            {panel === "advisor" && (
              <span className="hint">
                Vista del asesor: sus propias ventas y bases de todas las hojas
                y países.
              </span>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {owner && settings && !settings.people.length ? (
          <p>No hay asesores. Regístralos primero en Efectividad.</p>
        ) : !error && !current ? (
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
                onClick={() => setWorkspaceQuery({ day: "today" })}
              >
                Hoy
              </button>
              <button
                aria-pressed={view === "yesterday"}
                onClick={() => setWorkspaceQuery({ day: "yesterday" })}
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
                    awaitingSales={card.sales === null && !card.na}
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
            <details className="performance-history" open>
              <summary>Mi evolución e histórico diario</summary>
              <div className="row">
                <MetaDateRange
                  from={since}
                  to={until}
                  maxDays={31}
                  onChange={setPerformancePeriod}
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
          </>
        )}
      </div>
    </section>
  );
}
