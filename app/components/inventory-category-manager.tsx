"use client";
import { useEffect, useRef, useState } from "react";
import type {
  InventoryCategoryState,
  InventoryCategoryAction,
} from "./inventory-category-types";
import { InventoryMultiSelect } from "./inventory-multi-select";
export function InventoryCategoryManager({
  config,
  onClose,
  onSave,
  onRefresh,
}: {
  config: InventoryCategoryState;
  selectedIds: string[];
  selectedCount: number;
  initialView?: "paste" | "catalog";
  onClose: () => void;
  onSave: (action: InventoryCategoryAction) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState<string[] | null>(null),
    [filter, setFilter] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [kind, setKind] = useState("PRIMARY");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const visible = config.categories.filter(
    (c) => !filter.length || filter.includes(c.id),
  );
  const chosen = selected.filter((id) => visible.some((c) => c.id === id));
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-category-manager"
      aria-label="Categorías del inventario"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>Categorías del inventario</h2>
        <button className="ui-close-button" type="button" disabled={busy} onClick={onClose}>
          Cerrar
        </button>
      </header>
      <p>
        Elige categorías principales o secundarias. Al eliminarlas se retiran de
        los ítems de esta lista; los inventarios y sus cifras se conservan.
      </p>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          setError("");
          try {
            await onSave({
              action: "IMPORT",
              rows: [
                {
                  primary: kind === "PRIMARY" ? name.trim() : "",
                  secondary: kind === "SECONDARY" ? name.trim() : "",
                },
              ],
            });
            setName("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Nueva categoría"
          placeholder="Nombre de la categoría…"
          value={name}
          maxLength={80}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          aria-label="Tipo de categoría"
          value={kind}
          disabled={busy}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="PRIMARY">Principal</option>
          <option value="SECONDARY">Secundaria</option>
        </select>
        <button disabled={busy || !name.trim()}>Añadir categoría</button>
      </form>
      <InventoryMultiSelect
        label="Categorías para buscar"
        options={config.categories.map((c) => ({
          value: c.id,
          label: `${c.name} · ${c.kind === "PRIMARY" ? "Principal" : "Secundaria"}`,
        }))}
        values={filter}
        onChange={setFilter}
      />
      <label className="inventory-category-select-all">
        <input
          type="checkbox"
          checked={!!visible.length && chosen.length === visible.length}
          disabled={busy}
          onChange={(e) =>
            setSelected(
              e.target.checked
                ? [...new Set([...selected, ...visible.map((c) => c.id)])]
                : selected.filter((id) => !visible.some((c) => c.id === id)),
            )
          }
        />
        Seleccionar todas las categorías visibles
      </label>
      <div className="inventory-category-delete-list">
        {visible.map((c) => (
          <div key={c.id} className="inventory-category-delete-item">
            <label>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                disabled={busy}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  )
                }
              />
              <span>
                {c.name}
                <small>
                  {c.kind === "PRIMARY" ? "Principal" : "Secundaria"}
                </small>
              </span>
            </label>
            <button
              type="button"
              disabled={busy}
              aria-label={`Eliminar categoría ${c.name}`}
              onClick={() => setReview([c.id])}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="danger"
        disabled={busy || !chosen.length}
        onClick={() => setReview(chosen)}
      >
        Eliminar seleccionadas ({chosen.length})
      </button>
      {error && (
        <p role="alert">
          {error}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRefresh();
                setReview(null);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Recargar
          </button>
        </p>
      )}
      {review && (
        <section
          className="category-delete-review"
          aria-label="Confirmar eliminación de categorías"
        >
          <p>
            Se eliminarán {review.length} categorías:{" "}
            {config.categories
              .filter((c) => review.includes(c.id))
              .map((c) => c.name)
              .join(", ")}
            . Se retirarán de{" "}
            {
              Object.values(config.assignments).filter((ids) =>
                ids.some((id) => review.includes(id)),
              ).length
            }{" "}
            registros. Los ítems y las cifras se conservarán.
          </p>
          <div className="row">
            <button
              type="button"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              className="danger"
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onSave({ action: "DELETE_MANY", categoryIds: review });
                  setSelected(selected.filter((id) => !review.includes(id)));
                  setFilter(filter.filter((id) => !review.includes(id)));
                  setReview(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar eliminación
            </button>
          </div>
        </section>
      )}
    </dialog>
  );
}
