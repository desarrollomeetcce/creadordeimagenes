"use client";
import { useEffect, useRef, useState } from "react";
export function AdvisorCommercialRole({
  name,
  value,
  onClose,
  onSave,
}: {
  name: string;
  value: string;
  onClose: () => void;
  onSave: (role: "ADVISOR" | "SUPERVISOR") => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [role, setRole] = useState<"ADVISOR" | "SUPERVISOR">(
      value === "SUPERVISOR" ? "SUPERVISOR" : "ADVISOR",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="meta-detail advisor-commercial-role"
      aria-label={`Función comercial de ${name}`}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>Función de {name}</h2>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(role);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo guardar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>¿Cómo participa?</legend>
          <label>
            <input
              type="radio"
              name="commercial-role"
              checked={role === "ADVISOR"}
              onChange={() => setRole("ADVISOR")}
            />
            Asesoría
          </label>
          <label>
            <input
              type="radio"
              name="commercial-role"
              checked={role === "SUPERVISOR"}
              onChange={() => setRole("SUPERVISOR")}
            />
            Supervisión · también registra ventas
          </label>
        </fieldset>
        <p>
          El apoyo temporal conserva la base con el titular. Si asume
          definitivamente el diplomado, registra un cambio de titular.
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" data-financial-write disabled={busy}>
          {busy ? "Guardando…" : "Guardar función"}
        </button>
      </form>
    </dialog>
  );
}
