"use client";
import { useEffect, useRef, useState } from "react";
import { SheetSearchSelect } from "./sheet-search-select";
import { countryOptions } from "../../lib/meta-ads/countries";
import { financialRequest as api } from "./financial-request";
import type { InventorySheetActivationDirectory } from "../../lib/meta-ads/inventory-sheet-activation";
export function InventoryAddEvaluationSheet({
  listId,
  directory,
  onSaved,
  onClose,
}: {
  listId: string;
  directory: InventorySheetActivationDirectory;
  onSaved: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [mode, setMode] = useState<"existing" | "new">("existing"),
    [tableId, setTableId] = useState(""),
    [name, setName] = useState(""),
    [country, setCountry] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-add-evaluation-sheet"
      aria-label="Agregar hoja a evaluación"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2>Agregar hoja</h2>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      <div className="trial-mode">
        <button
          type="button"
          disabled={busy}
          aria-pressed={mode === "existing"}
          onClick={() => setMode("existing")}
        >
          Elegir hoja
        </button>
        <button
          type="button"
          disabled={busy || !directory.canCreate}
          aria-pressed={mode === "new"}
          onClick={() => setMode("new")}
        >
          Crear hoja
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const t = await api(
              "meta-ads/inventory/sheet-activation/sheet",
              "POST",
              {
                listId,
                ...(mode === "existing" ? { tableId } : { name, country }),
              },
            );
            await onSaved(t.id);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "existing" ? (
          <SheetSearchSelect
            label="Elegir hoja para evaluación"
            placeholder="Busca una hoja…"
            value={tableId}
            options={directory.tables.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            disabled={busy}
            onSelect={setTableId}
          />
        ) : (
          <>
            <label>
              Nombre de la hoja
              <input
                required
                value={name}
                maxLength={150}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              País
              <SheetSearchSelect
                label="País de la nueva hoja"
                value={country}
                placeholder="Selecciona un país"
                options={countryOptions.map((c) => ({
                  value: c.code,
                  label: c.name,
                }))}
                disabled={busy}
                onSelect={setCountry}
              />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button
            type="submit"
            disabled={
              busy ||
              (mode === "existing" ? !tableId : !name.trim() || !country)
            }
          >
            {busy
              ? "Guardando…"
              : mode === "existing"
                ? "Agregar hoja"
                : "Crear hoja"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
