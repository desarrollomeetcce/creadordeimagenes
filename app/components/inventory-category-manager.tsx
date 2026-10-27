"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import {
  parseCategoryText,
  categoryRows,
  splitCategoryNames,
  type CategoryImportRow,
} from "../../lib/meta-ads/category-paste";
import type {
  InventoryCategoryState,
  InventoryCategoryAction,
  InventoryCategory,
} from "./inventory-category-types";
const blanks = () =>
  Array.from({ length: 6 }, () => ({ primary: "", secondary: "" }));
export function InventoryCategoryManager({
  config,
  selectedIds,
  selectedCount,
  initialView = "paste",
  onClose,
  onSave,
  onRefresh,
}: {
  config: InventoryCategoryState;
  selectedIds: string[];
  selectedCount: number;
  initialView?: "paste" | "catalog";
  onClose: () => void;
  onSave: (action: InventoryCategoryAction) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    file = useRef<HTMLInputElement>(null);
  const [view, setView] = useState(initialView),
    [rows, setRows] = useState<CategoryImportRow[]>(blanks),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [remove, setRemove] = useState(false),
    [apply, setApply] = useState(false),
    [deleting, setDeleting] = useState<InventoryCategory | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const names = (text: string) => {
    try {
      return splitCategoryNames(text);
    } catch {
      return [];
    }
  };
  const update = (index: number, key: "primary" | "secondary", value: string) =>
    setRows((old) =>
      old.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    );
  const paste = (text: string, index: number, key: "primary" | "secondary") => {
    if (!/[\t\n\r]/.test(text)) return false;
    try {
      const next = parseCategoryText(text);
      if (index + next.length > 500) throw Error("Se admiten hasta 500 filas.");
      if (key === "secondary" && next.some((r) => r.secondary))
        throw Error("Pega las dos columnas comenzando en Categoría principal.");
      setRows((old) => {
        const out = [...old];
        while (out.length < index + next.length)
          out.push({ primary: "", secondary: "" });
        next.forEach((r, n) => {
          out[index + n] =
            key === "primary" ? r : { ...out[index + n], secondary: r.primary };
        });
        return out;
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
    return true;
  };
  const importFile = async (f: File) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (f.size > 2000000) throw Error("El archivo admite hasta 2 MB.");
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(Error("No se pudo leer el archivo."));
        reader.readAsDataURL(f);
      });
      const result = await api("meta-ads/inventory/categories/file", "POST", {
        name: f.name,
        content,
      });
      setRows(result.rows);
      setView("paste");
      setMessage(
        `Archivo preparado: ${f.name}${result.sheetName ? " · " + result.sheetName : ""}. Revisa las categorías y pulsa Guardar.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  const run = async (action: InventoryCategoryAction) => {
    setBusy(true);
    setError("");
    try {
      await onSave(action);
      setDeleting(null);
      if (action.action === "IMPORT") {
        setView("catalog");
        setRows(blanks());
        setMessage(
          apply
            ? `Categorías añadidas a ${selectedCount} ítems marcados.`
            : "Catálogo guardado. Ahora puedes asignar sus categorías a cada ítem.",
        );
      } else setMessage("Categoría eliminada del catálogo.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const related = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of config.relations) {
      if (!map.has(r.primaryId)) map.set(r.primaryId, new Set());
      map.get(r.primaryId)!.add(r.secondaryId);
    }
    return map;
  }, [config.relations]);
  const primary = config.categories.filter((c) => c.kind === "PRIMARY"),
    secondary = config.categories.filter((c) => c.kind === "SECONDARY"),
    linked = new Set(config.relations.map((r) => r.secondaryId));
  const chip = (c: InventoryCategory) => (
    <span
      className={"inventory-category-chip " + c.kind.toLowerCase()}
      key={c.id}
    >
      {c.name}
      {remove && (
        <button
          type="button"
          disabled={busy}
          aria-label={`Eliminar categoría ${c.name} del catálogo`}
          onClick={() => setDeleting(c)}
        >
          ×
        </button>
      )}
    </span>
  );
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-category-manager"
      aria-label="Categorías del inventario"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>Categorías del inventario</h2>
        <button type="button" disabled={busy} onClick={onClose}>
          Cerrar
        </button>
      </header>
      <div className="row category-manager-tabs">
        <button
          type="button"
          aria-pressed={view === "paste"}
          onClick={() => setView("paste")}
        >
          Pegar categorías
        </button>
        <button
          type="button"
          aria-pressed={view === "catalog"}
          onClick={() => setView("catalog")}
        >
          Catálogo ({config.categories.length})
        </button>
        <button
          type="button"
          aria-pressed={remove}
          onClick={() => setRemove((v) => !v)}
        >
          Eliminar categorías
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          Subir archivo
        </button>
        <input
          ref={file}
          type="file"
          hidden
          aria-label="Archivo de categorías"
          accept=".xlsx,.csv,.tsv,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="sheet-message">
          {error}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRefresh();
                setError("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Recargar categorías
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="sheet-message">
          {message}
        </p>
      )}
      {view === "paste" ? (
        <>
          <p>
            Pega desde Excel: primera columna, categorías principales; segunda,
            secundarias. Separa varias categorías de una celda con comas.
            También puedes editar las celdas antes de guardar.
          </p>
          <div className="table-scroll category-paste-scroll">
            <table className="category-paste-grid">
              <thead>
                <tr>
                  <th>Categoría principal</th>
                  <th>Categorías secundarias</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, index) => (
                  <tr key={index}>
                    {(["primary", "secondary"] as const).map((key) => (
                      <td key={key}>
                        <input
                          aria-label={`${key === "primary" ? "Categoría principal" : "Categorías secundarias"} fila ${index + 1}`}
                          value={r[key]}
                          disabled={busy}
                          maxLength={2000}
                          placeholder={
                            key === "primary"
                              ? "Ambiental, Civil"
                              : "Agua, Estructuras"
                          }
                          onChange={(e) => update(index, key, e.target.value)}
                          onPaste={(e) => {
                            if (
                              paste(
                                e.clipboardData.getData("text/plain"),
                                index,
                                key,
                              )
                            )
                              e.preventDefault();
                          }}
                          onKeyDown={(e) => {
                            if (
                              ["Enter", "ArrowDown", "ArrowUp"].includes(e.key)
                            ) {
                              const next =
                                index + (e.key === "ArrowUp" ? -1 : 1);
                              if (next < 0 || next >= 500) return;
                              e.preventDefault();
                              if (next >= rows.length)
                                setRows((old) => [
                                  ...old,
                                  { primary: "", secondary: "" },
                                ]);
                              requestAnimationFrame(() =>
                                dialog.current
                                  ?.querySelector<HTMLInputElement>(
                                    `[aria-label="${key === "primary" ? "Categoría principal" : "Categorías secundarias"} fila ${next + 1}"]`,
                                  )
                                  ?.focus(),
                              );
                            }
                          }}
                        />
                        <div className="inventory-category-chips">
                          {names(r[key]).map((name) => (
                            <span
                              className="inventory-category-chip"
                              key={name}
                            >
                              {name}
                              {remove && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  aria-label={`Quitar ${name} de fila ${index + 1} ${key}`}
                                  onClick={() =>
                                    update(
                                      index,
                                      key,
                                      names(r[key])
                                        .filter((n) => n !== name)
                                        .join(", "),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row category-manager-actions">
            <button
              type="button"
              disabled={busy || rows.length >= 500}
              onClick={() =>
                setRows((old) => [...old, { primary: "", secondary: "" }])
              }
            >
              + Fila
            </button>
            <label>
              <input
                type="checkbox"
                checked={apply}
                disabled={busy || !selectedIds.length}
                onChange={(e) => setApply(e.target.checked)}
              />
              También añadir a {selectedCount} ítems marcados
            </label>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => {
                try {
                  const parsed = categoryRows(
                    rows.map((r) => [r.primary, r.secondary]),
                  );
                  void run({
                    action: "IMPORT",
                    rows: parsed,
                    ...(apply && selectedIds.length
                      ? { targetIds: selectedIds }
                      : {}),
                  });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Guardar categorías
            </button>
          </div>
          <small>
            Sin marcar esta opción, se crea solo el catálogo. Si la marcas,
            todas las categorías pegadas se añaden a cada ítem seleccionado.
            Formatos: Excel .xlsx, CSV, TSV y TXT; hasta 500 filas.
          </small>
        </>
      ) : (
        <>
          <p>
            Estas categorías están disponibles para asignarlas a los ítems de
            esta lista.
          </p>
          <div className="table-scroll">
            <table className="category-catalog-grid">
              <thead>
                <tr>
                  <th>Categoría principal</th>
                  <th>Categorías secundarias</th>
                </tr>
              </thead>
              <tbody>
                {primary.map((p) => (
                  <tr key={p.id}>
                    <td>{chip(p)}</td>
                    <td>
                      <div className="inventory-category-chips">
                        {secondary
                          .filter((s) => related.get(p.id)?.has(s.id))
                          .map(chip)}
                      </div>
                    </td>
                  </tr>
                ))}
                {secondary.some((s) => !linked.has(s.id)) && (
                  <tr>
                    <td>Sin principal</td>
                    <td>
                      <div className="inventory-category-chips">
                        {secondary.filter((s) => !linked.has(s.id)).map(chip)}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!config.categories.length && (
            <p>
              Todavía no hay categorías. Usa Pegar categorías o Subir archivo.
            </p>
          )}
        </>
      )}
      {deleting && (
        <section
          className="category-delete-review"
          aria-label="Confirmar eliminación de categoría"
        >
          <p>
            Se eliminará «{deleting.name}» del catálogo y de{" "}
            {
              Object.values(config.assignments).filter((ids) =>
                ids.includes(deleting.id),
              ).length
            }{" "}
            registros del inventario. Los ítems y sus cifras se conservarán.
          </p>
          <div className="row">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancelar eliminación
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() =>
                void run({ action: "DELETE", categoryId: deleting.id })
              }
            >
              Eliminar categoría del catálogo
            </button>
          </div>
        </section>
      )}
    </dialog>
  );
}
