"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import {
  inventoryRows,
  parseInventoryGrid,
  type InventoryImportRow,
} from "../../lib/meta-ads/inventory-paste";
import { useInventoryDuplicateReview } from "./inventory-duplicate-review";
import type { InventoryCategoryState } from "./inventory-category-types";
import { splitCategoryNames } from "../../lib/meta-ads/category-paste";
const fields = ["primary", "secondary", "name", "sheets"] as const;
const titles = [
  "Categoría principal",
  "Categorías secundarias",
  "Inventario",
  "Hojas",
];
const blank = () => ({ primary: "", secondary: "", name: "", sheets: "" });
export function InventoryImport({
  listId,
  revision,
  config,
  inventoryNames,
  upload = false,
  onClose,
  onSaved,
}: {
  listId: string;
  revision: number;
  config: InventoryCategoryState;
  inventoryNames: string[];
  upload?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const duplicates = useInventoryDuplicateReview();
  const dialog = useRef<HTMLDialogElement>(null),
    file = useRef<HTMLInputElement>(null),
    [rows, setRows] = useState<InventoryImportRow[]>(() =>
      Array.from({ length: 5 }, blank),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    if (upload) file.current?.click();
  }, [upload]);
  const update = (i: number, k: (typeof fields)[number], v: string) =>
    setRows((old) => old.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-import-dialog"
      aria-label="Pegar inventario"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>Pegar inventario</h2>
        <button
          type="button"
          className="inventory-dialog-close"
          aria-label="Cerrar Pegar inventario"
          title="Cerrar sin guardar"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p>
        Completa solo las columnas que necesites. Puedes pegar una columna de
        categorías o inventario. Las categorías vacías quedan sin categoría; sin
        Hojas, el ítem se guarda sin asignación. Las comas separan categorías y
        hojas.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => file.current?.click()}
      >
        Importar inventario
      </button>
      <input
        hidden
        ref={file}
        type="file"
        accept=".xlsx,.csv,.tsv,.txt"
        aria-label="Archivo de inventario"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setError("");
          try {
            if (f.size > 2000000) throw Error("Máximo 2 MB.");
            const content = await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result).split(",")[1]);
              r.onerror = () => reject(Error("No se pudo leer el archivo."));
              r.readAsDataURL(f);
            });
            const result = await api("meta-ads/inventory/file", "POST", {
              name: f.name,
              content,
            });
            setRows(result.rows);
            setMessage(`Archivo preparado: ${f.name}. Revisa y guarda.`);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
            if (file.current) file.current.value = "";
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="table-scroll">
        <table className="category-paste-grid">
          <thead>
            <tr>
              {titles.map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {fields.map((k, col) => (
                  <td key={k}>
                    <input
                      aria-label={`${titles[col]} fila ${i + 1}`}
                      value={r[k]}
                      disabled={busy}
                      onChange={(e) => update(i, k, e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text/plain");
                        if (!/[\t\r\n]/.test(text)) return;
                        e.preventDefault();
                        try {
                          const parsed = parseInventoryGrid(text, false, col);
                          if (i + parsed.rows.length > 500)
                            throw Error("Máximo 500 filas.");
                          setRows((old) => {
                            const next = [...old];
                            while (next.length < i + parsed.rows.length)
                              next.push(blank());
                            parsed.rows.forEach((r, n) => {
                              const row = { ...next[i + n] };
                              for (const key of parsed.columns)
                                row[key] = r[key];
                              next[i + n] = row;
                            });
                            return next;
                          });
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    />
                    {k !== "name" && (
                      <div className="inventory-category-chips">
                        {(() => {
                          try {
                            return splitCategoryNames(r[k]);
                          } catch {
                            return [];
                          }
                        })().map((n) => (
                          <span key={n} className="inventory-category-chip">
                            {n}
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`Quitar ${n} de ${titles[col]} fila ${i + 1}`}
                              onClick={() =>
                                update(
                                  i,
                                  k,
                                  splitCategoryNames(r[k])
                                    .filter((x) => x !== n)
                                    .join(", "),
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="row">
        <button
          type="button"
          disabled={busy || rows.length >= 500}
          onClick={() => setRows((old) => [...old, blank()])}
        >
          + Fila
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            let committed = false;
            try {
              const parsed = inventoryRows(
                rows.map((r) => fields.map((k) => r[k])),
              );
              const decisions = await duplicates.review(
                parsed.flatMap((r) => [
                  ...splitCategoryNames(r.primary).map((name) => ({
                    kind: "PRIMARY" as const,
                    name,
                  })),
                  ...splitCategoryNames(r.secondary).map((name) => ({
                    kind: "SECONDARY" as const,
                    name,
                  })),
                  ...(r.name
                    ? [{ kind: "INVENTORY" as const, name: r.name }]
                    : []),
                ]),
                [
                  ...config.categories.map((c) => ({
                    kind: c.kind,
                    name: c.name,
                  })),
                  ...inventoryNames.map((name) => ({
                    kind: "INVENTORY" as const,
                    name,
                  })),
                ],
              );
              await api("meta-ads/inventory/import", "POST", {
                listId,
                decisions,
                revision,
                rows: parsed,
              });
              committed = true;
              await onSaved();
              onClose();
            } catch (e) {
              setError(
                committed
                  ? "Guardado. Recarga el inventario para ver los cambios."
                  : (e as Error).message,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Guardar inventario
        </button>
      </footer>
      <small>
        Solo categorías: se añaden al listado de categorías. Solo inventario: se
        guarda sin categorías ni hojas. Las celdas vacías no se completan
        automáticamente. Hasta 500 filas; XLSX, CSV, TSV y TXT.
      </small>
      {duplicates.dialog}
    </dialog>
  );
}
