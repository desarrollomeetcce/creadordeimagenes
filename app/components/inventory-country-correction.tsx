"use client";
import { useEffect, useRef, useState } from "react";
import type {
  CountryCorrectionInput,
  CountryCorrectionPreview,
} from "../../lib/meta-ads/inventory-country-correction";
import { countryName } from "../../lib/meta-ads/countries";
import { financialRequest as api } from "./financial-request";

export function InventoryCountryCorrection({
  listId,
  items,
  onSaved,
  onClose,
}: CountryCorrectionInput & {
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [preview, setPreview] = useState<CountryCorrectionPreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [review, setReview] = useState(0);
  const requestItems = JSON.stringify(items);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    setPreview(null);
    setError("");
    api("meta-ads/inventory/country-correction/preview", "POST", {
      listId,
      items: JSON.parse(requestItems),
    })
      .then((p) => {
        if (alive) setPreview(p);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [listId, requestItems, review]);
  const ready = preview?.items.filter((i) => i.ready).length ?? 0;
  return (
    <dialog
      ref={dialog}
      className="trial-dialog"
      aria-label="Corregir asociación de país"
      onCancel={(e) => {
        if (pending.current) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2>Corregir asociación</h2>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar corrección"
        >
          ×
        </button>
      </header>
      <p>
        Traslada cada diplomado a la hoja de su país registrado. Conserva
        ventas, fechas, asesores, activación, historial y vínculos de Meta. Los
        datos de otros países permanecen en su hoja.
      </p>
      {!preview && !error && (
        <p role="status">Revisando destinos e históricos…</p>
      )}
      {preview && (
        <ul>
          {preview.items.map((i) => (
            <li key={i.aliasId + i.country} style={{ marginBottom: "1rem" }}>
              <strong>
                {i.name} · {countryName(i.country)}
              </strong>
              <br />
              {i.sourceTable} → {i.targetTable}
              {i.createsTable && i.ready ? " (se creará la hoja)" : ""}
              <br />
              <small>
                {i.days} días guardados · {i.objects} elementos de Meta
                vinculados
              </small>
              {i.reason && <p role="status">{i.reason}</p>}
            </li>
          ))}
        </ul>
      )}
      <p>
        Los totales y las bases manuales generales de cada hoja se conservan en
        su origen; no se atribuyen a un diplomado.
      </p>
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setReview((n) => n + 1)}
          >
            Revisar de nuevo
          </button>
        </>
      )}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={async () => {
            if (pending.current || !preview) return;
            pending.current = true;
            setBusy(true);
            setError("");
            let committed = false;
            try {
              await api("meta-ads/inventory/country-correction", "POST", {
                listId,
                items,
                token: preview.token,
              });
              committed = true;
              setPreview(null);
              await onSaved();
              onClose();
            } catch (e) {
              setError(
                (committed
                  ? "La corrección se guardó. Actualiza la lista: "
                  : "") + (e as Error).message,
              );
              if (!committed) setPreview(null);
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Corrigiendo…"
            : `Corregir ${ready} ${ready === 1 ? "asociación" : "asociaciones"}`}
        </button>
      </footer>
    </dialog>
  );
}
