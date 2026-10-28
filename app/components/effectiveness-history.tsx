"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
import { readRangePages } from "./workbook-range-request";
import { useReportDayPages } from "./report-day-pages";
import {
  sheetMetrics,
  type SheetMetric,
} from "../../lib/meta-ads/period-summary";
import { MetaDateRange } from "./meta-date-range";
import { DetailSection, DetailSections } from "./detail-section";
import {
  InventoryDetailLayout,
  InventoryDetailSlot,
} from "./inventory-detail-layout";
import type { InventoryDetailModuleId } from "../../lib/meta-ads/inventory-detail-order";
import { DetailStickyHeader } from "./detail-sticky-header";
import { DetailNavigation } from "./detail-navigation";
import { MetaDailyChart } from "./meta-daily-chart";
import type { ActivePeriod } from "../../lib/meta-ads/active-periods";
import { InventoryAdvisorSales } from "./inventory-advisor-sales";
const inventoryTargetModules: Record<string, InventoryDetailModuleId> = {
  chart: "chart",
  days: "days",
  "sales-dates": "inventory-sales-dates",
  "advisor-sales": "inventory-advisor-sales",
  activity: "activity",
};
type Cell = Record<SheetMetric, number | null> & {
  na: SheetMetric[];
  fxMissing: boolean;
};
type Detail = {
  name: string;
  tableName: string;
  currency: string;
  active: boolean;
  days: Record<string, Cell>;
  activePeriods: ActivePeriod[];
  asOf: string;
};
const stamp = (s: string) =>
  new Date(s).toLocaleString("es-PE", { timeZone: "America/Lima" });
export function EffectivenessHistory({
  aliasId,
  tableId,
  country,
  name,
  initialSince,
  initialUntil,
  onPeriod,
}: {
  aliasId: string;
  tableId: string;
  country: string;
  name: string;
  initialSince: string;
  initialUntil: string;
  onPeriod: (period: ActivePeriod) => void;
}) {
  const id = useId(),
    pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [since, setSince] = useState(initialSince),
    [until, setUntil] = useState(initialUntil),
    [result, setData] = useState<Detail | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [bars, setBars] = useState<SheetMetric>("sales"),
    [line, setLine] = useState<SheetMetric>("budget"),
    [page, setPage] = useState(0),
    [reload, setReload] = useState(0),
    [expanded, setExpanded] = useState(false);
  const [loadedQuery, setLoadedQuery] = useState("");
  const query =
      "meta-ads/effectiveness/detail?" +
      new URLSearchParams({ aliasId, country, since, until }),
    valid =
      since <= until &&
      (Date.parse(until) - Date.parse(since)) / 86400000 < 3660;
  const data = loadedQuery === query ? result : null;
  useEffect(() => {
    if (!open || !valid) return;
    let active = true;
    setLoading(true);
    setData(null);
    setMessage("");
    let version = 0;
    let inFlight = false;
    const load = () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      const request = ++version;
      void readRangePages<Detail>(
        "meta-ads/effectiveness/detail",
        { aliasId, country, since, until },
        () => active && request === version,
      )
        .then((pages) => {
          const v: Detail = {
            ...pages[0],
            days: Object.assign({}, ...pages.map((p) => p.days)),
          };
          if (active && request === version) {
            setData(v);
            setLoadedQuery(query);
          }
        })
        .catch((e) => {
          if (active && request === version) setMessage(e.message);
        })
        .finally(() => {
          inFlight = false;
          if (active && request === version) setLoading(false);
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
  }, [query, open, valid, reload]);
  const pageCount = Math.max(
      1,
      Math.ceil((data?.activePeriods.length ?? 0) / 5),
    ),
    currentPage = Math.min(page, pageCount - 1);
  const dates: string[] = [];
  if (valid)
    for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
      dates.push(new Date(d).toISOString().slice(0, 10));
  const { visibleDays, navigation } = useReportDayPages(dates);
  const metric = (key: SheetMetric) => sheetMetrics.find((m) => m.key === key)!,
    bar = metric(bars),
    dot = metric(line),
    value = (day: string, key: SheetMetric) =>
      data?.days[day]?.na.includes(key)
        ? null
        : (data?.days[day]?.[key] ?? null);
  const chart = dates.map((day) => ({
    day,
    results: value(day, bars),
    cost: value(day, line),
    spend: null,
  }));
  return (
    <DetailSections>
      <button
        type="button"
        className="sheet-history-trigger"
        aria-label={`Detalle de ${name} ${country || "sin país"}`}
        disabled={!country}
        title="Ver estados por fecha y evolución de parámetros"
        popoverTarget={id}
        onClick={() => {
          setSince(initialSince);
          setUntil(initialUntil);
          setPage(0);
          setExpanded(false);
        }}
      >
        ⓘ
      </button>
      <div
        id={id}
        ref={pop}
        popover="auto"
        className="sheet-state-history alias-state-detail"
        aria-label={`Detalle del inventario ${name} ${country}`}
        role="dialog"
        data-expanded={expanded || undefined}
        onToggle={(e) => {
          setOpen(e.newState === "open");
          if (e.newState === "open") e.currentTarget.scrollTop = 0;
        }}
      >
        {open && (
          <InventoryDetailLayout>
            {(layout) => (
              <>
                <DetailStickyHeader>
                  <header className="row">
                    <strong>
                      {name} · {country}
                    </strong>
                  </header>
                  <DetailNavigation
                    closeLabel="Cerrar"
                    expanded={expanded}
                    onToggleExpanded={() => setExpanded((v) => !v)}
                    onClose={() => pop.current?.hidePopover()}
                    items={[
                      {
                        target: id + "activity",
                        label: "Activaciones",
                        tone: "activity",
                      },
                      {
                        target: id + "advisor-sales",
                        label: "Ventas por asesor",
                        tone: "sales",
                      },
                      {
                        target: id + "sales-dates",
                        label: "Fechas de ventas",
                        tone: "daily",
                      },
                      {
                        target: id + "chart",
                        label: "Estadísticas",
                        tone: "parameters",
                      },
                      {
                        target: id + "days",
                        label: "Histórico por día",
                        tone: "daily",
                      },
                    ].sort(
                      (a, b) =>
                        layout.order.indexOf(
                          inventoryTargetModules[a.target.slice(id.length)],
                        ) -
                        layout.order.indexOf(
                          inventoryTargetModules[b.target.slice(id.length)],
                        ),
                    )}
                    disabled={!data}
                  />
                  <div className="row alias-detail-controls">
                    <MetaDateRange
                      maxDays={3660}
                      from={since}
                      to={until}
                      onChange={(a, b) => {
                        setSince(a);
                        setUntil(b);
                        setPage(0);
                      }}
                    />
                    <button
                      type="button"
                      disabled={loading || !valid}
                      onClick={() => setReload((v) => v + 1)}
                    >
                      Actualizar detalle
                    </button>
                  </div>
                  <p className="hint">
                    Ventas y parámetros del{" "}
                    {since === until ? since : `${since} — ${until}`} · Lima.
                    Cada cifra corresponde a su fecha, aunque se registre
                    después.
                  </p>
                  {data && (
                    <p>
                      Estado actual:{" "}
                      <b>{data.active ? "Activado" : "Desactivado"}</b>.
                      Historial de Efectividad de este inventario y país; no
                      cambia estados en Meta Ads.
                    </p>
                  )}
                </DetailStickyHeader>
                {!valid && (
                  <p role="alert">
                    Elige un período válido de hasta diez años.
                  </p>
                )}
                <p className="inventory-detail-order-hint">
                  Arrastra ⠿ para ordenar. Se aplica a los detalles de todos los
                  diplomados en este navegador.
                </p>
                {layout.custom && (
                  <button type="button" onClick={layout.reset}>
                    Restablecer orden
                  </button>
                )}
                {layout.warning && <p role="status">{layout.warning}</p>}
                {message && <p role="alert">{message}</p>}
                {loading && <p role="status">Cargando detalle…</p>}
                {data && (
                  <>
                    <InventoryAdvisorSales
                      tableId={tableId}
                      aliasId={aliasId}
                      country={country}
                      since={since}
                      until={until}
                      sectionId={id}
                      refreshKey={reload}
                    >
                      {(salesSections) => {
                        const sections: Record<
                          InventoryDetailModuleId,
                          ReactNode
                        > = {
                          activity: (
                            <DetailSection
                              id={id + "activity"}
                              stateKey="activity"
                              title="Últimas activaciones"
                              tone="activity"
                            >
                              {data.activePeriods.length ? (
                                <ol className="alias-active-periods">
                                  {data.activePeriods
                                    .slice(currentPage * 5, currentPage * 5 + 5)
                                    .map((period) => (
                                      <li key={period.id}>
                                        <div>
                                          <strong
                                            title={`Activado el ${stamp(period.from)} (Lima)`}
                                          >
                                            {period.until
                                              ? `Del ${new Date(period.since + "T12:00:00Z").toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "America/Lima" })} al ${new Date(period.through + "T12:00:00Z").toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "America/Lima" })}`
                                              : `Desde el ${new Date(period.since + "T12:00:00Z").toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "America/Lima" })} hasta la fecha`}
                                          </strong>
                                          <small>
                                            {period.until
                                              ? `Se desactivó el ${stamp(period.until)} (Lima).`
                                              : `Activo al ${stamp(data.asOf)} (Lima).`}
                                          </small>
                                        </div>
                                        <a
                                          className="button alias-period-link"
                                          href={periodTableUrl({
                                            tableId,
                                            aliasId,
                                            country,
                                            since: period.since,
                                            until: period.through,
                                          })}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title="Abrir los datos del período en una nueva ventana"
                                          aria-label={`Ir al período activo ${period.since} — ${period.through}`}
                                        >
                                          Ir al período
                                        </a>
                                      </li>
                                    ))}
                                </ol>
                              ) : (
                                <p>
                                  No hay períodos activos registrados. Se
                                  registrarán automáticamente cuando actives
                                  esta fila.
                                </p>
                              )}
                              {data.activePeriods.length > 5 && (
                                <nav
                                  className="alias-period-pagination"
                                  aria-label="Páginas de activaciones"
                                >
                                  <span>
                                    {currentPage * 5 + 1}–
                                    {Math.min(
                                      currentPage * 5 + 5,
                                      data.activePeriods.length,
                                    )}{" "}
                                    de {data.activePeriods.length} activaciones
                                    · Página {currentPage + 1} de {pageCount}
                                  </span>
                                  <div className="row">
                                    <button
                                      disabled={currentPage === 0}
                                      onClick={() => setPage(currentPage - 1)}
                                    >
                                      Más recientes
                                    </button>
                                    <button
                                      disabled={currentPage + 1 >= pageCount}
                                      onClick={() => setPage(currentPage + 1)}
                                    >
                                      Anteriores
                                    </button>
                                  </div>
                                </nav>
                              )}
                            </DetailSection>
                          ),
                          chart: (
                            <DetailSection
                              id={id + "chart"}
                              stateKey="chart"
                              title="Evolución de parámetros"
                              tone="parameters"
                            >
                              <div className="row alias-detail-controls">
                                <label>
                                  1 · Barras
                                  <select
                                    aria-label="Barras del detalle del inventario"
                                    value={bars}
                                    onChange={(e) => {
                                      const v = e.target.value as SheetMetric;
                                      setBars(v);
                                      if (v === line)
                                        setLine(
                                          v === "sales" ? "budget" : "sales",
                                        );
                                    }}
                                  >
                                    {sheetMetrics.map((m) => (
                                      <option key={m.key} value={m.key}>
                                        {m.key === "base" ? "Base" : m.name} (
                                        {m.label})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  2 · Línea con puntos
                                  <select
                                    aria-label="Línea del detalle del inventario"
                                    value={line}
                                    onChange={(e) => {
                                      const v = e.target.value as SheetMetric;
                                      setLine(v);
                                      if (v === bars)
                                        setBars(
                                          v === "sales" ? "budget" : "sales",
                                        );
                                    }}
                                  >
                                    {sheetMetrics.map((m) => (
                                      <option key={m.key} value={m.key}>
                                        {m.key === "base" ? "Base" : m.name} (
                                        {m.label})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <MetaDailyChart
                                rows={chart}
                                bars="results"
                                line="cost"
                                currency={data.currency || "PEN"}
                                metricName="Ventas"
                                since={since}
                                until={until}
                                labels={{
                                  results: `${bar.name} (${bar.label})`,
                                  cost: `${dot.name} (${dot.label})`,
                                }}
                                units={{
                                  results:
                                    bar.money && data.currency
                                      ? "currency"
                                      : "count",
                                  cost:
                                    dot.money && data.currency
                                      ? "currency"
                                      : "count",
                                }}
                              />
                            </DetailSection>
                          ),
                          days: (
                            <DetailSection
                              id={id + "days"}
                              stateKey="days"
                              title="Histórico por día"
                              tone="daily"
                            >
                              {navigation}
                              <div className="table-scroll">
                                <table className="alias-parameter-days">
                                  <thead>
                                    <tr>
                                      <th>Fecha</th>
                                      {sheetMetrics.map((m) => (
                                        <th key={m.key} title={m.name}>
                                          {m.label}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {visibleDays.map((day) => (
                                      <tr key={day}>
                                        <th>{day}</th>
                                        {sheetMetrics.map((m) => (
                                          <td
                                            key={m.key}
                                            data-na={
                                              data.days[day]?.na.includes(
                                                m.key,
                                              ) || undefined
                                            }
                                          >
                                            {data.days[day]?.na.includes(m.key)
                                              ? "N.A."
                                              : value(day, m.key) === null
                                                ? "—"
                                                : new Intl.NumberFormat(
                                                    "es-PE",
                                                    {
                                                      maximumFractionDigits:
                                                        m.money ? 2 : 0,
                                                    },
                                                  ).format(value(day, m.key)!)}
                                            {m.money &&
                                            value(day, m.key) !== null &&
                                            data.currency
                                              ? " " + data.currency
                                              : ""}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <p className="hint">
                                Los parámetros corresponden a los datos actuales
                                guardados por día; el historial de estados
                                conserva las fechas reales de cada cambio. N.A.
                                y los vacíos no se convierten en cero.
                              </p>
                            </DetailSection>
                          ),
                          "inventory-advisor-sales": salesSections.sales,
                          "inventory-sales-dates": salesSections.dates,
                        };
                        return (
                          <div className="inventory-detail-modules">
                            {layout.order.map((key) => (
                              <InventoryDetailSlot key={key} id={key}>
                                {sections[key]}
                              </InventoryDetailSlot>
                            ))}
                          </div>
                        );
                      }}
                    </InventoryAdvisorSales>
                  </>
                )}
              </>
            )}
          </InventoryDetailLayout>
        )}
      </div>
    </DetailSections>
  );
}
