"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
type Review = {
  sheet: { id: string; name: string; kind: string };
  counts: {
    inventory: number;
    inventoryItems: number;
    advisors: number;
    totals: number;
    categories: number;
  };
  token: string;
};
export function DeleteWorkbookSheet({
  sheetId,
  onClose,
  onDeleted,
}: {
  sheetId: string;
  onClose: () => void;
  onDeleted: (id: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [review, setReview] = useState<Review | null>(null),
    [typed, setTyped] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setReview(null);
    setTyped("");
    setError("");
    void api("meta-ads/workbook-sheets/" + sheetId + "/delete-preview")
      .then((v) => {
        if (active) setReview(v);
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
  }, [sheetId, reload]);
  return (
    <dialog
      ref={dialog}
      className="meta-detail delete-alias-table"
      aria-label="Eliminar pestaña de Efectividad"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <h2>Eliminar pestaña {review ? `«${review.sheet.name}»` : ""}</h2>
      {loading && <p role="status">Revisando pestaña…</p>}
      {review && (
        <>
          <p>
            Se quitará esta pestaña del libro. Sus registros e historial se
            conservarán, incluidas las referencias que ya usan otras hojas.
          </p>
          <dl>
            <div>
              <dt>Categorías conservadas</dt>
              <dd>{review.counts.categories}</dd>
            </div>
            <div>
              <dt>Ítems de inventario conservados</dt>
              <dd>{review.counts.inventory}</dd>
              <dt>Fichas de inventario conservadas</dt>
              <dd>{review.counts.inventoryItems}</dd>
            </div>
            <div>
              <dt>Asesores conservados</dt>
              <dd>{review.counts.advisors}</dd>
            </div>
            <div>
              <dt>Días de totales manuales conservados</dt>
              <dd>{review.counts.totals}</dd>
            </div>
          </dl>
          <p>
            Las demás pestañas seguirán disponibles. Puedes crear una lista
            nueva con su botón +.
          </p>
          <label>
            Escribe <b>{review.sheet.name}</b> para confirmar
            <input
              aria-label="Nombre exacto de la pestaña para eliminar"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy || committed}
              autoComplete="off"
            />
          </label>
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
          disabled={
            busy ||
            loading ||
            committed ||
            !review ||
            typed !== review.sheet.name
          }
          onClick={async () => {
            if (!review || pending.current) return;
            pending.current = true;
            setBusy(true);
            setError("");
            let saved = false;
            try {
              await api("meta-ads/workbook-sheets/" + sheetId, "DELETE", {
                token: review.token,
                confirmedName: typed,
              });
              saved = true;
              setCommitted(true);
              await onDeleted(sheetId);
            } catch (e) {
              setError(
                saved
                  ? "Pestaña eliminada. Cierra y recarga para actualizar el libro."
                  : (e as Error).message,
              );
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          Eliminar pestaña
        </button>
      </div>
    </dialog>
  );
}
