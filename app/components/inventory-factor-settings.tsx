"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { defaultInventoryLimits } from "../../lib/meta-ads/inventory-factor-policy";
import type { InventorySheetActivationDirectory } from "../../lib/meta-ads/inventory-sheet-activation";
import { InventoryStatusLabel } from "./inventory-status-label";
export function InventoryFactorSettings({
  listId,
  directory,
  onSaved,
  onClose,
}: {
  listId: string;
  directory: InventorySheetActivationDirectory;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [limits, setLimits] = useState(directory.limits.map(String)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    pending = useRef(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="trial-dialog inventory-factor-settings"
      aria-label="Definir límites del factor"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <div>
          <h2>Límites del factor</h2>
          <small>Presupuesto máximo acumulado según tus ventas</small>
        </div>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      <p className="inventory-factor-formula">
        FX = presupuesto acumulado ÷ límite × 100
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current || !directory.canEdit) return;
          pending.current = true;
          setBusy(true);
          setError("");
          let committed = false;
          try {
            await api("meta-ads/inventory/sheet-activation/limits", "PUT", {
              listId,
              revision: directory.revision,
              limits: limits.map(Number),
            });
            committed = true;
            await onSaved();
            onClose();
          } catch (e) {
            setError(
              (committed
                ? "Los límites se guardaron. Actualiza la vista. "
                : "") + (e as Error).message,
            );
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <div className="inventory-factor-limits-scroll">
          <table>
            <thead>
              <tr>
                <th>Ventas</th>
                <th>Límite acumulado · S/</th>
              </tr>
            </thead>
            <tbody>
              {limits.map((value, sales) => (
                <tr key={sales}>
                  <td>
                    {sales} {sales === 1 ? "venta" : "ventas"}
                  </td>
                  <td>
                    <input
                      type="number"
                      aria-label={`Límite para ${sales} ventas`}
                      required
                      min="0.01"
                      max="10000000"
                      step="0.01"
                      value={value}
                      disabled={busy || !directory.canEdit}
                      onChange={(e) =>
                        setLimits((current) =>
                          current.map((n, i) =>
                            i === sales ? e.target.value : n,
                          ),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {directory.canEdit && (
          <div className="row">
            <button
              type="button"
              disabled={busy || limits.length >= 101}
              onClick={() =>
                setLimits((current) => [
                  ...current,
                  String(current.length * 50),
                ])
              }
            >
              + Fila
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setLimits(defaultInventoryLimits().map(String))}
            >
              Valores iniciales
            </button>
          </div>
        )}
        <p className="trial-help">
          Se aplican a todas las hojas de este Inventario. Para cantidades de
          ventas fuera de la tabla: S/50 por venta. Al alcanzar el 100% se
          indica «Revisar»; con cero ventas, «Alerta grave». Los datos
          incompletos quedan pendientes.
        </p>
        <div className="inventory-factor-status-guide">
          {(["WITHIN", "TESTING", "ALERT", "CRITICAL", "PENDING"] as const).map(
            (status) => (
              <span key={status}>
                <InventoryStatusLabel status={status} />
              </span>
            ),
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        <footer>
          {directory.canEdit && (
            <button type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar límites"}
            </button>
          )}
          <button type="button" disabled={busy} onClick={onClose}>
            {directory.canEdit ? "Cancelar" : "Cerrar"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
