"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
type Leaf = {
  id: string;
  name: string;
  table: { id: string; name: string };
  rows: number;
  days: number;
  assignments: number;
  token: string;
};
export function InventorySelectionDelete({
  listId,
  ids,
  onClose,
  onRemoved,
}: {
  listId: string;
  ids: string[];
  onClose: () => void;
  onRemoved: (ids: string[]) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [items, setItems] = useState<Leaf[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api("meta-ads/inventory/remove-preview", "POST", { listId, ids })
      .then((v) => {
        if (active) {
          setItems(v.items);
          setSelected(v.items.map((i: Leaf) => i.id));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listId, ids, reload]);
  const chosen = items.filter((i) => selected.includes(i.id));
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-selection-delete"
      aria-label="Eliminar selección de inventario"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <h2>Eliminar inventario seleccionado</h2>
      <p>
        Marca las hojas de las que quieres quitar cada ítem. Las hojas sin
        marcar conservarán sus datos.
      </p>
      {loading && <p role="status">Revisando la selección…</p>}
      {!loading && !!items.length && (
        <>
          <div className="row inventory-review-actions">
            <button
              type="button"
              disabled={busy || committed}
              onClick={() => setSelected(items.map((i) => i.id))}
            >
              Marcar todas
            </button>
            <button
              type="button"
              disabled={busy || committed}
              onClick={() => setSelected([])}
            >
              Desmarcar todas
            </button>
          </div>
          <div className="inventory-review-list">
            {items.map((i) => (
              <label key={i.id} className="inventory-review-leaf">
                <input
                  type="checkbox"
                  checked={selected.includes(i.id)}
                  disabled={busy || committed}
                  aria-label={`Quitar ${i.name} de ${i.table.name}`}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, i.id]
                        : old.filter((id) => id !== i.id),
                    )
                  }
                />
                <span>
                  <strong>{i.name}</strong>
                  <small>
                    {i.table.name} · {i.rows} filas · {i.days} días con datos
                  </small>
                </span>
              </label>
            ))}
          </div>
          <p>
            {chosen.length} asociaciones seleccionadas ·{" "}
            {chosen.reduce((n, i) => n + i.rows, 0)} filas ·{" "}
            {chosen.reduce((n, i) => n + i.days, 0)} días con datos manuales.
          </p>
          <p>
            Se quitarán sus asignaciones internas en Meta y su historial en
            estas hojas. Esta eliminación no se puede deshacer.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="row">
        <button type="button" disabled={busy} onClick={onClose}>
          {committed ? "Cerrar" : "Cancelar"}
        </button>
        {error && !committed && (
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => setReload((v) => v + 1)}
          >
            Revisar de nuevo
          </button>
        )}
        <button
          type="button"
          className="danger"
          disabled={busy || loading || committed || !!error || !chosen.length}
          onClick={async () => {
            if (pending.current) return;
            pending.current = true;
            setBusy(true);
            setError("");
            let saved = false;
            try {
              const result = await api("meta-ads/inventory/remove", "POST", {
                listId,
                entries: chosen.map((i) => ({ id: i.id, token: i.token })),
              });
              saved = true;
              setCommitted(true);
              await onRemoved(result.removed);
            } catch (e) {
              setError(
                saved
                  ? "La selección se eliminó. Cierra y recarga para ver la lista actualizada."
                  : (e as Error).message,
              );
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          {busy ? "Eliminando…" : "Eliminar selección"}
        </button>
      </div>
    </dialog>
  );
}
