"use client";
import { useEffect, useState } from "react";
import type { EffectivenessSheet } from "../../lib/meta-ads/effectiveness";
import {
  summarizeTotalProducts,
  type TotalProduct,
} from "../../lib/meta-ads/totals-product-summary";
import { readRangePages } from "./workbook-range-request";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { DetailSection } from "./detail-section";
import { TotalsProducts } from "./totals-products";
export function TotalsPeriodProducts({
  tableId,
  country,
  currency,
  days,
  sectionId,
}: {
  tableId: string;
  country: string;
  currency: string;
  days: string[];
  sectionId: string;
}) {
  const since = days[0],
    until = days.at(-1);
  const context = JSON.stringify([tableId, country, currency, since, until]);
  const [result, setResult] = useState<{
      context: string;
      products: TotalProduct[];
    } | null>(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true,
      inFlight = false;
    setError("");
    const load = async () => {
      if (!active || inFlight || document.hidden || !since || !until) return;
      inFlight = true;
      try {
        const pages = await readRangePages<EffectivenessSheet>(
          "meta-ads/effectiveness",
          { tableId, since, until },
          () => active,
        );
        if (active) {
          setResult({
            context,
            products: summarizeTotalProducts(pages, days, country, currency),
          });
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron consultar los diplomados.",
          );
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(load, 30000),
      unsubscribe = subscribeAdvisorSalesChanged(load);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
    // The context fixes the complete continuous date range.
  }, [context, reload]);
  const data = result?.context === context ? result.products : null;
  return (
    <DetailSection
      id={sectionId + "products"}
      stateKey="period-products"
      title="Diplomados y resultados del período"
      tone="parameters"
    >
      <p className="hint">
        {since} — {until} · {country || "Sin país"} · {currency || "Sin moneda"}
        . Incluye los diplomados con 0 ventas en este período.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            Volver a consultar
          </button>
        </p>
      )}
      {!data && !error && (
        <p role="status">Consultando diplomados del período…</p>
      )}
      {data && since && until && (
        <TotalsProducts
          key={context}
          products={data}
          tableId={tableId}
          country={country}
          since={since}
          until={until}
        />
      )}
    </DetailSection>
  );
}
