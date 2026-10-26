"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
type Review = {
  sales: number | null;
  rowRevision: number;
  advisorId: string | null;
  token: string;
  changes: {
    id: string;
    advisorId: string | null;
    previousAdvisorId: string | null;
    effectiveAt: string;
    mode: string;
    cutoffSales: number | null;
  }[];
};
export function AdvisorAssignment({
  aliasId,
  country,
  name,
  advisorId,
  revision,
  advisors,
  onClose,
  onSave,
  initial = false,
}: {
  aliasId: string;
  country: string;
  name: string;
  advisorId: string | null;
  revision: number;
  advisors: { id: string; name: string; label?: string }[];
  onClose: () => void;
  onSave: (body: unknown) => Promise<void>;
  initial?: boolean;
}) {
  const local = new Date(Date.now() - 5 * 3600000).toISOString();
  const dialog = useRef<HTMLDialogElement>(null);
  const [day, setDay] = useState(local.slice(0, 10)),
    [time, setTime] = useState(local.slice(11, 16)),
    [mode, setMode] = useState<"DAY" | "CLOCK">(initial ? "DAY" : "CLOCK");
  const [review, setReview] = useState<Review | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!day) return;
    if (initial) {
      setReview({
        sales: 0,
        rowRevision: revision,
        advisorId: null,
        token: "",
        changes: [],
      });
      return;
    }
    let active = true;
    setReview(null);
    setMessage("");
    void api(
      "meta-ads/effectiveness/advisor-review?" +
        new URLSearchParams({ aliasId, country, day }),
    )
      .then((v: Review) => {
        if (active) {
          setReview(v);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [aliasId, country, day, version, initial, revision]);
  const label = (id: string | null) =>
    advisors.find((a) => a.id === id)?.label ??
    advisors.find((a) => a.id === id)?.name ??
    "Sin asesor";
  return (
    <dialog
      ref={dialog}
      className="meta-detail advisor-assignment"
      aria-label="Asignar asesor con fecha de inicio"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>{initial ? "Inicio del asesor" : "Cambiar asesor"}</h2>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </header>
      <p>
        <b>
          {name} · {country || "Sin país"}
        </b>
      </p>
      <p>
        {review ? label(review.advisorId) : "…"} → <b>{label(advisorId)}</b>
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!review) return;
          setBusy(true);
          setMessage("");
          try {
            if (review.rowRevision !== revision)
              throw Error(
                "La fila cambió. Cierra esta ventana y vuelve a elegir el asesor.",
              );
            await onSave({
              aliasId,
              country,
              advisorId,
              revision,
              day,
              mode,
              ...(mode === "CLOCK" ? { time } : {}),
            });
            onClose();
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>¿Desde cuándo cuenta para el nuevo asesor?</legend>
          <label>
            Fecha de inicio (Lima)
            <input
              type="date"
              required
              value={day}
              max={local.slice(0, 10)}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <div className="row assignment-modes">
            <label>
              <input
                type="radio"
                name="assignment-mode"
                checked={mode === "DAY"}
                onChange={() => setMode("DAY")}
              />{" "}
              Todo el día · desde las 00:00
            </label>
            <label>
              <input
                type="radio"
                name="assignment-mode"
                checked={mode === "CLOCK"}
                onChange={() => setMode("CLOCK")}
              />{" "}
              Desde una hora
            </label>
          </div>
          {mode === "CLOCK" ? (
            <>
              <label>
                Hora del cambio (Lima)
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <p className="advisor-auto-cut" role="status">
                Ventas registradas de esta fecha:{" "}
                <b>{review?.sales ?? "Sin ventas registradas"}</b>. El sistema
                tomará automáticamente el total registrado al confirmar el
                cambio. Esas ventas quedan para los tramos anteriores y solo las
                que registres después se suman al nuevo asesor. No necesitas
                escribir otro valor.
              </p>
            </>
          ) : (
            <p>
              El nuevo asesor recibe todas las ventas de esta fecha. Reemplaza
              los cortes anteriores de este mismo día; las fechas previas
              mantienen su responsable.
            </p>
          )}
        </fieldset>
        {message && (
          <p role="alert" className="sheet-message">
            {message}
          </p>
        )}
        {!review && !message && (
          <p role="status">Revisando asignación y ventas…</p>
        )}
        <div className="row">
          <button type="submit" disabled={busy || !review}>
            {busy ? "Guardando…" : "Confirmar asignación"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setVersion((v) => v + 1)}
          >
            Actualizar información
          </button>
        </div>
      </form>
      {!!review?.changes.length && (
        <details>
          <summary>Historial de asignaciones ({review.changes.length})</summary>
          <ul>
            {review.changes.map((c) => (
              <li key={c.id}>
                {new Intl.DateTimeFormat("es-PE", {
                  timeZone: "America/Lima",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(c.effectiveAt))}{" "}
                · {label(c.previousAdvisorId)} → {label(c.advisorId)} ·{" "}
                {c.mode === "DAY" ? "día completo" : `corte ${c.cutoffSales} V`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </dialog>
  );
}
