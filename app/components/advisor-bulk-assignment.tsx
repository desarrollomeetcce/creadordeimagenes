"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
type Target = { aliasId: string; country: string; rowRevision: number };
export function AdvisorBulkAssignment({
  tableId,
  advisorId,
  name,
  selected,
  visible,
  onClose,
  onSaved,
}: {
  tableId: string;
  advisorId: string | null;
  name: string;
  selected: Target[];
  visible: Target[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    now = new Date(Date.now() - 5 * 3600000).toISOString();
  const [scope, setScope] = useState(
      selected.some((r) => r.country) ? "selected" : "visible",
    ),
    [day, setDay] = useState(now.slice(0, 10)),
    [mode, setMode] = useState<"DAY" | "CLOCK">("CLOCK"),
    [time, setTime] = useState(now.slice(11, 16)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const candidates = scope === "selected" ? selected : visible,
    targets = candidates.filter((r) => r.country);
  return (
    <dialog
      ref={dialog}
      className="meta-detail advisor-assignment"
      aria-label="Asignar asesor a varias filas"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>Asignar {name}</h2>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          aria-label="Cerrar asignación de asesor"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void (async () => {
            try {
              await api("meta-ads/effectiveness/advisors/batch", "PATCH", {
                tableId,
                advisorId,
                day,
                mode,
                ...(mode === "CLOCK" ? { time } : {}),
                targets: targets.map((r) => ({
                  aliasId: r.aliasId,
                  country: r.country,
                  revision: r.rowRevision,
                })),
              });
              setCommitted(true);
              await onSaved();
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo asignar.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <fieldset disabled={busy || committed}>
          <legend>Filas de esta visualización</legend>
          <label>
            <input
              type="radio"
              name="advisor-bulk-scope"
              checked={scope === "selected"}
              disabled={!selected.some((r) => r.country)}
              onChange={() => setScope("selected")}
            />
            Seleccionadas visibles ({selected.filter((r) => r.country).length})
          </label>
          <label>
            <input
              type="radio"
              name="advisor-bulk-scope"
              checked={scope === "visible"}
              onChange={() => setScope("visible")}
            />
            Todas las visibles ({visible.filter((r) => r.country).length})
          </label>
          <p role="status">
            Se asignará {name} a {targets.length} filas de esta hoja.
            {candidates.length > targets.length
              ? " Las filas sin país no se modificarán."
              : ""}
          </p>
          <label>
            Fecha de inicio (Lima)
            <input
              type="date"
              required
              max={now.slice(0, 10)}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <label>
            <input
              type="radio"
              name="advisor-bulk-mode"
              checked={mode === "CLOCK"}
              onChange={() => setMode("CLOCK")}
            />
            Desde una hora
          </label>
          <label>
            <input
              type="radio"
              name="advisor-bulk-mode"
              checked={mode === "DAY"}
              onChange={() => setMode("DAY")}
            />
            Todo el día · desde las 00:00
          </label>
          {mode === "CLOCK" && (
            <label>
              Hora del cambio (Lima)
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          )}
          <p className="hint">
            Se conservan las ventas registradas por asesor. Cambia la
            responsabilidad desde la fecha y hora indicadas.
          </p>
        </fieldset>
        {error && (
          <p role="alert">
            {committed
              ? "La asignación se guardó. Actualiza la hoja para ver los cambios."
              : error}
          </p>
        )}
        <footer className="row">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            disabled={busy || committed || !targets.length}
            className="primary"
          >
            {busy ? "Guardando…" : `Asignar a ${targets.length} filas`}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
