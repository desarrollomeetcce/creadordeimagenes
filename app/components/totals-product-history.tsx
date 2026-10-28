"use client";
import { useId, useState } from "react";
import type { TotalProduct } from "../../lib/meta-ads/totals-product-summary";
import { DetailSection } from "./detail-section";
import { SheetSearchSelect } from "./sheet-search-select";
import { MetaDailyChart } from "./meta-daily-chart";
import { useReportDayPages } from "./report-day-pages";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
export function TotalsProductHistory({
  product,
  tableId,
  country,
  onClose,
}: {
  product: TotalProduct;
  tableId: string;
  country: string;
  onClose: () => void;
}) {
  const id = useId(),
    [advisor, setAdvisor] = useState("__all");
  const dates = Object.keys(product.days ?? {}).sort(),
    { visibleDays, navigation } = useReportDayPages([...dates].reverse());
  const portions = (day: string) =>
    (product.days?.[day]?.advisors ?? []).filter(
      (p) => advisor === "__all" || (p.advisorId ?? "__unassigned") === advisor,
    );
  const value = (day: string) => {
    if (advisor === "__all")
      return product.days?.[day]?.sums.sales.value ?? null;
    const entries = portions(day).filter((p) => p.sales !== null && !p.na);
    return entries.length ? entries.reduce((s, p) => s + p.sales!, 0) : null;
  };
  let sum = 0;
  const chart = dates.map((day) => {
    const sales = value(day);
    if (sales !== null) sum += sales;
    return {
      day,
      results: sales,
      cost: sales === null ? null : sum,
      spend: null,
    };
  });
  return (
    <DetailSection
      id={id}
      stateKey={"product-evolution:" + product.aliasId}
      title={`${product.name} · Evolución diaria`}
      tone="daily"
    >
      <div className="row totals-product-history-controls">
        <SheetSearchSelect
          label="Asesor del histórico del diplomado en Totales"
          value={advisor}
          options={[
            { value: "__all", label: "Todos los asesores" },
            ...(product.advisors ?? []).map((p) => ({
              value: p.advisorId ?? "__unassigned",
              label: p.name,
            })),
          ]}
          onSelect={setAdvisor}
        />
        <button type="button" className="ui-close-button" onClick={onClose}>
          Cerrar evolución
        </button>
      </div>
      <p className="hint">
        Ventas del diplomado y país elegidos. El acumulado suma solo registros
        disponibles; — no se convierte en0. BM y BC no se reparten por
        diplomado.
      </p>
      <MetaDailyChart
        rows={chart}
        bars="results"
        line="cost"
        currency=""
        metricName="Ventas"
        since={dates[0]}
        until={dates.at(-1)}
        labels={{
          results: "Ventas del día",
          cost: "Ventas registradas acumuladas",
        }}
        units={{ results: "count", cost: "count" }}
      />
      {navigation}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ventas (V)</th>
              <th>Quién vendió</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {visibleDays.map((day) => {
              const n = value(day),
                entries = portions(day);
              return (
                <tr key={day} data-product-history-date={day}>
                  <th>{day}</th>
                  <td>
                    {n ??
                      ((
                        advisor === "__all"
                          ? product.days?.[day]?.sums.sales.na
                          : entries.some((p) => p.na)
                      )
                        ? "N.A."
                        : "—")}
                    {(
                      advisor === "__all"
                        ? product.days?.[day]?.sums.sales.partial
                        : entries.some((p) => p.partial)
                    )
                      ? " *"
                      : ""}
                  </td>
                  <td>
                    {entries
                      .filter((p) => p.sales !== null && !p.na && p.sales > 0)
                      .map(
                        (p) => `${p.name}: ${p.sales ?? (p.na ? "N.A." : "—")}`,
                      )
                      .join(" · ") ||
                      (n === 0 ? "Sin ventas (0)" : "Sin registro por asesor")}
                  </td>
                  <td>
                    <a
                      className="button alias-period-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={periodTableUrl({
                        tableId,
                        aliasId: product.aliasId,
                        country,
                        since: day,
                        until: day,
                      })}
                    >
                      Ver día ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DetailSection>
  );
}
