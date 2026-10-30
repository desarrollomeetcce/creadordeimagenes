"use client";
import { useEffect, useRef, useState } from "react";
import { InventoryMultiSelect } from "./inventory-multi-select";
export function InventoryCategoryAssign({
  kind,
  inventoryNames,
  categoryNames,
  onClose,
  onApply,
  onRemoveAll,
}: {
  kind: "PRIMARY" | "SECONDARY";
  inventoryNames: string[];
  categoryNames: string[];
  onClose: () => void;
  onApply: (names: string[], remove?: boolean) => Promise<void>;
  onRemoveAll: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [names, setNames] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const level = kind === "PRIMARY" ? "principales" : "secundarias";
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-category-assign"
      aria-label={`Asignar o quitar categorías ${level}`}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>Asignar o quitar categorías {level}</h2>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      <p>
        <strong>
          {inventoryNames.length} inventario
          {inventoryNames.length === 1 ? "" : "s"} seleccionado
          {inventoryNames.length === 1 ? "" : "s"}
        </strong>
        : {inventoryNames.slice(0, 5).join(", ")}
        {inventoryNames.length > 5 ? ` y ${inventoryNames.length - 5} más` : ""}
        .
      </p>
      <InventoryMultiSelect
        label={`Elegir categorías ${level} para asignar`}
        placeholder="Buscar y elegir categorías…"
        options={categoryNames.map((name) => ({ value: name, label: name }))}
        values={names}
        onChange={setNames}
        all={false}
        disabled={busy}
        description="Marca una o varias categorías y pulsa Listo para revisar la asignación."
      />
      <div className="inventory-category-filter-chips">
        {names.map((name) => (
          <span key={name}>
            {name}
            <button
              type="button"
              aria-label={`Quitar de la asignación ${name}`}
              disabled={busy}
              onClick={() => setNames(names.filter((n) => n !== name))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <p>
        Elige categorías y pulsa Asignar o Quitar. «Quitar todas» retira las de
        este nivel únicamente de los inventarios seleccionados.
      </p>
      {error && <p role="alert">{error}</p>}
      <footer className="row">
        <button
          type="button"
          disabled={busy || !names.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onApply(names);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Asignando…"
            : `Asignar a ${inventoryNames.length} inventario${inventoryNames.length === 1 ? "" : "s"}`}
        </button>
        <button
          type="button"
          disabled={busy || !names.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onApply(names, true);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Quitar elegidas
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onRemoveAll();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Quitar todas
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </footer>
    </dialog>
  );
}
