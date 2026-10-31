"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import {
  defaultCacRules,
  cacStatusNames,
} from "../../lib/meta-ads/inventory-cac-policy";
import type { InventorySheetActivationDirectory } from "../../lib/meta-ads/inventory-sheet-activation";
import { InventoryCacStatus } from "./inventory-cac-status";
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
    pending = useRef(false),
    [rules, setRules] = useState(directory.cacRules ?? defaultCacRules()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const valid =
    rules.review > 0 &&
    rules.review < rules.severe &&
    rules.severe < rules.critical &&
    rules.zero > 0;
  return (
    <dialog
      ref={dialog}
      className="trial-dialog inventory-factor-settings"
      aria-label="Definir límites del CAC"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <div>
          <h2>Factor · límites del CAC</h2>
          <small>Hoy y los 13 días anteriores · por diplomado y país</small>
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
        CAC = presupuesto ÷ ventas · Meta = gasto original ÷ ventas
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current || !directory.canEdit || !valid) return;
          pending.current = true;
          setBusy(true);
          setError("");
          let committed = false;
          try {
            await api("meta-ads/inventory/sheet-activation/limits", "PUT", {
              listId,
              revision: directory.revision,
              cacRules: rules,
            });
            committed = true;
            await onSaved();
            onClose();
          } catch (e) {
            setError(
              (committed ? "Guardado. Actualiza la vista. " : "") +
                (e as Error).message,
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
                <th>Estado</th>
                <th>CAC en soles</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <InventoryCacStatus status="WITHIN" />
                </td>
                <td>Menor de S/ {rules.review}</td>
              </tr>
              {(
                [
                  ["review", "ALERT"],
                  ["severe", "SEVERE"],
                  ["critical", "CRITICAL"],
                ] as const
              ).map(([key, status]) => (
                <tr key={key}>
                  <td>
                    <InventoryCacStatus status={status} />
                  </td>
                  <td>
                    <label>
                      Desde S/{" "}
                      <input
                        type="number"
                        aria-label={"Desde " + cacStatusNames[status]}
                        min="0.01"
                        step="0.01"
                        value={rules[key]}
                        disabled={!directory.canEdit || busy}
                        onChange={(e) =>
                          setRules({ ...rules, [key]: Number(e.target.value) })
                        }
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="inventory-factor-zero">
          <label>
            Alerta de inversión sin ventas · S/{" "}
            <input
              type="number"
              aria-label="Alerta sin ventas"
              min="0.01"
              step="0.01"
              value={rules.zero}
              disabled={!directory.canEdit || busy}
              onChange={(e) =>
                setRules({ ...rules, zero: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <p className="trial-help">
          Con cero ventas, el CAC se muestra como —. N/A no se convierte en
          cero. Se conserva cualquier presupuesto o gasto registrado. El detalle
          permite elegir otras fechas.
        </p>
        {!valid && (
          <p role="alert">Los límites deben ser positivos y crecientes.</p>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          {directory.canEdit && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRules(defaultCacRules())}
              >
                Valores iniciales
              </button>
              <button type="submit" disabled={busy || !valid}>
                {busy ? "Guardando…" : "Guardar límites"}
              </button>
            </>
          )}
          <button type="button" disabled={busy} onClick={onClose}>
            {directory.canEdit ? "Cancelar" : "Cerrar"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
