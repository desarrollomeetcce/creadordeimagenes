"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { DetailSection } from "./detail-section";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
import { performanceRatio } from "../../lib/meta-ads/performance-metrics";
import type { TotalsDailyData } from "../../lib/meta-ads/totals-daily-detail";
import { formatTotalDetail } from "../../lib/meta-ads/totals-detail";

export function TotalsDailyBreakdown({
  tableId,
  country,
  currency,
  day,
  sectionId,
}: {
  tableId: string;
  country: string;
  currency: string;
  day: string;
  sectionId: string;
}) {
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
  return (
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
        title="Ventas, BM y BC por asesor"
        tone="sales"
      >
        <p className="hint">
          {day} · BM y BC son independientes y corresponden a toda la hoja y
          país, sin separar monedas ni asignarlas a productos. Las ventas
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
                  <th>Base manual (BM)</th>
                  <th>Base por contactar (BC)</th>
                  <th>Ventas / BM</th>
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
                      <td>{p.manualBase ?? "—"}</td>
                      <td>{p.advisorBase ?? "—"}</td>
                      <td>
                        {ratio === null
                          ? "—"
                          : ratio.toLocaleString("es-PE", {
                              maximumFractionDigits: 2,
                            }) +
                            " %" +
                            (p.partial ? " *" : "")}
                      </td>
                    </tr>
                  );
                })}
                {!data.advisors.length && (
                  <tr>
                    <td colSpan={5}>
                      No hay repartos de ventas o base manual para este día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.baseState !== "VALUE" && (
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
      <DetailSection
        id={sectionId + "products"}
        stateKey="daily-products"
        title="Ventas y resultados por producto"
        tone="parameters"
      >
        <p className="hint">
          {day} · {country || "Sin país"} · {currency || "Sin moneda"}. B y G
          corresponden a la vista automática. Abre el producto para consultar
          sus datos del día.
        </p>
        {data && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Ventas (V)</th>
                  <th>Presupuesto (P)</th>
                  <th>Base (B)</th>
                  <th>Gasto (G)</th>
                  <th>Costos fijos (CF)</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.aliasId}>
                    <th>{p.name}</th>
                    {(
                      ["sales", "budget", "base", "spend", "fixedCost"] as const
                    ).map((metric) => (
                      <td key={metric}>{formatTotalDetail(p.sums[metric])}</td>
                    ))}
                    <td>
                      <a
                        className="button alias-period-link"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={periodTableUrl({
                          tableId,
                          aliasId: p.aliasId,
                          country,
                          since: day,
                          until: day,
                        })}
                      >
                        Ver día ↗
                      </a>
                    </td>
                  </tr>
                ))}
                {!data.products.length && (
                  <tr>
                    <td colSpan={7}>No hay productos en este bloque.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
    </>
  );
}
