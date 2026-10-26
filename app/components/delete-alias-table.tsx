"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
type Review = {
  table: { id: string; name: string };
  counts: Record<string, number>;
  token: string;
};
const labels: Record<string, string> = {
  aliases: "Inventario",
  rows: "Filas de inventario y país",
  days: "Días con datos manuales",
  events: "Cambios de activación",
  assignments: "Asignaciones internas en Meta",
  advisorHistory: "Cambios de asesor",
  salesApprovals: "Repartos aprobados de ventas",
  totals: "Días de totales manuales",
  colorRules: "Reglas de colores",
  links: "Configuraciones de sincronización",
};
export function DeleteAliasTable({
  tableId,
  onClose,
  onDeleted,
}: {
  tableId: string;
  onClose: () => void;
  onDeleted: (id: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    mounted = useRef(true);
  const [review, setReview] = useState<Review | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [typed, setTyped] = useState(""),
    [message, setMessage] = useState(""),
    [version, setVersion] = useState(0),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    setReview(null);
    setTyped("");
    void api("meta-ads/alias-tables/" + tableId + "/delete-preview")
      .then((v: Review) => {
        if (active) setReview(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tableId, version]);
  return (
    <dialog
      ref={dialog}
      className="meta-detail delete-alias-table"
      aria-label="Eliminar tabla de Efectividad"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <h2>Eliminar tabla {review ? `«${review.table.name}»` : ""}</h2>
      {loading && <p role="status">Revisando el contenido de la tabla…</p>}
      {review && (
        <>
          <p>
            Se eliminará esta tabla completa con su inventario, datos manuales,
            totales, historial de activación y colores. Esta acción no se puede
            deshacer.
          </p>
          <dl>
            {Object.entries(labels).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{review.counts[key] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <p>
            Los anuncios y estadísticas originales de Meta se conservan; se
            retira su asignación a estos elementos del inventario. Los asesores, asistencias y
            horas ausentes no se borran. Las copias ya guardadas en otras tablas
            se conservan; sus conexiones de sincronización con esta tabla se
            retiran.
          </p>
          <label>
            Escribe <b>{review.table.name}</b> para confirmar
            <input
              aria-label="Nombre exacto de la tabla para eliminar"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              disabled={busy || committed}
            />
          </label>
        </>
      )}
      {message && (
        <p className="sheet-message" role="alert">
          {message}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="danger"
          disabled={
            !review ||
            loading ||
            busy ||
            committed ||
            typed !== review.table.name
          }
          onClick={async () => {
            if (!review) return;
            setBusy(true);
            setMessage("");
            let deleted = false;
            try {
              await api("meta-ads/alias-tables/" + tableId, "DELETE", {
                token: review.token,
                confirmedName: typed,
              });
              deleted = true;
              if (mounted.current) setCommitted(true);
              await onDeleted(tableId);
            } catch (e) {
              if (mounted.current)
                setMessage(
                  deleted
                    ? "La tabla se eliminó. Actualiza la página para recargar la lista."
                    : (e as Error).message,
                );
            } finally {
              if (mounted.current) setBusy(false);
            }
          }}
        >
          Eliminar tabla completa
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        {message && !committed && (
          <button
            disabled={busy || loading}
            onClick={() => setVersion((v) => v + 1)}
          >
            Revisar de nuevo
          </button>
        )}
      </div>
    </dialog>
  );
}
