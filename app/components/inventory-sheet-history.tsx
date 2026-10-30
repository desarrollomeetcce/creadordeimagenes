"use client";
import { InventoryStatusLabel } from "./inventory-status-label";
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
      aria-label="Historial de activación del diplomado"
      onCancel={onClose}
    >
      <header>
        <div>
          <h2>{name}</h2>
          <small>{sheetName} · Hora de Lima</small>
        </div>
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
                <th>País</th>
                <th>Días</th>
                <th>Ventas</th>
                <th>Presupuesto · S/</th>
                <th>FX</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td>{date(h.since)}</td>
                  <td>{h.until ? date(h.until) : "Presente"}</td>
                  <td>{countryName(h.country)}</td>
                  <td>{h.days ?? "—"}</td>
                  <td>{h.sales ?? "—"}</td>
                  <td>{h.budget === null ? "—" : h.budget.toFixed(2)}</td>
                  <td>
                    {h.assessment.usage === null
                      ? "—"
                      : new Intl.NumberFormat("es-PE", {
                          style: "percent",
                          maximumFractionDigits: 1,
                        }).format(h.assessment.usage)}
                    {!h.complete && h.assessment.usage !== null ? " *" : ""}
                  </td>
                  <td>
                    <span
                      className={
                        "trial-status inventory-status-with-dot trial-" +
                        h.assessment.status
                      }
                    >
                      <InventoryStatusLabel status={h.assessment.status} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="trial-help">
        El FX usa los límites vigentes. Las fechas provienen del registro de
        activaciones. Ventas y presupuesto se registran por día; no se atribuyen
        por hora. Si el inicio no se registró o faltan datos, FX y estado quedan
        pendientes. Se consultan hasta los últimos 366 días de métricas.
      </p>
    </dialog>
  );
}
