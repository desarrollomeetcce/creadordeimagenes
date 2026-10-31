"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import {
  defaultInventoryLimits,
  inventoryFactorLimit,
} from "../../lib/meta-ads/inventory-factor-policy";
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
    [previewSales, setPreviewSales] = useState("100"),
    pending = useRef(false);
  const numericLimits = limits.map(Number);
  const customCount = numericLimits
    .slice(1)
    .filter((value, index) => value !== (index + 1) * 50).length;
  const sales = Number(previewSales);
  const previewLimit =
    previewSales.trim() && Number.isSafeInteger(sales) && sales >= 0
      ? inventoryFactorLimit(sales, numericLimits)
      : null;
  const money = (value: number) =>
    `S/ ${value.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
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
        <section
          className="inventory-factor-rule"
          aria-label="Regla proporcional del factor"
        >
          <span className="inventory-factor-unlimited">
            ∞ Sin tope de ventas
          </span>
          <h3>Límite = ventas × S/50</h3>
          <p>
            Desde 1 venta, el límite crece automáticamente. No necesitas añadir
            una fila por cada venta.
          </p>
          <div className="inventory-factor-examples">
            {[10, 100, 1000].map((value) => (
              <div key={value}>
                <small>{value.toLocaleString("es-PE")} ventas</small>
                <strong>
                  {money(inventoryFactorLimit(value, numericLimits))}
                </strong>
              </div>
            ))}
          </div>
        </section>
        <div className="inventory-factor-zero">
          <label>
            Sin ventas · límite especial
            <input
              type="number"
              aria-label="Límite para 0 ventas"
              required
              min="0.01"
              max="10000000"
              step="0.01"
              value={limits[0] ?? "25"}
              disabled={busy || !directory.canEdit}
              onChange={(e) =>
                setLimits((current) => [e.target.value, ...current.slice(1)])
              }
            />
          </label>
          <small>Con 0 ventas, el límite inicial es S/25.</small>
        </div>
        <div className="inventory-factor-calculator">
          <label>
            Prueba cualquier cantidad de ventas
            <input
              type="text"
              inputMode="numeric"
              aria-label="Ventas para calcular el límite"
              value={previewSales}
              onChange={(e) => setPreviewSales(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
          </label>
          <output aria-live="polite">
            <small>Límite acumulado</small>
            <strong>
              {previewLimit !== null &&
              Number.isFinite(previewLimit) &&
              previewLimit > 0
                ? money(previewLimit)
                : "—"}
            </strong>
          </output>
        </div>
        {customCount > 0 && (
          <p className="inventory-factor-custom-note">
            Tienes {customCount}{" "}
            {customCount === 1
              ? "límite personalizado"
              : "límites personalizados"}
            . En esas cantidades se usa tu ajuste; las demás siguen la regla de
            S/50 por venta.
          </p>
        )}
        <details className="inventory-factor-overrides">
          <summary>Ajustes por cantidad de ventas · opcional</summary>
          <p className="trial-help">
            Úsalos solo si deseas un límite diferente para una cantidad
            concreta. La regla automática continúa para todas las demás
            cantidades.
          </p>
          <div className="inventory-factor-limits-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ventas</th>
                  <th>Límite acumulado · S/</th>
                </tr>
              </thead>
              <tbody>
                {limits.slice(1).map((value, index) => {
                  const sales = index + 1;
                  return (
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
                  );
                })}
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
                + Cantidad personalizada
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
        </details>
        <p className="trial-help">
          Se aplica a todas las hojas de este Inventario, sin tope de ventas. Al
          alcanzar el 100% se indica «Revisar»; con cero ventas, «Alerta grave».
          Los datos incompletos quedan pendientes.
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
