"use client";
import { useRef, useState } from "react";
import { TotalsProductHistory } from "./totals-product-history";
import type { TotalProduct } from "../../lib/meta-ads/totals-product-summary";
import { formatTotalDetail } from "../../lib/meta-ads/totals-detail";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
export function TotalsProducts({
  products,
  tableId,
  country,
  since,
  until,
}: {
  products: TotalProduct[];
  tableId: string;
  country: string;
  since: string;
  until: string;
}) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [selectedProduct, setSelectedProduct] = useState("");
  const container = useRef<HTMLDivElement>(null),
    historyTrigger = useRef<HTMLButtonElement | null>(null);
  const openHistory = (aliasId: string, button: HTMLButtonElement) => {
    historyTrigger.current = button;
    setSelectedProduct(aliasId);
    requestAnimationFrame(() => {
      const target = container.current?.querySelector<HTMLDetailsElement>(
        `details[data-detail-section="product-evolution:${CSS.escape(aliasId)}"]`,
      );
      if (!target) return;
      target.open = true;
      target.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      target
        .querySelector<HTMLElement>("button,select")
        ?.focus({ preventScroll: true });
    });
  };
  const status = (p: TotalProduct) =>
    p.sums.sales.value === null
      ? "unknown"
      : p.sums.sales.value === 0
        ? "zero"
        : "sold";
  const normalized = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
  const filtered = products.filter(
    (p) =>
      (filter === "all" || status(p) === filter) &&
      normalized(p.name).includes(normalized(query.trim())),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 50) - 1),
  );
  return (
    <div ref={container} className="totals-products">
      <div
        className="row totals-product-filters"
        aria-label="Filtrar diplomados por ventas"
      >
        {(
          [
            ["all", "Todos"],
            ["sold", "Con ventas"],
            ["zero", "0 ventas"],
            ["unknown", "Sin datos / N.A."],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setPage(0);
            }}
          >
            {label} (
            {products.filter((p) => key === "all" || status(p) === key).length})
          </button>
        ))}
        <input
          type="search"
          aria-label="Buscar diplomado en el detalle de Totales"
          placeholder="Buscar diplomado…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <p className="hint">
        Incluye activados y desactivados. 0 significa cero ventas registradas; —
        significa sin dato y N.A. no suma. * indica un período con datos
        parciales.
      </p>
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
              <th>Estado</th>
              <th>Asesores que vendieron</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice(currentPage * 50, currentPage * 50 + 50)
              .map((p) => (
                <tr key={p.aliasId} data-sales-status={status(p)}>
                  <th>{p.name}</th>
                  {(
                    ["sales", "budget", "base", "spend", "fixedCost"] as const
                  ).map((metric) => (
                    <td key={metric}>{formatTotalDetail(p.sums[metric])}</td>
                  ))}
                  <td>
                    {status(p) === "zero" ? (
                      <strong className="totals-zero-sales">
                        0 ventas registradas
                      </strong>
                    ) : status(p) === "unknown" ? (
                      p.sums.sales.na ? (
                        "N.A."
                      ) : (
                        "Sin dato registrado"
                      )
                    ) : (
                      "Con ventas"
                    )}
                    <small className="totals-product-active">
                      {p.active ? "Activado" : "Desactivado"}
                    </small>
                  </td>
                  <td>
                    {p.advisors
                      ?.filter((a) => (a.sales ?? 0) > 0)
                      .map((a) => `${a.name}: ${a.sales}`)
                      .join(" · ") ||
                      (p.sums.sales.value === 0
                        ? "Sin ventas (0)"
                        : "Sin registro por asesor")}
                  </td>
                  <td>
                    {p.days && (
                      <button
                        type="button"
                        aria-label={`Ver evolución de ${p.name}`}
                        onClick={(e) => openHistory(p.aliasId, e.currentTarget)}
                      >
                        Ver evolución
                      </button>
                    )}
                    <a
                      className="button alias-period-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={periodTableUrl({
                        tableId,
                        aliasId: p.aliasId,
                        country,
                        since,
                        until,
                      })}
                    >
                      {since === until ? "Ver día ↗" : "Ir al período ↗"}
                    </a>
                  </td>
                </tr>
              ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9}>
                  {products.length
                    ? "No hay diplomados con este filtro."
                    : "No hay diplomados para este país y moneda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 50 && (
        <div className="row">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            ← Anterior
          </button>
          <span>
            Página {currentPage + 1} de {Math.ceil(filtered.length / 50)}
          </span>
          <button
            type="button"
            disabled={(currentPage + 1) * 50 >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}
      {products.find((p) => p.aliasId === selectedProduct)?.days && (
        <TotalsProductHistory
          key={selectedProduct}
          product={products.find((p) => p.aliasId === selectedProduct)!}
          tableId={tableId}
          country={country}
          onClose={() => {
            setSelectedProduct("");
            requestAnimationFrame(() => {
              if (historyTrigger.current?.isConnected)
                historyTrigger.current.focus({ preventScroll: true });
            });
          }}
        />
      )}
    </div>
  );
}
