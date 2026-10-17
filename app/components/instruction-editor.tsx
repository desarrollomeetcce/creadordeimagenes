"use client";
import { useEffect, useId, useRef, useState } from "react";

/** Both views edit the same draft. Only the containing form persists it. */
export function InstructionEditor({
  label,
  name,
  defaultValue = "",
  value,
  onValueChange,
  placeholder,
  maxLength = 30000,
  readOnly=false,
}: {
  label: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  readOnly?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(defaultValue);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const modalText = useRef<HTMLTextAreaElement>(null);
  const text = value ?? draft;
  const update = (next: string) => {
    setDraft(next);
    onValueChange?.(next);
  };
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal();
    modalText.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  return (
    <div className="instruction-editor">
      <div className="instruction-editor-heading">
        <label htmlFor={id}>{label}</label>
        <div className="instruction-editor-actions">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded((previous) => !previous)}
          >
            {expanded ? "Reducir en la página" : "Ampliar en la página"}
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            Abrir ventana amplia
          </button>
        </div>
      </div>
      <textarea
        id={id}
        name={name}
        className={expanded ? "instruction-editor-expanded" : undefined}
        value={text}
        onChange={(event) => update(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={maxLength}
      />
      <dialog
        ref={dialog}
        className="instruction-editor-dialog"
        aria-labelledby={id + "-title"}
        aria-describedby={id + "-help"}
        onClose={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const fields = event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), textarea:not(:disabled)",
          );
          const first = fields[0],
            last = fields[fields.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="instruction-editor-modal-content">
          <div className="instruction-editor-heading">
            <h2 id={id + "-title"}>{label}</h2>
            <button type="button" className="window-close" aria-label="Cerrar ventana de instrucciones" title="Cerrar y continuar" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </div>
          <p id={id + "-help"} className="hint">
            Puedes leer y editar aquí. Al cerrar se conserva el texto en el
            formulario; utiliza su botón de guardar para guardar los cambios.
          </p>
          <label className="sr-only" htmlFor={id + "-large"}>
            {label} · ventana amplia
          </label>
          <textarea
            ref={modalText}
            id={id + "-large"}
            value={text}
            onChange={(event) => update(event.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
        maxLength={maxLength}
          />
        </div>
      </dialog>
    </div>
  );
}
