"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import {
  catalogPackageSchema,
  type InventoryCatalogPackage,
} from "../../lib/meta-ads/inventory-syllabi-policy";
type Preview = {
  targetId: string | null;
  targetName: string;
  token: string;
  items: number;
  newItems: number;
  existingItems: number;
  syllabi: number;
  categories: string[];
  createTarget: boolean;
};
export function InventoryPackageImport({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (listId: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [data, setData] = useState<InventoryCatalogPackage | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function review(p: InventoryCatalogPackage) {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await api("meta-ads/inventory/package/preview", "POST", p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-package-dialog"
      aria-label="Cargar catálogo preparado"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>Cargar catálogo preparado</h2>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      <p>
        El archivo incluye inventarios, categorías y temarios. Se carga en la
        pestaña indicada en el archivo, que se crea si todavía no existe.
      </p>
      <label>
        Archivo privado del catálogo
        <input
          type="file"
          accept=".json,.inventario.json"
          aria-label="Archivo del catálogo preparado"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError("");
            setPreview(null);
            try {
              if (file.size > 7000000) throw Error("El archivo supera7MB.");
              const p = catalogPackageSchema.parse(
                JSON.parse(await file.text()),
              );
              setData(p);
              await review(p);
            } catch (e) {
              setData(null);
              setError(e instanceof Error ? e.message : "Archivo no válido.");
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Procesando catálogo…</p>}
      {data && !preview && !busy && (
        <button type="button" onClick={() => void review(data)}>
          Revisar de nuevo
        </button>
      )}
      {preview && (
        <>
          <div className="inventory-package-preview">
            <h3>Destino: {preview.targetName}</h3>
            <p>
              {preview.createTarget
                ? "Se creará esta pestaña de Inventario."
                : "Se reutilizará la pestaña existente."}
            </p>
            <div className="row">
              <span>
                <strong>{preview.items}</strong> ítems únicos
              </span>
              <span>
                <strong>{preview.newItems}</strong> nuevos
              </span>
              <span>
                <strong>{preview.existingItems}</strong> existentes
              </span>
              <span>
                <strong>{preview.syllabi}</strong> temarios en el archivo
              </span>
            </div>
            <p>{preview.categories.join(" · ")}</p>
          </div>
          <p className="hint">
            Los ítems nuevos quedan sin hojas asignadas. Se conservan las
            categorías y los temarios existentes; los nombres equivalentes y
            temarios repetidos se reutilizan. La carga es completa y no cambia
            ventas, asesores ni campañas.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              if (!data) return;
              setBusy(true);
              setError("");
              let committed = false;
              try {
                const result = await api(
                  "meta-ads/inventory/package/import",
                  "POST",
                  { package: data, token: preview.token },
                );
                committed = true;
                await onSaved(result.listId);
                onClose();
              } catch (e) {
                setError(
                  committed
                    ? "El catálogo quedó guardado. Actualiza la página y abre el inventario de destino."
                    : e instanceof Error
                      ? e.message
                      : "No se pudo confirmar la carga. Revisa de nuevo antes de repetir.",
                );
                setPreview(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Cargar en {preview.targetName}
          </button>
        </>
      )}
    </dialog>
  );
}
