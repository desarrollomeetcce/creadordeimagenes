"use client";
import { InventoryCacStatus as InventoryStatusLabel } from "./inventory-cac-status";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { trialStatusNames } from "../../lib/meta-ads/inventory-trial-policy";
import { countryName } from "../../lib/meta-ads/countries";
import type { InventorySheetActivationReport } from "../../lib/meta-ads/inventory-sheet-activation";
export function InventorySheetHistory({
  listId,
  tableId,
  sheetName,
  name,
  onClose,
}: {
  listId: string;
  tableId: string;
  sheetName: string;
  name: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDialogElement>(null),
    [data, setData] = useState<InventorySheetActivationReport | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    let alive = true;
    void api(
      "meta-ads/inventory/sheet-activation/report?" +
        new URLSearchParams({
          listId,
          tableIds: tableId.split(":")[0],
          ...(tableId.includes(":") ? { country: tableId.split(":")[1] } : {}),
          historyName: name,
          historyTableId: tableId.split(":")[0],
        }),
    )
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [listId, tableId, name]);
  const history = data?.rows.find((r) => r.name === name)?.history ?? [],
    date = (s: string | null) =>
      s
        ? new Intl.DateTimeFormat("es-PE", {
            timeZone: "America/Lima",
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(s))
        : "Inicio no registrado";
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-activation-history"
      data-expanded={expanded || undefined}
      aria-label="Historial de activación del diplomado"
      onCancel={onClose}
    >
      <header>
        <div>
          <h2>{name}</h2>
          <small>{sheetName} · Hora de Lima</small>
        </div>
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
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">Cargando historial…</p>
      ) : !history.length ? (
        <p>Aún no hay períodos de activación registrados.</p>
      ) : (
        <div className="trial-daily-scroll">
          <table>
            <thead>
              <tr>
                <th>Desde</th>
                <th>Hasta</th>
                <th title="Ventas desde la activación hasta la siguiente, aunque ya esté apagado">
                  Ventas hasta
                </th>
                <th>País</th>
                <th>Días</th>
                <th>Ventas</th>
                <th>Presupuesto · S/</th>
                <th>CAC · P/V</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td>{date(h.since)}</td>
                  <td>{h.until ? date(h.until) : "Presente"}</td>
                  <td>{h.salesUntil ?? "—"}</td>
                  <td>{countryName(h.country)}</td>
                  <td>{h.days ?? "—"}</td>
                  <td>{h.sales ?? "—"}</td>
                  <td>{h.budget === null ? "—" : h.budget.toFixed(2)}</td>
                  <td>
                    {(h.cac?.budget.assessment ?? h.assessment).usage === null
                      ? "—"
                      : new Intl.NumberFormat("es-PE", {
                          style: "currency",
                          currency: "PEN",
                          maximumFractionDigits: 1,
                        }).format(
                          (h.cac?.budget.assessment ?? h.assessment).usage!,
                        )}
                    {!h.complete &&
                    (h.cac?.budget.assessment ?? h.assessment).usage !== null
                      ? " *"
                      : ""}
                  </td>
                  <td>
                    <span
                      className={
                        "trial-status inventory-status-with-dot trial-" +
                        (h.cac?.budget.assessment ?? h.assessment).status
                      }
                    >
                      <InventoryStatusLabel
                        status={
                          (h.cac?.budget.assessment ?? h.assessment).status
                        }
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="trial-help">
        CAC del período de cada activación: presupuesto entre ventas. N/A se
        excluye y cero cuenta como registro. Los importes permanecen en su
        fuente. Las listas usan hoy y los 13 días anteriores; el detalle permite
        otras fechas.
      </p>
    </dialog>
  );
}
