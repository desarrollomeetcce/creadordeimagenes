"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ImagePreviewModal({
  id,
  name,
  revision,
  onClose,
  subproductHref, sourceNotice,
  onPrevious,
  onNext,
}: {
  id: string;
  name: string;
  revision?: number;
  onClose: () => void;
  subproductHref?:string;
  sourceNotice?:string|null;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [full, setFull] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    setFailed(false);
  }, [id, revision]);
  return createPortal(
    <dialog
      ref={dialog}
      className={`image-preview-modal${full ? " fullscreen" : ""}`}
      aria-label={`Vista ampliada · ${name}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="image-preview-bar">
        <strong>{name}</strong>
        {sourceNotice?<span className="source-deleted-notice">{sourceNotice}</span>:subproductHref&&<a className="button" href={subproductHref}>Volver al subproducto ↗</a>}
        <button
          type="button"
          onClick={() => setFull(!full)}
          aria-pressed={full}
        >
          {full ? "Restaurar tamaño" : "Pantalla completa"}
        </button>
        <button
          ref={closeButton}
          type="button"
          className="window-close"
          aria-label="Cerrar imagen ampliada"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {(onPrevious || onNext) && (
        <div className="row image-preview-navigation">
          <button type="button" disabled={!onPrevious} onClick={onPrevious}>
            Anterior
          </button>
          <button type="button" disabled={!onNext} onClick={onNext}>
            Siguiente
          </button>
        </div>
      )}
      <div className="image-preview-content">
        {failed ? (
          <p role="alert">
            No se pudo cargar la imagen. Cierra esta ventana y vuelve a
            intentarlo.
          </p>
        ) : (
          <img
            src={`/api/variations/${id}${revision === undefined ? "" : `?v=${revision}`}`}
            alt={name}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </dialog>,
    document.body,
  );
}
