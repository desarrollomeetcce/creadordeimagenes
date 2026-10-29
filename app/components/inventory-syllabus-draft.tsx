"use client";
import { useEffect, useRef, useState } from "react";
import {
  syllabusSchema,
  type InventorySyllabus,
} from "../../lib/meta-ads/inventory-syllabi-policy";
export function InventorySyllabusDraft({
  value,
  inventory,
  onClose,
  onSave,
}: {
  value: InventorySyllabus;
  inventory: string;
  onClose: () => void;
  onSave: (s: InventorySyllabus) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [draft, setDraft] = useState(value),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-syllabus-draft"
      aria-label={`Preparar temario de ${inventory}`}
      onCancel={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <header className="row">
        <div>
          <h2>Contenido del temario</h2>
          <p>{inventory}</p>
        </div>
        <button type="button" className="ui-close-button" onClick={onClose}>
          Cerrar
        </button>
      </header>
      <p className="hint">
        Se incorporará al pulsar «Guardar inventario». Cada botón conserva su
        propio nombre y contenido.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = syllabusSchema.safeParse(draft);
          if (!parsed.success) {
            setError(
              "Completa el nombre, el ámbito y el contenido del temario.",
            );
            return;
          }
          onSave(parsed.data);
        }}
      >
        <div className="row">
          <label>
            Nombre del botón
            <input
              autoFocus
              required
              maxLength={100}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Ámbito
            <input
              required
              maxLength={80}
              value={draft.scope}
              onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
              placeholder="Todo el mundo, Perú…"
            />
          </label>
        </div>
        <label>
          Contenido del temario
          <textarea
            required
            rows={13}
            maxLength={30000}
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          />
        </label>
        <footer className="row">
          <button className="primary">Guardar temario</button>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
        </footer>
      </form>
    </dialog>
  );
}
