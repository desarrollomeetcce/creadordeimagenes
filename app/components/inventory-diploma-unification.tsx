"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";
import { countryName } from "../../lib/meta-ads/countries";
import type { TrialItem } from "../../lib/meta-ads/inventory-trial-policy";
import type { InventoryUnificationPreview } from "../../lib/meta-ads/inventory-unification";
export function InventoryDiplomaUnification({
  listId,
  sourceIds,
  catalog,
  onClose,
  onUnified,
}: {
  listId: string;
  sourceIds: string[];
  catalog: TrialItem[];
  onClose: () => void;
  onUnified: (result: {
    sourceIds: string[];
    targetId: string;
    targetName: string;
  }) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [targetId, setTargetId] = useState(""),
    [preview, setPreview] = useState<InventoryUnificationPreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false),
    [committed, setCommitted] = useState(false),
    [requestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function review() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(
        await api("meta-ads/inventory/unify-preview", "POST", {
          listId,
          sourceIds,
          targetId,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!preview?.ready || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    let saved = false;
    try {
      const result = await api("meta-ads/inventory/unify", "POST", {
        listId,
        sourceIds,
        targetId,
        token: preview.token,
        requestId,
      });
      saved = true;
      setCommitted(true);
      await onUnified(result);
    } catch (e) {
      setError(
        (saved ? "Unificación guardada. Cierra y actualiza la vista. " : "") +
          (e as Error).message,
      );
      if (!saved && (e as { status?: number }).status === 409) setPreview(null);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-unification"
      data-expanded={expanded || undefined}
      aria-label="Unificar con diplomado oficial"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>Unificar con el diplomado oficial</h2>
        <button
          type="button"
          aria-label={
            expanded ? "Restaurar unificación" : "Maximizar unificación"
          }
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Restaurar" : "Maximizar"}
        </button>
        <button
          type="button"
          className="ui-close-button"
          aria-label="Cerrar unificación"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p>
        Los duplicados pasarán a la ficha oficial conservando cada hoja, país,
        ventas, gasto e historial. Las campañas vinculadas seguirán al nombre
        oficial automáticamente.
      </p>
      <label>
        Diplomado oficial
        <SheetSearchSelect
          label="Elegir diplomado oficial"
          placeholder="Busca el diplomado correcto…"
          value={targetId}
          options={catalog
            .filter((item) => !sourceIds.includes(item.id))
            .map((item) => ({ value: item.id, label: item.name }))}
          disabled={busy || committed}
          onSelect={(id) => {
            setTargetId(id);
            setPreview(null);
            setError("");
          }}
        />
      </label>
      <small>Duplicados seleccionados:</small>
      <ul>
        {sourceIds.map((id) => (
          <li key={id}>
            {catalog.find((item) => item.id === id)?.name ??
              "Registro no disponible"}
          </li>
        ))}
      </ul>
      {preview && (
        <section
          className="inventory-unification-preview"
          aria-label="Vista previa de unificación"
        >
          <strong>Destino: {preview.target.name}</strong>
          {preview.sheets.map((sheet, index) => (
            <div key={index}>
              <b>{sheet.name}</b>
              <span>
                {sheet.from} → {sheet.to}
              </span>
              <small>
                {sheet.countries.map(countryName).join(" · ") ||
                  "Sin país registrado"}{" "}
                · {sheet.days} días guardados · {sheet.campaigns} elementos Meta
                vinculados
              </small>
            </div>
          ))}
          {!preview.sheets.length && (
            <p>
              Se unificará la ficha del catálogo. No tiene hojas vinculadas.
            </p>
          )}
          {preview.reasons.map((reason) => (
            <p role="alert" key={reason}>
              {reason}
            </p>
          ))}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          {committed ? "Cerrar" : "Cancelar"}
        </button>
        {!committed &&
          (preview?.ready ? (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? "Unificando…" : "Aceptar unificación"}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={busy || !targetId}
              onClick={() => void review()}
            >
              {busy
                ? "Revisando…"
                : preview
                  ? "Revisar de nuevo"
                  : "Revisar unificación"}
            </button>
          ))}
      </footer>
    </dialog>
  );
}
