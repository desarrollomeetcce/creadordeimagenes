"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  inventoryAdvisorSales,
  type InventorySalesEntry,
} from "../../lib/meta-ads/inventory-advisor-sales";
import { readRangePages } from "./workbook-range-request";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { InventorySalesChart } from "./inventory-sales-chart";
import { DetailSection } from "./detail-section";
import { SheetSearchSelect } from "./sheet-search-select";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
export function InventoryAdvisorSales({
  tableId,
  aliasId,
  country,
  since,
  until,
  sectionId,
  refreshKey,
  children,
}: {
  children?: (sections: { sales: ReactNode; dates: ReactNode }) => ReactNode;
  tableId: string;
  aliasId: string;
  country: string;
  since: string;
  until: string;
  sectionId: string;
  refreshKey: number;
}) {
  const context = JSON.stringify([tableId, aliasId, country, since, until]);
  const [result, setResult] = useState<{
      context: string;
      records: InventorySalesEntry[];
    } | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("__all"),
    [page, setPage] = useState(0),
    [showAllDates, setShowAllDates] = useState(false);
  useEffect(() => {
    setSelected("__all");
    setPage(0);
    setShowAllDates(false);
  }, [context]);
  useEffect(() => {
    let active = true,
      inFlight = false;
    setError("");
    const load = async () => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const pages = await readRangePages<{ daily: InventorySalesEntry[] }>(
          "meta-ads/advisors/item-analysis",
          { tableId, aliasId, country, since, until },
          () => active,
        );
        if (active) {
          setResult({ context, records: pages.flatMap((p) => p.daily ?? []) });
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron consultar las ventas por asesor.",
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
  }, [context, refreshKey]);
  const current = result?.context === context ? result.records : null;
  const report = useMemo(() => inventoryAdvisorSales(current ?? []), [current]),
    matches = (id: string | null) =>
      selected === "__all" || (id ?? "__unassigned") === selected;
  const people = report.people.filter(
      (p) => p.sales !== null && matches(p.advisorId),
    ),
    daily = report.daily.filter(
      (p) =>
        matches(p.advisorId) && (showAllDates || (!p.na && (p.sales ?? 0) > 0)),
    );
  const known = people.filter((p) => p.sales !== null),
    total = known.length ? known.reduce((s, p) => s + p.sales!, 0) : null;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(daily.length / 50) - 1),
  );
  const sales = (
    <DetailSection
      id={sectionId + "advisor-sales"}
      stateKey="inventory-advisor-sales"
      title="Quiénes vendieron este diplomado"
      tone="sales"
    >
      <p className="hint">
        {since} — {until}. Ventas registradas por asesor, aunque no estuviera
        asignado o el diplomado estuviera desactivado.
      </p>
      {error && <p role="alert">{error}</p>}
      {!current && !error && (
        <p role="status">Consultando ventas por asesor…</p>
      )}
      {current && (
        <>
          <div className="row inventory-sales-controls">
            <SheetSearchSelect
              label="Asesores de las ventas del inventario"
              value={selected}
              options={[
                { value: "__all", label: "Todos los asesores" },
                ...report.people
                  .filter((p) => p.sales !== null)
                  .map((p) => ({
                    value: p.advisorId ?? "__unassigned",
                    label: p.name,
                  })),
              ]}
              onSelect={(v) => {
                setSelected(v);
                setPage(0);
              }}
            />
            <strong>Total de ventas: {total ?? "—"}</strong>
          </div>
          <InventorySalesChart
            key={context}
            entries={report.daily}
            people={report.people}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              setPage(0);
            }}
          />
          {!people.length && <p>No hay ventas registradas en este período.</p>}
          {total === 0 && (
            <p>No hubo ventas registradas en esta selección (0).</p>
          )}
          <p className="hint">
            Pulsa una barra para ver las fechas de ese asesor. Elige Todos los
            asesores para comparar. * cobertura parcial; — sin dato; N.A. no
            suma.
          </p>
        </>
      )}
    </DetailSection>
  );
  const dates = (
    <DetailSection
      id={sectionId + "sales-dates"}
      stateKey="inventory-sales-dates"
      title="Qué asesor vendió cada día"
      tone="daily"
    >
      <label className="inventory-sales-show-empty">
        <input
          type="checkbox"
          checked={showAllDates}
          onChange={(e) => {
            setShowAllDates(e.target.checked);
            setPage(0);
          }}
        />{" "}
        Mostrar también registros con cero o N.A.
      </label>
      <p className="hint">
        {selected === "__all"
          ? "Todos los asesores"
          : report.people.find(
              (p) => (p.advisorId ?? "__unassigned") === selected,
            )?.name}{" "}
        · Más reciente primero.
      </p>
      {current && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Asesor</th>
                <th>País</th>
                <th>Ventas (V)</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {daily.slice(currentPage * 50, currentPage * 50 + 50).map((r) => (
                <tr
                  key={JSON.stringify([r.day, r.country, r.advisorId])}
                  data-inventory-sale-date={r.day}
                  data-inventory-sale-advisor={r.advisorId ?? ""}
                >
                  <th>{r.day}</th>
                  <td>{r.name}</td>
                  <td>{r.country || "Sin país"}</td>
                  <td>
                    {r.sales ?? (r.na ? "N.A." : "—")}
                    {r.partial ? " *" : ""}
                  </td>
                  <td>
                    <a
                      className="button alias-period-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={periodTableUrl({
                        tableId,
                        aliasId,
                        country: r.country,
                        since: r.day,
                        until: r.day,
                      })}
                    >
                      Ir al día ↗
                    </a>
                  </td>
                </tr>
              ))}
              {!daily.length && (
                <tr>
                  <td colSpan={5}>
                    No hay ventas registradas en estas fechas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {daily.length > 50 && (
        <div className="row">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            ← Anterior
          </button>
          <span>
            Página {currentPage + 1} de {Math.ceil(daily.length / 50)}
          </span>
          <button
            type="button"
            disabled={(currentPage + 1) * 50 >= daily.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </DetailSection>
  );
  return children ? (
    children({ sales, dates })
  ) : (
    <>
      {sales}
      {dates}
    </>
  );
}
