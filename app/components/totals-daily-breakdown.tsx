"use client";
import { useEffect, useState, type ReactNode } from "react";
import { engineRequest as api } from "./generation-engine";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { DetailSection } from "./detail-section";
import {
  totalViewColumns,
  type TotalDetailView,
} from "../../lib/meta-ads/total-detail-views";
import { TotalsProducts } from "./totals-products";
import { performanceRatio } from "../../lib/meta-ads/performance-metrics";
import type { TotalsDailyData } from "../../lib/meta-ads/totals-daily-detail";

export function TotalsDailyBreakdown({
  tableId,
  country,
  currency,
  day,
  sectionId,
  view = "manual",
  children,
}: {
  view?: TotalDetailView;
  children?: (sections: {
    advisors: ReactNode;
    products: ReactNode;
  }) => ReactNode;
  tableId: string;
  country: string;
  currency: string;
  day: string;
  sectionId: string;
}) {
  const showBM = totalViewColumns(view).some((c) => c.key === "baseManual"),
    showBC = totalViewColumns(view).some((c) => c.key === "advisorBase");
  const query =
    "meta-ads/effectiveness/totals/daily-detail?" +
    new URLSearchParams({ tableId, country, currency, day });
  const [result, setResult] = useState<{
    query: string;
    data: TotalsDailyData;
  } | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!day) return;
    let active = true,
      inFlight = false;
    setError("");
    const load = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data: TotalsDailyData = await api(query);
        if (active) {
          setResult({ query, data });
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo consultar el detalle diario.",
          );
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(load, 30000);
    const unsubscribe = subscribeAdvisorSalesChanged(load);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [query, reload]);
  const data = result?.query === query ? result.data : null;
  const advisors = (
    <>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            Volver a consultar
          </button>
        </p>
      )}
      {!data && !error && (
        <p role="status">Consultando asesores y productos del día…</p>
      )}
      <DetailSection
        id={sectionId + "advisors"}
        stateKey="daily-advisors"
        title="Ventas y bases del día por asesor"
        tone="sales"
      >
        <p className="hint">
          {day} · Las bases manuales son independientes y corresponden a toda la
          hoja y país, sin separar monedas ni asignarlas a productos. Las ventas
          respetan el reparto registrado, aunque el asesor no estuviera asignado
          o el producto esté desactivado. — sin dato; * cobertura parcial.
        </p>
        {data && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Asesor</th>
                  <th>Ventas (V)</th>
                  {showBM && <th>Base manual (BM)</th>}
                  {showBC && <th>Base por contactar (BC)</th>}
                  {showBM && <th>Ventas / BM</th>}
                </tr>
              </thead>
              <tbody>
                {data.advisors.map((p) => {
                  const ratio = performanceRatio(p.sales, p.manualBase, 100);
                  return (
                    <tr key={p.advisorId ?? "unassigned"}>
                      <th>{p.name}</th>
                      <td>
                        {p.sales ?? (p.na ? "N.A." : "—")}
                        {p.partial ? " *" : ""}
                      </td>
                      {showBM && <td>{p.manualBase ?? "—"}</td>}
                      {showBC && <td>{p.advisorBase ?? "—"}</td>}
                      {showBM && (
                        <td>
                          {ratio === null
                            ? "—"
                            : ratio.toLocaleString("es-PE", {
                                maximumFractionDigits: 2,
                              }) +
                              " %" +
                              (p.partial ? " *" : "")}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!data.advisors.length && (
                  <tr>
                    <td colSpan={2 + (showBM ? 2 : 0) + (showBC ? 1 : 0)}>
                      No hay repartos de ventas o base manual para este día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {showBM && data && data.baseState !== "VALUE" && (
          <p className="hint">
            {data.baseState === "NA"
              ? "Base manual marcada N.A."
              : "Sin reparto manual guardado para este día. Los importes anteriores de Totales no se atribuyen a personas."}
          </p>
        )}
        <p className="hint">
          Si el país tiene varios bloques de moneda, V pertenece al bloque
          elegido y BM y BC son bases independientes compartidas del país.
        </p>
      </DetailSection>
    </>
  );
  const products = (
    <DetailSection
      id={sectionId + "products"}
      stateKey="daily-products"
      title="Ventas y resultados por producto"
      tone="parameters"
    >
      <p className="hint">
        {day} · {country || "Sin país"} · {currency || "Sin moneda"}. Parámetros
        de la vista elegida. Las bases y los gastos manuales de Totales no se
        reparten por producto.
      </p>
      {data && (
        <TotalsProducts
          view={view}
          products={data.products}
          tableId={tableId}
          country={country}
          since={day}
          until={day}
        />
      )}
    </DetailSection>
  );
  return children ? (
    children({ advisors, products })
  ) : (
    <>
      {advisors}
      {products}
    </>
  );
}
