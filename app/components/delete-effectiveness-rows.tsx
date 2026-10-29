"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
type Selection = {
  tableId: string;
  since: string;
  until: string;
  targets: { aliasId: string; country: string }[];
};
type Review = {
  table: { id: string; name: string };
  items: { aliasId: string; country: string; name: string }[];
  counts: { rows: number; days: number; advisorChanges: number };
  token: string;
};
export function DeleteEffectivenessRows({
  selection,
  onClose,
  onDeleted,
}: {
  selection: Selection;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setReview(null);
    setError("");
    void api("meta-ads/effectiveness/rows/delete-preview", "POST", selection)
      .then((data) => {
        if (active) setReview(data);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "No se pudo revisar la selección.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selection, reload]);
  const remove = async () => {
    if (!review || pending.current || committed) return;
    pending.current = true;
    setBusy(true);
    setError("");
    let saved = false;
    try {
      await api("meta-ads/effectiveness/rows", "DELETE", {
        ...selection,
        token: review.token,
      });
      saved = true;
      setCommitted(true);
      await onDeleted();
    } catch (e) {
      setError(
        saved
          ? "Filas eliminadas. Cierra y actualiza la página para ver el resultado."
          : e instanceof Error
            ? e.message
            : "No se pudieron eliminar las filas.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="meta-detail effectiveness-row-delete"
      aria-label="Eliminar filas seleccionadas"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row spread">
        <h2>
          Eliminar {selection.targets.length}{" "}
          {selection.targets.length === 1 ? "fila" : "filas"}
          {review ? ` de «${review.table.name}»` : ""}
        </h2>
        <button className="ui-close-button"
          type="button"
          aria-label="Cerrar revisión de filas"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {loading && <p role="status">Revisando filas…</p>}
      {review && (
        <>
          <p>
            Se quitarán estas filas de esta hoja, incluidos sus valores manuales
            y repartos de ventas de todas las fechas.
          </p>
          <p>
            Los productos del inventario, las otras hojas, la asistencia y horas
            de los asesores y los datos originales de Meta se conservan.
          </p>
          <ul className="effectiveness-delete-list">
            {review.items.map((item) => (
              <li key={JSON.stringify([item.aliasId, item.country])}>
                <strong>{item.name}</strong> · {item.country || "Sin país"}
              </li>
            ))}
          </ul>
          <p>
            {review.counts.days} registros diarios guardados ·{" "}
            {review.counts.advisorChanges} cambios de asesor en estas filas.
          </p>
          <small>
            Puedes volver a añadir el producto desde el selector de inventario.
            Los valores manuales eliminados no se recuperan al añadirlo.
          </small>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <footer className="row">
        <button className={committed ? "ui-close-button" : undefined} type="button" disabled={busy} onClick={onClose}>
          {committed ? "Cerrar" : "Cancelar"}
        </button>
        {error && !committed && (
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => setReload((n) => n + 1)}
          >
            Revisar de nuevo
          </button>
        )}
        <button
          type="button"
          className="danger"
          disabled={busy || loading || !review || committed}
          onClick={() => void remove()}
        >
          Eliminar filas ({selection.targets.length})
        </button>
      </footer>
    </dialog>
  );
}
