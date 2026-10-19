"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VariationEditor } from "./variation-editor";
export function ImageEditorModal({
  id,
  onClose,
  subproductHref, sourceNotice,
}: {
  id: string;
  onClose: () => void;
  subproductHref?:string;
  sourceNotice?:string|null;
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
        {sourceNotice?<span className="source-deleted-notice">{sourceNotice}</span>:subproductHref&&<a className="button" href={subproductHref}>Volver al subproducto ↗</a>}
        <button type="button" onClick={() => setFull(!full)}>
          {full ? "Restaurar tamaño" : "Ampliar a pantalla completa"}
        </button>
        <button type="button" className="window-close" aria-label="Cerrar editor de imagen" onClick={onClose}>×</button>
      </div>
      <VariationEditor id={id} onClose={onClose} />
    </dialog>,
    document.body,
  );
}
