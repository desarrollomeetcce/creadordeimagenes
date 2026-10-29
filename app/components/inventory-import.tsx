"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import {
  inventoryDraftRows,
  inventoryImportFields,
  parseInventoryGrid,
  type InventoryImportRow,
} from "../../lib/meta-ads/inventory-paste";
import { useInventoryDuplicateReview } from "./inventory-duplicate-review";
import type { InventoryCategoryState } from "./inventory-category-types";
import { InventorySyllabusChips } from "./inventory-syllabus-chips";
import { InventorySyllabusDraft } from "./inventory-syllabus-draft";
import type { InventorySyllabus } from "../../lib/meta-ads/inventory-syllabi-policy";
import { splitCategoryNames } from "../../lib/meta-ads/category-paste";
const fields = inventoryImportFields;
const titles = [
  "Inventario",
  "Categoría principal",
  "Categorías secundarias",
  "Hojas",
  "Temarios",
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
  const [syllabusEditor, setSyllabusEditor] = useState<{
    row: number;
    value: InventorySyllabus;
  } | null>(null);
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
          className="inventory-dialog-close ui-close-button"
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
        hojas. En Temarios, usa «+» para añadir botones y pulsa cada uno para
        escribir su contenido.
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
            setMessage(
              `Archivo preparado: ${f.name} · ${result.rows.length} filas · ${result.rows.reduce((n: number, r: InventoryImportRow) => n + (r.syllabi?.length ?? 0), 0)} temarios. Revisa y guarda.`,
            );
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
                          if (i + parsed.rows.length > 1500)
                            throw Error("Máximo 1.500 filas.");
                          setRows((old) => {
                            const next = [...old];
                            while (next.length < i + parsed.rows.length)
                              next.push(blank());
                            parsed.rows.forEach((r, n) => {
                              const row = { ...next[i + n] };
                              for (const key of parsed.columns)
                                row[key] = r[key];
                              if (parsed.hasSyllabi)
                                row.syllabi = r.syllabi ?? [];
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
                            return splitCategoryNames(
                              r[k],
                              k === "secondary" ? 100 : 20,
                            );
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
                                  splitCategoryNames(
                                    r[k],
                                    k === "secondary" ? 100 : 20,
                                  )
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
                <td className="inventory-syllabi-cell">
                  <InventorySyllabusChips
                    label={r.name || `fila ${i + 1}`}
                    syllabi={r.syllabi ?? []}
                    disabled={busy}
                    onOpen={(id) => {
                      const value = r.syllabi?.find((s) => s.id === id);
                      if (value) setSyllabusEditor({ row: i, value });
                    }}
                    onRename={(id, title) =>
                      setRows((old) =>
                        old.map((r, n) =>
                          n === i
                            ? {
                                ...r,
                                syllabi: r.syllabi?.map((s) =>
                                  s.id === id ? { ...s, title } : s,
                                ),
                              }
                            : r,
                        ),
                      )
                    }
                    onRemove={(id) =>
                      setRows((old) =>
                        old.map((r, n) =>
                          n === i
                            ? {
                                ...r,
                                syllabi: r.syllabi?.filter((s) => s.id !== id),
                              }
                            : r,
                        ),
                      )
                    }
                    onAdd={() =>
                      setSyllabusEditor({
                        row: i,
                        value: {
                          id: crypto.randomUUID(),
                          title: `Temario ${(r.syllabi?.length ?? 0) + 1}`,
                          scope: "Todo el mundo",
                          content: "",
                        },
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="row">
        <button
          type="button"
          disabled={busy || rows.length >= 1500}
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
              const parsed = inventoryDraftRows(rows);
              const decisions = await duplicates.review(
                parsed.flatMap((r) => [
                  ...splitCategoryNames(r.primary).map((name) => ({
                    kind: "PRIMARY" as const,
                    name,
                  })),
                  ...splitCategoryNames(r.secondary, 100).map((name) => ({
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
        automáticamente. Si una categoría figura en ambas columnas, se conserva
        como principal. Hasta 1.500 filas; XLSX, CSV, TSV y TXT. El archivo
        puede incluir Temario 1, Temario 2 y más columnas de temarios.
      </small>
      {syllabusEditor && (
        <InventorySyllabusDraft
          key={syllabusEditor.value.id}
          value={syllabusEditor.value}
          inventory={
            rows[syllabusEditor.row]?.name || `fila ${syllabusEditor.row + 1}`
          }
          onClose={() => setSyllabusEditor(null)}
          onSave={(value) => {
            setRows((old) =>
              old.map((r, n) =>
                n === syllabusEditor.row
                  ? {
                      ...r,
                      syllabi: r.syllabi?.some((s) => s.id === value.id)
                        ? r.syllabi.map((s) => (s.id === value.id ? value : s))
                        : [...(r.syllabi ?? []), value],
                    }
                  : r,
              ),
            );
            setSyllabusEditor(null);
          }}
        />
      )}
      {duplicates.dialog}
    </dialog>
  );
}
