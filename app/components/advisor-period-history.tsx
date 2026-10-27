"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import type { AdvisorPeriodView } from "../../lib/meta-ads/advisor-period-history";
const stamp = (s: string) =>
  new Date(s).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function AdvisorPeriodHistory({
  advisorId,
  tableId,
  aliasId,
  country,
  onStatistics,
  onPeriod,
}: {
  advisorId: string;
  tableId: string;
  aliasId: string;
  country: string;
  onStatistics: (p: AdvisorPeriodView) => void;
  onPeriod: (p: AdvisorPeriodView) => void;
}) {
  const [periods, setPeriods] = useState<AdvisorPeriodView[]>([]),
    [page, setPage] = useState(0),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  const query =
    "meta-ads/advisors/periods?" +
    new URLSearchParams({
      tableId,
      advisorId,
      ...(aliasId ? { aliasId } : {}),
      ...(country ? { country } : {}),
    });
  useEffect(() => {
    let active = true,
      version = 0;
    setPage(0);
    setPeriods([]);
    setLoading(true);
    setMessage("");
    const load = () => {
      if (document.hidden) return;
      const seq = ++version;
      void api(query)
        .then((v) => {
          if (active && seq === version) {
            setPeriods(v.periods);
            setMessage("");
          }
        })
        .catch((e) => {
          if (active && seq === version) setMessage(e.message);
        })
        .finally(() => {
          if (active && seq === version) setLoading(false);
        });
    };
    load();
    const timer = setInterval(load, 30000),
      unsubscribe = subscribeAdvisorSalesChanged(load);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [query]);
  const count = Math.max(1, Math.ceil(periods.length / 5)),
    current = Math.min(page, count - 1);
  return (
    <section
      className="advisor-tenure-history"
      aria-label="Histórico de asignaciones de asesores"
    >
      <h3>Últimas asignaciones de asesores</h3>
      <p className="hint">
        {aliasId && country
          ? "Todos los asesores de este inventario y país."
          : "Asignaciones del asesor en las combinaciones elegidas."}{" "}
        Más recientes primero, cinco por página. Fechas y horas de Lima.
      </p>
      {loading && <p role="status">Cargando asignaciones…</p>}
      {message && <p role="alert">{message}</p>}
      <ol className="alias-active-periods advisor-period-list">
        {periods.slice(current * 5, current * 5 + 5).map((p) => (
          <li key={[p.aliasId, p.country, p.id].join(":")}>
            <div>
              <strong>{p.advisorName}</strong>
              <span>
                {p.kind === "SALES_DAY" ? (
                  `Ventas del ${p.since} · ${p.recordedSales} V registradas`
                ) : (
                  <>
                    {p.from
                      ? `Desde ${stamp(p.from)}`
                      : "Inicio sin fecha registrada"}
                    {p.until ? ` hasta ${stamp(p.until)}` : " hasta la fecha"}
                  </>
                )}
              </span>
              <small>
                {p.alias} · {p.country} · {p.tableName}
                {p.kind !== "SALES_DAY" && p.until
                  ? ` · Cambio a ${p.nextAdvisorName ?? "sin asesor"}`
                  : ""}
              </small>
            </div>
            <div className="row advisor-period-actions">
              <button
                type="button"
                disabled={!p.from || !p.since}
                onClick={() => onStatistics(p)}
              >
                Estadísticas
              </button>
              <button
                type="button"
                className="alias-period-link"
                disabled={!p.from || !p.since}
                onClick={() => onPeriod(p)}
              >
                Ir al período
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!loading && !periods.length && (
        <p>No hay asignaciones registradas en esta combinación.</p>
      )}
      {periods.some((p) => !p.from) && (
        <small>
          Un inicio sin registro no se completa con una fecha supuesta.
        </small>
      )}
      {periods.length > 5 && (
        <nav
          className="alias-period-pagination"
          aria-label="Páginas de asignaciones de asesores"
        >
          <span>
            {current * 5 + 1}–{Math.min(current * 5 + 5, periods.length)} de{" "}
            {periods.length} asignaciones · Página {current + 1} de {count}
          </span>
          <div className="row">
            <button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Más recientes
            </button>
            <button
              disabled={current + 1 >= count}
              onClick={() => setPage(current + 1)}
            >
              Anteriores
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
