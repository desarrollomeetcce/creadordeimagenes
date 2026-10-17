"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VariationEditor } from "./variation-editor";
export function ImageEditorModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [full, setFull] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className={"image-editor-modal " + (full ? "fullscreen" : "")}
      aria-label="Editor de imagen"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="row spread editor-window-bar">
        <strong>Editor de imagen</strong>
        <button type="button" onClick={() => setFull(!full)}>
          {full ? "Restaurar tamaño" : "Ampliar a pantalla completa"}
        </button>
      </div>
      <VariationEditor id={id} onClose={onClose} />
    </dialog>,
    document.body,
  );
}
