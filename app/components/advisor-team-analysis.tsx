"use client";
import { useEffect, useRef, useState } from "react";
import { AdvisorDetail } from "./advisor-detail";
import { DetailStickyHeader } from "./detail-sticky-header";
import { MetaDateRange } from "./meta-date-range";
import { SheetSearchSelect } from "./sheet-search-select";
import { readAdvisorRange } from "./workbook-range-request";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { limaToday, shiftDay } from "./date-range";
import { advisorTeamRows } from "../../lib/meta-ads/advisor-team-summary";
import type { AdvisorSheetData, AdvisorTable } from "./advisor-types";
const fmt = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
export function AdvisorTeamAnalysis({
  listId,
  tables,
  initialTableId,
  initialCountry,
  initialView = "period",
  initialSince,
  initialUntil,
  onClose,
}: {
  listId: string;
  tables: AdvisorTable[];
  initialTableId: string;
  initialCountry: string;
  initialView?: "period" | "today" | "yesterday";
  initialSince: string;
  initialUntil: string;
  onClose: () => void;
}) {
  const [personId, setPersonId] = useState<string | null>(null);
  const onAdvisor = (id: string) => setPersonId(id);
  const dialog = useRef<HTMLDialogElement>(null),
    [view, setView] = useState<"period" | "today" | "yesterday">(initialView),
    [since, setSince] = useState(initialSince),
    [until, setUntil] = useState(initialUntil),
    [basis, setBasis] = useState<"BC" | "BM">(
      initialView === "yesterday" ? "BM" : "BC",
    ),
    [tableId, setTableId] = useState(initialTableId),
    [country, setCountry] = useState(initialCountry),
    [sort, setSort] = useState<"sales" | "percent">("sales"),
    [page, setPage] = useState(0),
    [reload, setReload] = useState(0),
    [data, setData] = useState<{ key: string; value: AdvisorSheetData } | null>(
      null,
    ),
    [error, setError] = useState("");
  const person = data?.value.rows.find((p) => p.id === personId);
  const key = JSON.stringify({
    advisorListId: listId,
    tableId,
    country,
    since,
    until,
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true,
      inFlight = false;
    setError("");
    setPage(0);
    const load = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const value = await readAdvisorRange(
          { advisorListId: listId, tableId, country, since, until },
          () => active,
        );
        if (active) {
          setData({ key, value });
          setError("");
        }
      } catch (e) {
        if (active) {
          setData(null);
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el equipo.",
          );
        }
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(load, 60000),
      unsub = subscribeAdvisorSalesChanged(load);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(timer);
      unsub();
      document.removeEventListener("visibilitychange", load);
    };
  }, [key, reload, listId, tableId, country, since, until]);
  const rows = advisorTeamRows(
    data?.key === key ? data.value.rows : [],
    basis,
  ).sort(
    (a, b) =>
      (b[sort] ?? -1) - (a[sort] ?? -1) ||
      (b.sales ?? -1) - (a.sales ?? -1) ||
      a.name.localeCompare(b.name),
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / 25)),
    activePage = Math.min(page, pageCount - 1),
    visible = rows.slice(activePage * 25, activePage * 25 + 25),
    max = Math.max(1, ...visible.map((r) => r[sort] ?? 0));
  const totalSales = rows.some((r) => r.sales !== null)
    ? rows.reduce((n, r) => n + (r.sales ?? 0), 0)
    : null;
  const colors = [
    "#258e7e",
    "#477ec0",
    "#a36ed0",
    "#ce8b2a",
    "#d05f88",
    "#4ba6bc",
  ];
  const choose = (next: "period" | "today" | "yesterday") => {
    setView(next);
    if (next === "period") {
      setSince(initialSince);
      setUntil(initialUntil);
    } else {
      const d = next === "today" ? limaToday() : shiftDay(limaToday(), -1);
      setSince(d);
      setUntil(d);
      setBasis(next === "today" ? "BC" : "BM");
    }
  };
  return (
    <>
      <dialog
        ref={dialog}
        className="meta-detail advisor-team-analysis"
        aria-label="Análisis de todos los asesores"
        onCancel={onClose}
      >
        <DetailStickyHeader>
          <header className="row">
            <h2>Análisis del equipo</h2>
            <button className="ui-close-button" onClick={onClose}>
              Cerrar análisis
            </button>
          </header>
          <div className="row" role="group" aria-label="Período del equipo">
            {(
              [
                ["today", "Hoy · avance provisional"],
                ["yesterday", "Ayer · día completo"],
                ["period", "Análisis del período"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => choose(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="row">
            <MetaDateRange
              from={since}
              to={until}
              maxDays={3660}
              onChange={(a, b) => {
                setSince(a);
                setUntil(b);
                setView("period");
              }}
            />
            <SheetSearchSelect
              label="Hojas del análisis del equipo"
              value={tableId}
              options={[
                { value: "all", label: "Todas las hojas" },
                ...tables.map((t) => ({ value: t.id, label: t.name })),
              ]}
              onSelect={setTableId}
            />
            <button onClick={() => setReload((n) => n + 1)}>
              Actualizar análisis
            </button>
          </div>
          <p className="hint">
            {since} — {until} · Lima · {country || "Todos los países"}. Todos
            los asesores de esta pestaña y todos sus productos.{" "}
            {basis === "BC"
              ? "BC: base declarada para contactar."
              : "BM: base de las 24 horas, registrada al día siguiente."}{" "}
            Los repartos de Totales se suman por persona, sin duplicar monedas.
          </p>
        </DetailStickyHeader>
        {error && <p role="alert">{error}</p>}
        {data?.key !== key && !error ? (
          <p role="status">Cargando comparativo…</p>
        ) : null}
        {data?.key === key && (
          <>
            <div className="team-comparison-summary">
              <span>
                Asesores<strong>{rows.length}</strong>
              </span>
              <span>
                Ventas registradas<strong>{fmt(totalSales)}</strong>
              </span>
              <span>
                Con ventas
                <strong>{rows.filter((r) => (r.sales ?? 0) > 0).length}</strong>
              </span>
              <span>
                Sin registro de ventas
                <strong>{rows.filter((r) => r.sales === null).length}</strong>
              </span>
            </div>
            <div className="row team-comparison-controls">
              <label>
                Comparar y ordenar
                <select
                  aria-label="Orden del comparativo del equipo"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as "sales" | "percent");
                    setPage(0);
                  }}
                >
                  <option value="sales">Ventas registradas</option>
                  <option value="percent">Efectividad V/{basis}</option>
                </select>
              </label>
              {view === "period" && (
                <label>
                  Base de comparación
                  <select
                    aria-label="Base del comparativo del equipo"
                    value={basis}
                    onChange={(e) => {
                      setBasis(e.target.value as "BC" | "BM");
                      setPage(0);
                    }}
                  >
                    <option value="BC">BC · por contactar</option>
                    <option value="BM">BM · manual</option>
                  </select>
                </label>
              )}
            </div>
            <h3>
              Comparativo por asesor ·{" "}
              {sort === "sales" ? "ventas" : "efectividad V/" + basis}
            </h3>
            <p className="hint">
              Mayor valor primero. El porcentaje debe interpretarse junto con la
              cantidad de base y las ventas. * Datos parciales; — sin dato o sin
              base válida. Un porcentaje alto con poca base no implica más
              ventas.
            </p>
            {!rows.length ? (
              <p>No hay asesores en esta pestaña.</p>
            ) : (
              <>
                <div className="team-bars-scroll">
                  <div
                    className="team-bars"
                    role="img"
                    aria-label={`Barras verticales de ${sort === "sales" ? "ventas" : "efectividad"} por asesor. Valores exactos en la tabla.`}
                  >
                    {visible.map((r) => (
                      <button
                        key={r.id}
                        className="team-bar-column"
                        onClick={() => onAdvisor(r.id)}
                        title={`${r.name}: ${fmt(r.sales)} ventas, ${basis} ${fmt(r.base)}, efectividad ${fmt(r.percent)} %. Abrir detalle individual.`}
                      >
                        <strong>
                          {fmt(r[sort])}
                          {sort === "percent" && r.percent !== null ? " %" : ""}
                          {r.partial && r[sort] !== null ? " *" : ""}
                        </strong>
                        <span className="team-bar-track">
                          {r[sort] !== null && r[sort]! > 0 ? (
                            <span
                              style={{
                                height: `${Math.max(1, (r[sort]! / max) * 100)}%`,
                                background:
                                  colors[
                                    [...r.id].reduce(
                                      (n, c) => n + c.charCodeAt(0),
                                      0,
                                    ) % colors.length
                                  ],
                              }}
                            />
                          ) : null}
                        </span>
                        <span>{r.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="team-results-table">
                    <thead>
                      <tr>
                        <th>Asesor</th>
                        <th>Ventas (V)</th>
                        <th>{basis}</th>
                        <th>V/{basis} %</th>
                        <th>Promedio por día con V</th>
                        <th>Cobertura V / base</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.id}>
                          <th>{r.name}</th>
                          <td>{fmt(r.sales)}</td>
                          <td>{fmt(r.base)}</td>
                          <td>
                            {fmt(r.percent)}
                            {r.partial && r.percent !== null ? " *" : ""}
                          </td>
                          <td>{fmt(r.average)}</td>
                          <td>
                            {r.knownSales}/{r.days} · {r.knownBase}/{r.days}{" "}
                            días
                          </td>
                          <td>
                            <button onClick={() => onAdvisor(r.id)}>
                              Ver asesor
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="team-attendance">
                  <summary>Asistencias del equipo</summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Asesor</th>
                          <th>Presencias</th>
                          <th>Inasistencias</th>
                          <th>Horas ausentes</th>
                          <th>Regresos pendientes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((r) => (
                          <tr key={r.id}>
                            <th>{r.name}</th>
                            <td>{fmt(r.present)}</td>
                            <td>{fmt(r.absent)}</td>
                            <td>{fmt(r.hours)}</td>
                            <td>{r.pending}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                {pageCount > 1 && (
                  <nav className="row" aria-label="Páginas del comparativo">
                    <button
                      disabled={activePage === 0}
                      onClick={() => setPage(activePage - 1)}
                    >
                      Anteriores
                    </button>
                    <span>
                      {activePage + 1}/{pageCount} ·25 asesores por página
                    </span>
                    <button
                      disabled={activePage + 1 === pageCount}
                      onClick={() => setPage(activePage + 1)}
                    >
                      Siguientes
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </dialog>
      {person && (
        <AdvisorDetail
          person={person}
          tables={tables}
          initialTableId={tableId}
          initialAliasId=""
          initialCountry={country}
          initialAnalysisView={view}
          initialSince={since}
          initialUntil={until}
          onClose={() => setPersonId(null)}
        />
      )}
    </>
  );
}
