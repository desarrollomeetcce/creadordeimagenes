"use client";
import { useEffect, useRef, useState } from "react";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { financialRequest as api } from "./financial-request";
type Leaf = {
  id: string;
  name: string;
  table: { id: string; name: string };
  rows: number;
  days: number;
  assignments: number;
  token: string;
  standalone?: boolean;
};
export function InventorySelectionDelete({
  listId,
  ids,
  sheetsOnly = false,
  simpleConfirm = false,
  wholeDiplomas = false,
  onClose,
  onRemoved,
}: {
  sheetsOnly?: boolean;
  simpleConfirm?: boolean;
  wholeDiplomas?: boolean;
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
    void api("meta-ads/inventory/remove-preview", "POST", {
      listId,
      ids,
      ...(wholeDiplomas ? { wholeDiplomas: true } : {}),
    })
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
  }, [listId, ids, reload, wholeDiplomas]);
  const [expanded, setExpanded] = useState(false);
  const chosen = items.filter((i) => selected.includes(i.id));
  return (
    <dialog
      ref={dialog}
      className={
        "meta-detail inventory-selection-delete" +
        (simpleConfirm ? " inventory-delete-confirm" : "")
      }
      data-expanded={expanded || undefined}
      aria-label={
        sheetsOnly
          ? "Quitar hojas de seleccionados"
          : "Eliminar selección de inventario"
      }
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      {simpleConfirm ? (
        <header>
          <h2>Confirmar eliminación</h2>
          <button
            type="button"
            aria-label={
              expanded ? "Restaurar confirmación" : "Maximizar confirmación"
            }
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Restaurar" : "Maximizar"}
          </button>
          <button
            type="button"
            className="ui-close-button"
            aria-label="Cerrar confirmación"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
      ) : (
        <h2>
          {sheetsOnly
            ? "Quitar hojas de los seleccionados"
            : "Eliminar inventario seleccionado"}
        </h2>
      )}
      {sheetsOnly && (
        <p>
          El diplomado y sus categorías se conservan en el catálogo. Revisa las
          hojas que vas a quitar. Sus datos y su historial se conservan.
        </p>
      )}
      {simpleConfirm ? (
        <p>
          ¿Seguro que quieres eliminar estos diplomados del inventario y sus
          hojas?
        </p>
      ) : (
        <p>
          Revisa los ítems y sus vínculos con hojas. «Ficha de inventario» es el
          registro del catálogo, aunque no tenga hoja asignada. Los registros
          sin marcar se conservarán.
        </p>
      )}
      {loading && <p role="status">Revisando la selección…</p>}
      {!loading && !!items.length && (
        <>
          {!simpleConfirm && (
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
          )}
          {simpleConfirm ? (
            <ul className="inventory-delete-names">
              {[
                ...new Map(
                  items.map((item) => [categoryKey(item.name), item.name]),
                ).values(),
              ].map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
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
          )}
          <p>
            {simpleConfirm
              ? new Set(chosen.map((item) => categoryKey(item.name))).size
              : chosen.length}{" "}
            {simpleConfirm ? "diplomados" : "registros"} seleccionados ·{" "}
            {chosen.reduce((n, i) => n + i.rows, 0)} filas ·{" "}
            {chosen.reduce((n, i) => n + i.days, 0)} días con datos manuales
            {simpleConfirm
              ? ` · ${chosen.reduce((n, i) => n + i.assignments, 0)} vínculos Meta`
              : ""}
            .
          </p>
          <p>
            {sheetsOnly
              ? "Se retirará el vínculo visible con la hoja. Se conservan activaciones, estadísticas y vínculos internos; puedes volver a añadirlo sin duplicarlo."
              : "Se eliminarán los registros confirmados y sus datos en estas hojas. Sus asignaciones internas se quitarán. Esta acción no se puede deshacer."}
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="row">
        <button
          className={committed ? "ui-close-button" : undefined}
          type="button"
          disabled={busy}
          onClick={onClose}
        >
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
                ...(sheetsOnly ? { preserveCatalog: true } : {}),
                ...(wholeDiplomas
                  ? { wholeDiplomas: true, catalogIds: ids }
                  : {}),
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
          {busy
            ? "Quitando…"
            : sheetsOnly
              ? "Confirmar quitar hojas"
              : simpleConfirm
                ? "Aceptar"
                : "Eliminar selección"}
        </button>
      </div>
    </dialog>
  );
}
