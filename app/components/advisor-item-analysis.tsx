"use client";
import { DetailSection } from "./detail-section";
import { useEffect, useState, type ReactNode } from "react";
import { readRangePages } from "./workbook-range-request";
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
  sectionId,
  aliasId,
  country,
  since,
  until,
  onAdvisor,
  children,
}: {
  tableId: string;
  sectionId?: string;
  aliasId: string;
  country: string;
  since: string;
  until: string;
  onAdvisor: (id: string) => void;
  children?: ReactNode;
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
    let inFlight = false;
    const load = () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      const seq = ++version;
      void readRangePages<{ rows: Row[]; total: number | null }>(
        "meta-ads/advisors/item-analysis",
        { tableId, aliasId, country, since, until },
        () => active && seq === version,
      )
        .then((pages) => {
          const people = new Map<string | null, Row>();
          for (const page of pages)
            for (const r of page.rows) {
              const old = people.get(r.advisorId);
              people.set(r.advisorId, {
                ...r,
                sales:
                  r.sales === null && (old?.sales ?? null) === null
                    ? null
                    : (r.sales ?? 0) + (old?.sales ?? 0),
                knownDays: r.knownDays + (old?.knownDays ?? 0),
                pending: r.pending || !!old?.pending,
                na: r.na + (old?.na ?? 0),
              });
            }
          const rows = [...people.values()].sort(
            (a, b) =>
              (b.sales ?? -1) - (a.sales ?? -1) || a.name.localeCompare(b.name),
          );
          const v = {
            rows,
            total: rows.some((r) => r.sales !== null)
              ? rows.reduce((s, r) => s + (r.sales ?? 0), 0)
              : null,
          };
          if (active && seq === version) setData(v);
        })
        .catch((e) => {
          if (active && seq === version) setMessage(e.message);
        })
        .finally(() => {
          inFlight = false;
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
    <DetailSection
      id={sectionId}
      stateKey="inventory-analysis"
      title="Ventas de este inventario por asesor"
      tone="sales"
      className="advisor-item-analysis"
    >
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
      {children}
    </DetailSection>
  );
}
