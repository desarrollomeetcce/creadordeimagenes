"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import type {
  InventorySheetActivationReport,
  SheetInterval,
} from "../../lib/meta-ads/inventory-sheet-activation";
import { InventoryStatusLabel } from "./inventory-status-label";
import { EffectivenessHistory } from "./effectiveness-history";
import { limaToday } from "./date-range";
const money = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(v);
const factor = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("es-PE", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(v);
const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Inicio no registrado";
function Status({ period }: { period?: SheetInterval }) {
  return period ? (
    <span
      className={
        "trial-status inventory-status-with-dot trial-" +
        period.assessment.status
      }
    >
      <InventoryStatusLabel status={period.assessment.status} />
    </span>
  ) : (
    <>Sin historial</>
  );
}
export function InventoryDiplomaObservations({
  listId,
  name,
  columns,
  initialColumn,
  onClose,
}: {
  listId: string;
  name: string;
  columns: { value: string; label: string }[];
  initialColumn?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false),
    [data, setData] = useState<InventorySheetActivationReport["rows"] | null>(
      null,
    ),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(
      initialColumn ?? columns[0]?.value ?? "",
    ),
    [detail, setDetail] = useState(false),
    [page, setPage] = useState(0);
  const columnKey = columns.map((c) => c.value).join(",");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    const tables = [
      ...new Set(
        columnKey
          .split(",")
          .filter(Boolean)
          .map((id) => id.split(":")[0]),
      ),
    ];
    // Sequential authorized batches avoid an unbounded request fan-out.
    void (async () => {
      const rows: InventorySheetActivationReport["rows"] = [];
      for (let i = 0; i < tables.length; i += 20) {
        const report: InventorySheetActivationReport = await api(
          "meta-ads/inventory/sheet-activation/report?" +
            new URLSearchParams({
              listId,
              tableIds: tables.slice(i, i + 20).join(","),
              byCountry: "true",
              historyName: name,
            }),
        );
        if (!alive) return;
        rows.push(
          ...report.rows.filter(
            (r) => categoryKey(r.name) === categoryKey(name),
          ),
        );
      }
      if (alive) setData(rows);
    })().catch((e) => {
      if (alive) setError(e.message);
    });
    return () => {
      alive = false;
    };
  }, [listId, name, columnKey]);
  const rows = data ?? [],
    current = rows.find((r) => r.tableId + ":" + r.country === selected),
    history = current?.history ?? [];
  const label = (r: (typeof rows)[number]) =>
    columns.find((c) => c.value === r.tableId + ":" + r.country)?.label ??
    r.country ??
    r.tableId;
  const warnings = history.filter(
    (h) => h.complete && ["ALERT", "CRITICAL"].includes(h.assessment.status),
  ).length;
  const today = limaToday();
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-observations"
      data-expanded={expanded || undefined}
      aria-label={"Antecedentes de " + name}
      onCancel={onClose}
    >
      <header>
        <div>
          <h2>{name}</h2>
          <small>Antecedentes por hoja y país · Hora de Lima</small>
        </div>
        <div className="row">
          <button
            type="button"
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "↙ Restaurar" : "⛶ Maximizar"}
          </button>
          <button type="button" className="ui-close-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">Consultando resultados anteriores…</p>
      ) : (
        <>
          <p className="inventory-observation-note">
            Selecciona un país para revisar sus períodos antes de elegir. Cada
            fila conserva la fuente; las hojas no se suman entre sí.
          </p>
          <div className="table-scroll">
            <table className="inventory-observation-summary">
              <thead>
                <tr>
                  <th>Hoja · País</th>
                  <th>Períodos registrados</th>
                  <th>Ventas</th>
                  <th>Días</th>
                  <th>Pres. S/</th>
                  <th>G. Meta S/</th>
                  <th>FX</th>
                  <th>FX Meta</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const h = r.history?.[0],
                    key = r.tableId + ":" + r.country;
                  return (
                    <tr key={key} data-selected={selected === key || undefined}>
                      <td>
                        <button
                          type="button"
                          aria-pressed={selected === key}
                          onClick={() => {
                            setSelected(key);
                            setPage(0);
                          }}
                        >
                          {label(r)}
                        </button>
                      </td>
                      <td>{r.history?.length ?? 0}</td>
                      <td>{h?.sales ?? "—"}</td>
                      <td>{h?.days ?? "—"}</td>
                      <td>{money(h?.budget)}</td>
                      <td>
                        {money(h?.metaSpend)}
                        {h && !h.metaComplete && h.metaSpend !== null
                          ? " *"
                          : ""}
                      </td>
                      <td>{factor(h?.assessment.usage)}</td>
                      <td>{factor(h?.metaAssessment?.usage)}</td>
                      <td>
                        <Status period={h} />
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={9}>
                      No hay activaciones registradas para este diplomado en
                      estas hojas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {current && (
            <>
              <div
                className={
                  "inventory-observation-note " + (warnings ? "warning" : "")
                }
              >
                <strong>
                  {warnings
                    ? `${warnings} período(s) con presupuesto por encima del límite.`
                    : history.length
                      ? "Revisa los resultados y las fechas de cada período."
                      : "Sin períodos registrados en este país."}
                </strong>
                <span>
                  {" "}
                  Ventas desde la activación hasta la siguiente o hasta hoy,
                  incluyendo pagos después del apagado. Días y gastos cubren
                  solo el tiempo activo. Un guion indica un dato desconocido.
                </span>
                <button
                  type="button"
                  disabled={!current.targets[0]}
                  onClick={() => setDetail(true)}
                >
                  Ver detalle diario ↗
                </button>
              </div>
              <h3>Historial de activaciones · {label(current)}</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Desde</th>
                      <th>Hasta</th>
                      <th>Ventas hasta</th>
                      <th>Horas activas</th>
                      <th>Días</th>
                      <th>Ventas</th>
                      <th>Pres. S/</th>
                      <th>G. Meta S/</th>
                      <th>FX</th>
                      <th>FX Meta</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(page * 10, page * 10 + 10).map((h, i) => (
                      <tr key={i}>
                        <td>{date(h.since)}</td>
                        <td>{h.until ? date(h.until) : "En curso"}</td>
                        <td>{h.salesUntil ?? "—"}</td>
                        <td>{money(h.hours)}</td>
                        <td>{h.days ?? "—"}</td>
                        <td>{h.sales ?? "—"}</td>
                        <td>{money(h.budget)}</td>
                        <td>
                          {money(h.metaSpend)}
                          {!h.metaComplete && h.metaSpend !== null ? " *" : ""}
                        </td>
                        <td>
                          {factor(h.assessment.usage)}
                          {!h.complete && h.assessment.usage !== null
                            ? " *"
                            : ""}
                        </td>
                        <td>{factor(h.metaAssessment?.usage)}</td>
                        <td>
                          <Status period={h} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {history.length > 10 && (
                <div className="row">
                  <button
                    type="button"
                    disabled={!page}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    {page + 1} / {Math.ceil(history.length / 10)}
                  </span>
                  <button
                    type="button"
                    disabled={(page + 1) * 10 >= history.length}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
          <small>
            Presupuesto y G. Meta se muestran en soles; G. Meta usa únicamente
            gasto recibido de Meta. FX Meta es una referencia adicional con los
            mismos límites, no cambia el estado principal. Las cifras son
            diarias, sin atribución por hora. Los períodos que comparten un día
            o tienen datos faltantes quedan pendientes (*). Se consultan hasta
            366 días de métricas y 100 períodos por país; fechas más antiguas
            conservan sus registros. Se aplican los límites vigentes.
          </small>
        </>
      )}
      {detail && current?.targets[0] && (
        <EffectivenessHistory
          autoOpen
          aliasId={current.targets[0].aliasId}
          tableId={current.tableId}
          country={current.country!}
          name={name}
          initialSince={new Date(Date.parse(today) - 29 * 86400000)
            .toISOString()
            .slice(0, 10)}
          initialUntil={today}
          onPeriod={() => {}}
          onClose={() => setDetail(false)}
        />
      )}
    </dialog>
  );
}
