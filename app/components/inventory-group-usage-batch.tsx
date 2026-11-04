"use client";
import { useEffect, useRef, useState } from "react";
import type { TrialItem } from "../../lib/meta-ads/inventory-trial-policy";
import type { GroupUsageCell } from "../../lib/meta-ads/inventory-group-usage";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { usageBatchRevision } from "../../lib/meta-ads/inventory-group-usage-batch-policy";
import { financialRequest as api } from "./financial-request";
export function InventoryGroupUsageBatch({
  listId,
  items,
  countries,
  usage,
  mode,
  onClose,
  onApplied,
}: {
  listId: string;
  items: TrialItem[];
  countries: { code: string; name: string }[];
  usage: Record<string, GroupUsageCell>;
  mode: "USED" | "UNUSED";
  onClose: () => void;
  onApplied: (updates: Record<string, GroupUsageCell>) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [snapshot] = useState(() => ({
    listId,
    items,
    countries,
    usage,
    mode,
  }));
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function apply() {
    if (
      pending.current ||
      committed ||
      !selected.length ||
      selected.length > 20
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    let written = false;
    try {
      const expectedUsageRevision = await usageBatchRevision(
        snapshot.items,
        selected,
        snapshot.usage,
      );
      const response: {
        usageBatchUpdate: {
          mode: "USED" | "UNUSED";
          revision: string;
          cells: number;
        };
      } = await api("meta-ads/inventory/trials", "POST", {
        action: "USAGE_BATCH",
        listId: snapshot.listId,
        itemIds: snapshot.items.map((item) => item.id),
        countries: selected,
        mode: snapshot.mode,
        expectedUsageRevision,
      });
      written = true;
      setCommitted(true);
      const updates: Record<string, GroupUsageCell> = {};
      for (const item of snapshot.items)
        for (const country of selected) {
          const key = JSON.stringify([categoryKey(item.name), country]);
          updates[key] = {
            ...(snapshot.usage[key] ?? {
              automatic: "NEVER",
              activationHours: 0,
              nextUsedAt: null,
            }),
            mode: response.usageBatchUpdate.mode,
            revision: response.usageBatchUpdate.revision,
          };
        }
      onApplied(updates);
    } catch (e) {
      setError(
        (written ? "La marca ya se guardó. Actualiza la vista. " : "") +
          (e instanceof Error ? e.message : "No se pudo marcar el uso."),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-group-usage-batch"
      aria-label={
        snapshot.mode === "USED"
          ? "Marcar seleccionados como usados"
          : "Marcar seleccionados sin usar"
      }
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h3>{snapshot.mode === "USED" ? "Marcar usado" : "Marcar sin usar"}</h3>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          aria-label="Cerrar uso de seleccionados"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p>
        {snapshot.items.length} diplomados seleccionados. Elige en qué países
        aplicar la marca.
      </p>
      <fieldset>
        <legend>Países</legend>
        <label>
          <input
            type="checkbox"
            aria-label="Todos los países para marcar uso"
            disabled={busy || committed || snapshot.countries.length > 20}
            checked={selected.length === snapshot.countries.length}
            onChange={(event) =>
              setSelected(
                event.target.checked
                  ? snapshot.countries.map((c) => c.code)
                  : [],
              )
            }
          />
          Todos los países
        </label>
        <div className="inventory-group-usage-batch-countries">
          {snapshot.countries.map((country) => (
            <label key={country.code}>
              <input
                type="checkbox"
                aria-label={`Marcar uso en ${country.name}`}
                disabled={busy || committed}
                checked={selected.includes(country.code)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, country.code]
                      : current.filter((code) => code !== country.code),
                  )
                }
              />
              {country.name}
            </label>
          ))}
        </div>
      </fieldset>
      <small>
        Solo cambia la marca de uso. La activación, hojas, ventas y campañas se
        conservan.
      </small>
      {!!selected.length && (
        <p role="status">
          {snapshot.items.length} diplomados · {selected.length} países ·{" "}
          {snapshot.items.length * selected.length} marcas
        </p>
      )}
      {selected.length > 20 && (
        <p role="alert">Elige hasta20 países por vez.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          {committed ? "Cerrar" : "Cancelar"}
        </button>
        {!committed && (
          <button
            type="button"
            className="primary"
            disabled={busy || !selected.length || selected.length > 20}
            onClick={() => void apply()}
          >
            {busy ? "Guardando…" : "Aplicar marca"}
          </button>
        )}
      </footer>
    </dialog>
  );
}
