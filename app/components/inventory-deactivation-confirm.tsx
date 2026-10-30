"use client";
import { useEffect, useRef, useState } from "react";
export type InventoryActivationSelection = {
  name: string;
  targets: { aliasId: string; country: string; revision: number }[];
}[];
export function InventoryDeactivationConfirm({
  names,
  sheetName,
  onConfirm,
  onClose,
}: {
  names: string[];
  sheetName: string;
  onConfirm: (pin: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const confirm = async (pin: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(pin);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="trial-dialog inventory-deactivation-confirm"
      aria-label="Confirmar desactivación del diplomado"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2>
          {names.length === 1
            ? "Vas a desactivar este diplomado"
            : `Vas a desactivar ${names.length} diplomados`}
        </h2>
      </header>
      <p>
        <strong>{names.length === 1 ? names[0] : sheetName}</strong>
        {names.length === 1 ? ` · ${sheetName}` : ""}
      </p>
      <p>
        ¿Deseas mantener{names.length === 1 ? "lo" : "los"} fijado
        {names.length === 1 ? "" : "s"} en la hoja?
      </p>
      <small>
        Al fijarlo, seguirá visible aunque esté desactivado. Sus datos se
        conservan.
      </small>
      <footer>
        <button
          type="button"
          className="inventory-picker-add"
          disabled={busy}
          onClick={() => void confirm(true)}
        >
          Desactivar y fijar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm(false)}
        >
          Solo desactivar
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </footer>
    </dialog>
  );
}
