"use client";
import { useEffect, useRef, useState } from "react";
import type {
  InventoryCategoryState,
  InventoryCategoryAction,
} from "./inventory-category-types";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { SheetSearchSelect } from "./sheet-search-select";
import { InventoryMultiSelect } from "./inventory-multi-select";
export function InventoryCategoryManager({
  config,
  onClose,
  onSave,
  onRefresh,
  onView,
}: {
  config: InventoryCategoryState;
  selectedIds: string[];
  selectedCount: number;
  initialView?: "paste" | "catalog";
  onClose: () => void;
  onSave: (action: InventoryCategoryAction) => Promise<void>;
  onRefresh: () => Promise<void>;
  onView: (names: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState<string[] | null>(null),
    [filter, setFilter] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [usage, setUsage] = useState("ALL"),
    [editing, setEditing] = useState<string | null>(null),
    [editName, setEditName] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const grouped = new Map<
    string,
    { id: string; name: string; ids: string[]; kinds: string[] }
  >();
  for (const c of config.categories) {
    const key = categoryKey(c.name);
    if (!grouped.has(key))
      grouped.set(key, { id: key, name: c.name, ids: [], kinds: [] });
    const group = grouped.get(key)!;
    group.ids.push(c.id);
    if (!group.kinds.includes(c.kind)) group.kinds.push(c.kind);
  }
  const groups = [...grouped.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
  const visible = groups.filter(
    (c) =>
      (!filter.length || filter.includes(c.id)) &&
      (usage === "ALL" || c.kinds.includes(usage)),
  );
  const reviewGroups = groups.filter((c) => review?.includes(c.id));
  const reviewIds = reviewGroups.flatMap((c) => c.ids);
  const editingGroup = groups.find((c) => c.id === editing);
  const destination = groups.find(
    (c) => c.id !== editing && categoryKey(c.name) === categoryKey(editName),
  );
  const editAffected = editingGroup
    ? Object.values(config.assignments).filter((ids) =>
        ids.some((id) => editingGroup.ids.includes(id)),
      ).length
    : 0;
  const chosen = selected.filter((id) => visible.some((c) => c.id === id));
  const selectedGroups = groups.filter((c) => selected.includes(c.id));
  const selectedCategoryIds = new Set(selectedGroups.flatMap((c) => c.ids));
  const selectedNames = [
    ...new Set(
      config.categories
        .filter((c) => selectedCategoryIds.has(c.id))
        .map((c) => c.name),
    ),
  ];
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
        <button
          className="ui-close-button"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      <p>
        Cada categoría aparece una sola vez. Al eliminarla se retiran todos sus
        usos, principales y secundarios, de esta lista. Los inventarios y sus
        cifras se conservan.
      </p>
      <label className="inventory-category-usage-filter">
        Mostrar
        <select
          aria-label="Uso de las categorías"
          value={usage}
          disabled={busy}
          onChange={(e) => setUsage(e.target.value)}
        >
          <option value="ALL">Todas las categorías</option>
          <option value="PRIMARY">Categorías principales</option>
          <option value="SECONDARY">Categorías secundarias</option>
        </select>
      </label>
      <InventoryMultiSelect
        label="Categorías para buscar"
        placeholder="Todas las categorías"
        options={groups.map((c) => ({ value: c.id, label: c.name }))}
        values={filter}
        onChange={setFilter}
        disabled={busy}
      />
      <p role="status" aria-live="polite">
        {visible.length} categorías encontradas.
      </p>
      {editingGroup && (
        <section
          className="inventory-category-editor"
          aria-label="Editar categoría"
        >
          <h3>Editar «{editingGroup.name}»</h3>
          <label>
            Nuevo nombre
            <input
              aria-label="Nuevo nombre de categoría"
              value={editName}
              maxLength={80}
              disabled={busy}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <label>
            O buscar una categoría existente para reemplazarla
            <SheetSearchSelect
              label="Categoría de destino"
              value={destination?.id ?? ""}
              options={groups
                .filter((c) => c.id !== editing)
                .map((c) => ({ value: c.id, label: c.name }))}
              onSelect={(value) =>
                setEditName(groups.find((c) => c.id === value)!.name)
              }
              placeholder="Buscar categoría existente…"
              disabled={busy}
            />
          </label>
          <p>
            {destination
              ? `Se fusionará «${editingGroup.name}» con «${destination.name}».`
              : `Se cambiará el nombre de «${editingGroup.name}».`}{" "}
            El cambio se aplica a todos sus usos en esta lista ({editAffected}{" "}
            registros). Si un diplomado ya tiene la categoría de destino, se
            conserva una sola vez con su clasificación existente.
          </p>
          <div className="row">
            <button
              type="button"
              disabled={busy || !editName.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onSave({
                    action: "RENAME",
                    categoryId: editingGroup.ids[0],
                    name: editName.trim(),
                  });
                  setEditing(null);
                  setSelected([]);
                  setFilter([]);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {destination ? "Fusionar categorías" : "Guardar nombre"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancelar edición
            </button>
          </div>
        </section>
      )}
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
        {!visible.length && (
          <p>Sin coincidencias. Revisa los filtros de categorías.</p>
        )}
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
                  {c.kinds.length === 2
                    ? "Principal y secundaria"
                    : c.kinds.includes("PRIMARY")
                      ? "Principal"
                      : "Secundaria"}
                </small>
              </span>
            </label>
            <button
              type="button"
              disabled={busy}
              aria-label={`Editar categoría ${c.name}`}
              title="Editar o fusionar categoría"
              onClick={() => {
                setEditing(c.id);
                setEditName(c.name);
                setReview(null);
                setError("");
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="m15 5 4 4M4 20l4-1L21 6l-4-4L4 15v5Z" />
              </svg>
            </button>
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
      <div className="row inventory-category-selection-actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !selectedGroups.length}
          title="Ver diplomados de las categorías marcadas, tanto principales como secundarias"
          onClick={() => onView(selectedNames)}
        >
          Ver seleccionadas ({selectedGroups.length})
        </button>
        <button
          type="button"
          className="danger"
          disabled={busy || !chosen.length}
          onClick={() => setReview(chosen)}
        >
          Eliminar seleccionadas ({chosen.length})
        </button>
      </div>
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
            Se eliminarán {reviewGroups.length} categorías, en todos sus usos
            principales y secundarios:{" "}
            {reviewGroups.map((c) => c.name).join(", ")}. Se retirarán de{" "}
            {
              Object.values(config.assignments).filter((ids) =>
                ids.some((id) => reviewIds.includes(id)),
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
                  await onSave({
                    action: "DELETE_MANY",
                    categoryIds: reviewIds,
                  });
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
