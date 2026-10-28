"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EffectivenessSheet } from "../../lib/meta-ads/effectiveness";
import {
  mergeTotalProductReports,
  type TotalProductPage,
} from "../../lib/meta-ads/totals-product-summary";
import {
  sheetSalesProducts,
  sheetSalesStatus,
  sumSalesAdvisors,
  emptySales,
  type SheetSalesBlock,
  type SheetSalesProduct,
} from "../../lib/meta-ads/sheet-sales-summary";
import {
  totalDetailSummary,
  formatTotalDetail as format,
} from "../../lib/meta-ads/totals-detail";
import { sheetMetrics } from "../../lib/meta-ads/period-summary";
import { readRangePages } from "./workbook-range-request";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import {
  VerticalDetailLayout,
  InventoryDetailSlot,
} from "./inventory-detail-layout";
import { DetailSections, DetailSection } from "./detail-section";
import { DetailStickyHeader } from "./detail-sticky-header";
import { DetailNavigation } from "./detail-navigation";
import { DetailPeriodPresets } from "./detail-period-presets";
import { totalDetailPeriods } from "../../lib/meta-ads/detail-period-presets";
import { MetaDateRange } from "./meta-date-range";
import { MetaDailyChart } from "./meta-daily-chart";
import { SheetSearchSelect } from "./sheet-search-select";
import { useReportDayPages } from "./report-day-pages";
const sheetModules = [
  "sheet-compare",
  "sheet-evolution",
  "sheet-history",
  "sheet-advisors",
  "sheet-data",
] as const;
const statusNames: Record<string, string> = {
  selling: "Con ventas",
  low: "Pocas ventas",
  zero: "Cero registrado",
  unknown: "Sin datos / N.A.",
};
export function SheetSalesDetail({
  tableId,
  name,
  initialSince,
  initialUntil,
  onClose,
}: {
  tableId: string;
  name: string;
  initialSince: string;
  initialUntil: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    id = useId();
  const [since, setSince] = useState(initialSince),
    [until, setUntil] = useState(initialUntil),
    [country, setCountry] = useState("__all"),
    [blocks, setBlocks] = useState<SheetSalesBlock[]>([]),
    [fetching, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [selected, setSelected] = useState("__all"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [threshold, setThreshold] = useState(2),
    [ascending, setAscending] = useState(false),
    [page, setPage] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState("");
  const rangeQuery = JSON.stringify([tableId, since, until]);
  const loading = fetching || (!error && loadedQuery !== rangeQuery);
  const dates = useMemo(() => {
    const result: string[] = [];
    if (
      since <= until &&
      (Date.parse(until) - Date.parse(since)) / 86400000 < 3660
    )
      for (let at = Date.parse(since); at <= Date.parse(until); at += 86400000)
        result.push(new Date(at).toISOString().slice(0, 10));
    return result;
  }, [since, until]);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!dates.length) return;
    let active = true,
      inFlight = false;
    setBlocks([]);
    setError("");
    setLoading(true);
    const load = async () => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const pages = await readRangePages<EffectivenessSheet>(
            "meta-ads/effectiveness",
            { tableId, since, until },
            () => active,
          ),
          groups = [
            ...new Map(
              pages.flatMap((p) =>
                p.rows.map(
                  (r) =>
                    [
                      JSON.stringify([r.country, r.currency]),
                      { country: r.country, currency: r.currency },
                    ] as const,
                ),
              ),
            ).values(),
          ],
          result: SheetSalesBlock[] = [];
        for (let i = 0; i < groups.length; i += 2) {
          const batch = await Promise.all(
            groups.slice(i, i + 2).map(async (group) => {
              const pp = await readRangePages<TotalProductPage>(
                "meta-ads/effectiveness/totals/product-detail",
                { tableId, ...group, since, until },
                () => active,
              );
              return {
                ...group,
                products: mergeTotalProductReports(pp, dates),
              };
            }),
          );
          result.push(...batch);
          if (!active) return;
        }
        sheetSalesProducts(result, dates);
        if (active) {
          setBlocks(result);
          setLoadedQuery(rangeQuery);
          setError("");
        }
      } catch (e) {
        if (active) {
          setBlocks([]);
          setError(
            e instanceof Error ? e.message : "No se pudo consultar la hoja.",
          );
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
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
  }, [tableId, since, until, reload, dates]);
  const countries = [
      ...new Set([
        ...blocks.map((b) => b.country),
        ...(country !== "__all" ? [country] : []),
      ]),
    ].sort(),
    visibleBlocks = blocks.filter(
      (b) => country === "__all" || b.country === country,
    ),
    products = useMemo(
      () => sheetSalesProducts(visibleBlocks, dates),
      [blocks, country, dates],
    ),
    chosen = products.find((p) => p.aliasId === selected),
    focus = chosen ? [chosen] : products;
  const filtered = products
      .filter(
        (p) =>
          (status === "all" ||
            (status === "selling"
              ? (p.sales.value ?? 0) > 0
              : sheetSalesStatus(p, threshold) === status)) &&
          query
            .trim()
            .toLocaleLowerCase("es")
            .split(/\s+/)
            .every((word) => p.name.toLocaleLowerCase("es").includes(word)),
      )
      .sort((a, b) =>
        ascending
          ? (a.sales.value ?? Infinity) - (b.sales.value ?? Infinity)
          : 0,
      ),
    currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(filtered.length / 50) - 1),
    ),
    shown = filtered.slice(currentPage * 50, (currentPage + 1) * 50);

  const total = totalDetailSummary(products.map((p) => p.sales)),
    people = sumSalesAdvisors(products.flatMap((p) => p.advisors)),
    { visibleDays, navigation } = useReportDayPages(dates);
  let cumulative = 0;
  const chart = dates.map((day) => {
    const v = totalDetailSummary(
      focus.map((p) => p.days[day]?.sales ?? emptySales),
    ).value;
    if (v !== null) cumulative += v;
    return {
      day,
      results: v,
      cost: v === null ? null : cumulative,
      spend: null,
    };
  });
  const range = (a: string, b: string) => {
    setSince(a);
    setUntil(b);
    setPage(0);
  };
  const selectProduct = (p: SheetSalesProduct) => {
    setSelected(p.aliasId);
    requestAnimationFrame(() =>
      document
        .getElementById(id + "evolution")
        ?.scrollIntoView({ block: "start", behavior: "auto" }),
    );
  };
  return (
    <DetailSections>
      <VerticalDetailLayout modules={sheetModules} scope="sheet-sales">
        {(layout) => (
          <dialog
            ref={dialog}
            className="meta-detail sheet-sales-detail"
            aria-label={`Detalle de toda la hoja ${name}`}
            onCancel={onClose}
          >
            <DetailStickyHeader>
              <header>
                <h2>{name} · Análisis de toda la hoja</h2>
              </header>
              <DetailNavigation
                onClose={onClose}
                disabled={loading}
                items={[
                  {
                    target: id + "compare",
                    label: "Qué diplomados venden",
                    tone: "sales",
                  },
                  {
                    target: id + "evolution",
                    label: "Evolución diaria",
                    tone: "parameters",
                  },
                  {
                    target: id + "history",
                    label: "Qué vendió cada día",
                    tone: "daily",
                  },
                  {
                    target: id + "advisors",
                    label: "Asesores",
                    tone: "assignments",
                  },
                  {
                    target: id + "data",
                    label: "Datos por país",
                    tone: "products",
                  },
                ].sort(
                  (a, b) =>
                    layout.order.indexOf(
                      ("sheet-" +
                        a.target.slice(
                          id.length,
                        )) as (typeof sheetModules)[number],
                    ) -
                    layout.order.indexOf(
                      ("sheet-" +
                        b.target.slice(
                          id.length,
                        )) as (typeof sheetModules)[number],
                    ),
                )}
              />
              <div className="row sheet-sales-detail-controls">
                <MetaDateRange
                  maxDays={3660}
                  from={since}
                  to={until}
                  onChange={range}
                />
                <DetailPeriodPresets
                  scope={"sheet-sales:" + tableId}
                  sectionId={id + "periods"}
                  label="Períodos guardados de la hoja"
                  defaults={totalDetailPeriods}
                  since={since}
                  until={until}
                  onSelect={range}
                />
                <SheetSearchSelect
                  label="País del análisis de toda la hoja"
                  value={country}
                  options={[
                    { value: "__all", label: "Todos los países" },
                    ...countries.map((c) => ({
                      value: c,
                      label: c || "Sin país",
                    })),
                  ]}
                  onSelect={(c) => {
                    setCountry(c);
                    setPage(0);
                  }}
                />
                <button
                  type="button"
                  disabled={loading || !dates.length}
                  onClick={() => setReload((v) => v + 1)}
                >
                  Actualizar detalle
                </button>
              </div>
              <p className="hint">
                Ventas del {since === until ? since : `${since} — ${until}`} ·
                Lima. Toda la hoja, incluidos los diplomados desactivados.
                Ventas registradas por asesor; cero, N.A. y falta de registro se
                muestran por separado. No cambia los filtros de la tabla.
              </p>
            </DetailStickyHeader>
            {loading && (
              <p role="status">Consultando todos los diplomados del período…</p>
            )}
            {error && <p role="alert">{error}</p>}
            {!dates.length && (
              <p role="alert">Elige un período válido de hasta diez años.</p>
            )}
            {!loading && !error && (
              <>
                <div className="sheet-sales-overview">
                  {[
                    ["Ventas registradas", format(total)],
                    [
                      "Diplomados con ventas",
                      products.filter((p) => (p.sales.value ?? 0) > 0).length,
                    ],
                    [
                      "Pocas ventas (≤ " + threshold + ")",
                      products.filter(
                        (p) => sheetSalesStatus(p, threshold) === "low",
                      ).length,
                    ],
                    [
                      "Cero registrado",
                      products.filter(
                        (p) => sheetSalesStatus(p, threshold) === "zero",
                      ).length,
                    ],
                    [
                      "Sin datos / N.A.",
                      products.filter(
                        (p) => sheetSalesStatus(p, threshold) === "unknown",
                      ).length,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                {(() => {
                  const modules: Record<
                    (typeof sheetModules)[number],
                    ReactNode
                  > = {
                    "sheet-compare": (
                      <DetailSection
                        id={id + "compare"}
                        stateKey="sheet-compare"
                        title="Qué diplomados venden y cuáles necesitan revisión"
                        tone="sales"
                      >
                        <div className="row sheet-sales-detail-controls">
                          <input
                            aria-label="Buscar diplomado en el análisis de la hoja"
                            placeholder="Buscar diplomado…"
                            value={query}
                            onChange={(e) => {
                              setQuery(e.target.value);
                              setPage(0);
                            }}
                          />
                          <select
                            aria-label="Clasificación de ventas"
                            value={status}
                            onChange={(e) => {
                              setStatus(e.target.value);
                              setPage(0);
                            }}
                          >
                            <option value="all">Todos los diplomados</option>
                            {Object.entries(statusNames).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <label>
                            Pocas ventas: hasta{" "}
                            <input
                              aria-label="Límite de pocas ventas"
                              type="number"
                              min="0"
                              max="1000000"
                              value={threshold}
                              onChange={(e) => {
                                setThreshold(
                                  Math.max(
                                    0,
                                    Math.min(1000000, Number(e.target.value)),
                                  ),
                                );
                                setPage(0);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            aria-pressed={ascending}
                            onClick={() => {
                              setAscending((v) => !v);
                              setPage(0);
                            }}
                          >
                            {ascending
                              ? "Menor a mayor venta"
                              : "Mayor a menor venta"}
                          </button>
                        </div>
                        <SheetSalesBars
                          products={shown}
                          onSelect={selectProduct}
                        />
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Diplomado</th>
                                <th>País</th>
                                <th>Ventas (V)</th>
                                <th>Resultado del período</th>
                                <th>Estado actual</th>
                                <th>Quiénes vendieron</th>
                                <th>Detalle</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shown.map((p) => (
                                <tr
                                  key={p.aliasId}
                                  data-sheet-product={p.aliasId}
                                  data-sales-status={sheetSalesStatus(
                                    p,
                                    threshold,
                                  )}
                                >
                                  <th>{p.name}</th>
                                  <td>
                                    {p.countries
                                      .map((c) => c || "Sin país")
                                      .join(", ")}
                                  </td>
                                  <td>{format(p.sales)}</td>
                                  <td>
                                    {
                                      statusNames[
                                        sheetSalesStatus(p, threshold)
                                      ]
                                    }
                                  </td>
                                  <td>
                                    {p.active
                                      ? p.countries.length > 1
                                        ? "Activado en algún país"
                                        : "Activado"
                                      : "Desactivado"}
                                  </td>
                                  <td>
                                    {p.advisors
                                      .filter(
                                        (a) =>
                                          a.sales !== null &&
                                          !a.na &&
                                          a.sales > 0,
                                      )
                                      .map(
                                        (a) =>
                                          `${a.name}: ${a.sales}${a.partial ? " *" : ""}`,
                                      )
                                      .join(" · ") || "Sin ventas atribuidas"}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      aria-label={`Ver evolución de ${p.name} en la hoja`}
                                      onClick={() => selectProduct(p)}
                                    >
                                      Ver evolución
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {!shown.length && (
                          <p>
                            No hay diplomados que coincidan con estos filtros.
                          </p>
                        )}
                        {filtered.length > 50 && (
                          <div className="row">
                            <button
                              type="button"
                              disabled={!currentPage}
                              onClick={() => setPage(currentPage - 1)}
                            >
                              ← Anterior
                            </button>
                            <span>
                              Página {currentPage + 1} de{" "}
                              {Math.ceil(filtered.length / 50)}
                            </span>
                            <button
                              type="button"
                              disabled={
                                (currentPage + 1) * 50 >= filtered.length
                              }
                              onClick={() => setPage(currentPage + 1)}
                            >
                              Siguiente →
                            </button>
                          </div>
                        )}
                        <p className="hint">
                          “Pocas ventas” usa el límite que elijas para todo el
                          período. * Hay datos parciales. Un guion no se
                          considera cero.
                        </p>
                      </DetailSection>
                    ),
                    "sheet-evolution": (
                      <DetailSection
                        id={id + "evolution"}
                        stateKey="sheet-evolution"
                        title="Cómo evolucionan las ventas de los diplomados"
                        tone="parameters"
                      >
                        <SheetSearchSelect
                          label="Diplomado de la evolución de la hoja"
                          value={chosen?.aliasId ?? "__all"}
                          options={[
                            { value: "__all", label: "Toda la hoja" },
                            ...products.map((p) => ({
                              value: p.aliasId,
                              label: p.name,
                            })),
                          ]}
                          onSelect={setSelected}
                        />
                        <MetaDailyChart
                          rows={chart}
                          bars="results"
                          line="cost"
                          metricName="Ventas"
                          currency="PEN"
                          since={since}
                          until={until}
                          labels={{
                            results: "Ventas del día",
                            cost: "Ventas registradas acumuladas",
                          }}
                          units={{ results: "count", cost: "count" }}
                        />
                        <p className="hint">
                          {chosen?.name ?? "Toda la hoja"} · Los días sin
                          registro quedan sin dato; no se inventan ventas.
                        </p>
                      </DetailSection>
                    ),
                    "sheet-history": (
                      <DetailSection
                        id={id + "history"}
                        stateKey="sheet-history"
                        title="Qué diplomados se vendieron cada día"
                        tone="daily"
                      >
                        {navigation}
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Fecha</th>
                                <th>Ventas</th>
                                <th>Diplomados vendidos</th>
                                <th>Asesores</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleDays.map((day) => {
                                const v = totalDetailSummary(
                                    focus.map(
                                      (p) => p.days[day]?.sales ?? emptySales,
                                    ),
                                  ),
                                  sold = focus.filter(
                                    (p) => (p.days[day]?.sales.value ?? 0) > 0,
                                  ),
                                  sellers = sumSalesAdvisors(
                                    focus.flatMap(
                                      (p) => p.days[day]?.advisors ?? [],
                                    ),
                                  );
                                return (
                                  <tr key={day} data-sheet-sales-day={day}>
                                    <th>{day}</th>
                                    <td>{format(v)}</td>
                                    <td>
                                      {sold.map((p) => (
                                        <div key={p.aliasId}>
                                          <button
                                            type="button"
                                            onClick={() => selectProduct(p)}
                                          >
                                            {p.name}
                                          </button>
                                          : {format(p.days[day].sales)}
                                        </div>
                                      ))}
                                      {!sold.length &&
                                        (v.value === 0
                                          ? "Sin ventas registradas (0)"
                                          : v.na
                                            ? "N.A."
                                            : "Sin datos registrados")}
                                    </td>
                                    <td>
                                      {sellers
                                        .filter(
                                          (a) =>
                                            a.sales !== null &&
                                            !a.na &&
                                            a.sales > 0,
                                        )
                                        .map(
                                          (a) =>
                                            `${a.name}: ${a.sales}${a.partial ? " *" : ""}`,
                                        )
                                        .join(" · ") || "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </DetailSection>
                    ),
                    "sheet-advisors": (
                      <DetailSection
                        id={id + "advisors"}
                        stateKey="sheet-advisors"
                        title="Qué asesores vendieron los diplomados de esta hoja"
                        tone="assignments"
                      >
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Asesor</th>
                                <th>Ventas</th>
                                <th>Diplomados vendidos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {people
                                .filter(
                                  (a) =>
                                    a.sales !== null && !a.na && a.sales > 0,
                                )
                                .map((a) => (
                                  <tr key={a.advisorId ?? "__unassigned"}>
                                    <th>{a.name}</th>
                                    <td>
                                      {a.sales}
                                      {a.partial ? " *" : ""}
                                    </td>
                                    <td>
                                      {products
                                        .flatMap((p) => {
                                          const sale = p.advisors.find(
                                            (s) => s.advisorId === a.advisorId,
                                          );
                                          return (sale?.sales ?? 0) > 0
                                            ? [`${p.name}: ${sale!.sales}`]
                                            : [];
                                        })
                                        .join(" · ") || "Sin ventas positivas"}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {!people.some(
                          (a) => a.sales !== null && !a.na && a.sales > 0,
                        ) && <p>No hay ventas atribuidas en este período.</p>}
                      </DetailSection>
                    ),
                    "sheet-data": (
                      <DetailSection
                        id={id + "data"}
                        stateKey="sheet-data"
                        title="Datos de la hoja por país y moneda"
                        tone="products"
                      >
                        <p className="hint">
                          Las ventas son cantidades. Presupuesto, gasto y costos
                          se mantienen separados por moneda. B y G corresponden
                          a los datos automáticos de la hoja; P es el
                          presupuesto registrado.
                        </p>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>País</th>
                                <th>Moneda</th>
                                {sheetMetrics.map((m) => (
                                  <th key={m.key}>
                                    {m.name} ({m.label})
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleBlocks.map((b) => (
                                <tr
                                  key={JSON.stringify([b.country, b.currency])}
                                >
                                  <th>{b.country || "Sin país"}</th>
                                  <td>{b.currency || "Sin moneda"}</td>
                                  {sheetMetrics.map((m) => (
                                    <td key={m.key}>
                                      {format(
                                        totalDetailSummary(
                                          b.products.map((p) => p.sums[m.key]),
                                        ),
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </DetailSection>
                    ),
                  };
                  return (
                    <>
                      <p className="inventory-detail-order-hint">
                        Arrastra ⠿ para cambiar el orden de estas secciones.
                      </p>
                      {layout.custom && (
                        <button type="button" onClick={layout.reset}>
                          Restablecer orden
                        </button>
                      )}
                      {layout.warning && <p role="status">{layout.warning}</p>}
                      <div className="inventory-detail-modules">
                        {layout.order.map((key) => (
                          <InventoryDetailSlot key={key} id={key}>
                            {modules[key]}
                          </InventoryDetailSlot>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </dialog>
        )}
      </VerticalDetailLayout>
    </DetailSections>
  );
}
function SheetSalesBars({
  products,
  onSelect,
}: {
  products: SheetSalesProduct[];
  onSelect: (p: SheetSalesProduct) => void;
}) {
  if (!products.length) return null;
  const max = Math.max(1, ...products.map((p) => p.sales.value ?? 0)),
    width = Math.max(420, products.length * 85 + 60),
    step = (width - 60) / products.length;
  return (
    <div
      className="inventory-sales-chart-scroll sheet-sales-comparison"
      tabIndex={0}
      aria-label="Comparativo vertical de ventas por diplomado"
    >
      <svg
        width={width}
        height="250"
        viewBox={`0 0 ${width} 250`}
        role="img"
        aria-label="Ventas de cada diplomado en el período"
      >
        <line
          x1="35"
          y1="175"
          x2={width - 8}
          y2="175"
          className="inventory-sales-chart-grid"
        />
        <text x="5" y="15">
          Ventas
        </text>
        <text x="29" y="179" textAnchor="end">
          0
        </text>
        {products.map((p, i) => {
          const x = 45 + i * step + step / 2,
            h = p.sales.value === null ? 0 : (p.sales.value / max) * 140;
          return (
            <g
              key={p.aliasId}
              role="button"
              tabIndex={0}
              aria-label={`${p.name}: ${format(p.sales)} ventas; ver evolución`}
              onClick={() => onSelect(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(p);
                }
              }}
            >
              <title>
                {p.name}: {format(p.sales)} ventas
              </title>
              <rect
                x={x - 17}
                y={175 - h}
                width="34"
                height={Math.max(2, h)}
                rx="2"
                fill={
                  p.sales.value === null
                    ? "var(--muted)"
                    : p.sales.value === 0
                      ? "#ac7040"
                      : "var(--accent)"
                }
              />
              <text x={x} y={170 - h} textAnchor="middle">
                {format(p.sales)}
              </text>
              <text x={x - 12} y="194" transform={`rotate(27 ${x - 12} 194)`}>
                {p.name.length > 18 ? p.name.slice(0, 16) + "…" : p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
