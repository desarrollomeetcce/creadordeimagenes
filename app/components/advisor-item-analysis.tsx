"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
type Row = {
  advisorId: string | null;
  name: string;
  sales: number | null;
  knownDays: number;
  pending: boolean;
  na: number;
};
export function AdvisorItemAnalysis({
  tableId,
  aliasId,
  country,
  since,
  until,
  onAdvisor,
}: {
  tableId: string;
  aliasId: string;
  country: string;
  since: string;
  until: string;
  onAdvisor: (id: string) => void;
}) {
  const [data, setData] = useState<{
      rows: Row[];
      total: number | null;
    } | null>(null),
    [message, setMessage] = useState("");
  const query = aliasId
    ? "meta-ads/advisors/item-analysis?" +
      new URLSearchParams({ tableId, aliasId, country, since, until })
    : "";
  useEffect(() => {
    if (!query) return;
    let active = true,
      version = 0;
    setData(null);
    setMessage("");
    const load = () => {
      if (document.hidden) return;
      const seq = ++version;
      void api(query)
        .then((v) => {
          if (active && seq === version) setData(v);
        })
        .catch((e) => {
          if (active && seq === version) setMessage(e.message);
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
  return (
    <section
      className="advisor-item-analysis"
      aria-label="Análisis del inventario por asesor"
    >
      <h3>Ventas de este inventario por asesor</h3>
      <p className="hint">
        Incluye ventas registradas aunque el ítem estuviera desactivado o el
        asesor no fuera su responsable.
      </p>
      {!aliasId ? (
        <p>Selecciona un inventario para comparar sus asesores.</p>
      ) : message ? (
        <p role="alert">{message}</p>
      ) : !data ? (
        <p role="status">Cargando análisis…</p>
      ) : !data.rows.length ? (
        <p>No hay ventas registradas en este período.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Asesor</th>
                <th>Ventas (V)</th>
                <th>Días con registro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.advisorId ?? "unassigned"}
                  data-analysis-advisor={r.advisorId ?? ""}
                >
                  <td>{r.name}</td>
                  <td>
                    {r.sales === null ? (r.na ? "N.A." : "—") : r.sales}
                    {r.pending ? " *" : ""}
                  </td>
                  <td>{r.knownDays}</td>
                  <td>
                    <button
                      type="button"
                      disabled={!r.advisorId}
                      onClick={() => r.advisorId && onAdvisor(r.advisorId)}
                    >
                      Estadísticas del asesor
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
