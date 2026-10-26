"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { EffectivenessCell } from "./effectiveness-cell";
type Table = {
  id: string;
  name: string;
  aliases: { id: string; name: string; inventorySheetId?: string }[];
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
export function InventoryCatalog({
  tables,
  listId = "default-inventory",
  initialTableId,
  sheetTabs,
  onChanged,
}: {
  listId?: string;
  tables: Table[];
  initialTableId: string;
  sheetTabs: ReactNode;
  onChanged: () => Promise<void>;
}) {
  const [sheet, setSheet] = useWorkbookPreference<string>(listId, "sheet", ""),
    [item, setItem] = useWorkbookPreference<string>(listId, "item", ""),
    [query, setQuery] = useWorkbookPreference<string>(listId, "query", ""),
    [target, setTarget] = useWorkbookPreference<string>(
      listId,
      "target",
      initialTableId || tables[0]?.id || "",
    ),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const items = tables
    .flatMap((t) =>
      t.aliases
        .filter((a) => (a.inventorySheetId ?? "default-inventory") === listId)
        .map((a) => ({ ...a, tableId: t.id, tableName: t.name })),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "es") ||
        a.tableName.localeCompare(b.tableName, "es"),
    );
  useEffect(() => {
    if (target && !tables.some((t) => t.id === target))
      setTarget(tables[0]?.id ?? "");
    if (sheet && !tables.some((t) => t.id === sheet)) {
      setSheet("");
      setItem("");
    }
    if (item && !tables.some((t) => t.aliases.some((a) => a.id === item)))
      setItem("");
  }, [tables, target, sheet, item]);
  const grouped = new Map<string, { name: string; links: typeof items }>();
  for (const a of items) {
    if (!grouped.has(a.name)) grouped.set(a.name, { name: a.name, links: [] });
    grouped.get(a.name)!.links.push(a);
  }
  const available = [...grouped.values()].filter(
      (g) => !sheet || g.links.some((a) => a.tableId === sheet),
    ),
    words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const visible = available.filter(
    (g) =>
      (!item || g.name === items.find((a) => a.id === item)?.name) &&
      words.every((w) => normalize(g.name).includes(w)),
  );
  const [removing, setRemoving] = useState(false),
    [review, setReview] = useState<{
      id: string;
      name: string;
      table: { id: string; name: string };
      rows: number;
      days: number;
      assignments: number;
      token: string;
    } | null>(null),
    [deleteError, setDeleteError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (review) dialog.current?.showModal();
  }, [review]);
  const prepareRemoval = async (id: string) => {
    setBusy(true);
    setMessage("");
    setDeleteError("");
    try {
      setReview(await api("meta-ads/aliases/" + id + "/delete-preview"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="inventory-catalog sheet-view"
      aria-label="Inventario sin países"
    >
      <div className="row sheet-toolbar">
        <strong>Inventario</strong>
        <input
          aria-label="Buscar inventario en catálogo"
          placeholder="Buscar por palabra…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <SheetSearchSelect
          label="Hoja del inventario"
          value={sheet}
          placeholder="Todas las hojas"
          options={[
            { value: "", label: "Todas las hojas" },
            ...tables.map((t) => ({ value: t.id, label: t.name })),
          ]}
          onSelect={(id) => {
            setSheet(id);
            setItem("");
          }}
        />
        <SheetSearchSelect
          label="Inventario del catálogo"
          value={item}
          placeholder="Todo el inventario"
          options={[
            { value: "", label: "Todo el inventario" },
            ...available.map((g) => ({ value: g.links[0].id, label: g.name })),
          ]}
          onSelect={setItem}
        />
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setItem("");
            setSheet("");
          }}
        >
          Todos
        </button>
        <button
          type="button"
          className={removing ? "danger" : ""}
          aria-pressed={removing}
          onClick={() => setRemoving((v) => !v)}
        >
          Eliminar de las hojas
        </button>
        {removing && (
          <span className="sheet-help">
            Pulsa × junto a la hoja que quieres quitar.
          </span>
        )}
      </div>
      <form
        className="row sheet-toolbar"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!target || !name.trim()) return;
          setBusy(true);
          setMessage("");
          try {
            const created = await api("meta-ads/aliases", "POST", {
              inventorySheetId: listId,
              tableId: target,
              name: name.trim(),
            });
            await onChanged();
            setQuery("");
            setSheet(target);
            setItem(created.id);
            setName("");
            setMessage(
              "Inventario agregado. El país se configura en la hoja correspondiente.",
            );
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Nuevo ítem del inventario"
          value={name}
          maxLength={150}
          placeholder="Nombre del diplomado o ítem…"
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <SheetSearchSelect
          label="Agregar inventario a la hoja"
          value={target}
          placeholder="Elige una hoja"
          options={tables.map((t) => ({ value: t.id, label: t.name }))}
          onSelect={setTarget}
        />
        <button disabled={busy || !target || !name.trim()}>
          Agregar al inventario
        </button>
      </form>
      {message && (
        <p role="status" className="sheet-message">
          {message}
        </p>
      )}
      {sheetTabs}
      <div className="table-scroll">
        <table className="inventory-catalog-grid">
          <thead>
            <tr>
              <th>Inventario ({visible.length})</th>
              <th>Hojas</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => (
              <tr key={g.name} data-inventory-name={g.name}>
                <td>
                  <EffectivenessCell
                    label={`Nombre de inventario ${g.name}`}
                    value={g.name}
                    onError={setMessage}
                    onSave={async (value) => {
                      await api("meta-ads/inventory/rename", "POST", {
                        listId,
                        expectedName: g.name,
                        name: value.trim(),
                        ids: g.links.map((a) => a.id),
                      });
                      await onChanged();
                    }}
                  />
                </td>
                <td>
                  <div className="inventory-sheet-links">
                    {g.links.map((a) => (
                      <span
                        key={a.id}
                        className="inventory-sheet-chip"
                        data-inventory-id={a.id}
                      >
                        {a.tableName}
                        {removing && (
                          <button
                            type="button"
                            className="inventory-remove"
                            aria-label={`Eliminar ${g.name} de ${a.tableName}`}
                            title={`Eliminar solo de ${a.tableName}`}
                            disabled={busy}
                            onClick={() => void prepareRemoval(a.id)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="sheet-help">
            No hay elementos que coincidan con los filtros.
          </p>
        )}
      </div>
      <dialog
        ref={dialog}
        className="meta-detail inventory-delete-dialog"
        aria-label="Eliminar inventario de una hoja"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setReview(null);
        }}
      >
        {review && (
          <>
            <h2>Eliminar de «{review.table.name}»</h2>
            <p>
              Se quitará «{review.name}» de esta hoja: {review.rows} filas y{" "}
              {review.days} días con datos manuales. Se retirarán{" "}
              {review.assignments} asignaciones internas en Meta.
            </p>
            <p>
              Las otras hojas conservarán este inventario. Esta eliminación no
              se puede deshacer.
            </p>
            {deleteError && <p role="alert">{deleteError}</p>}
            <div className="row">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  dialog.current?.close();
                  setReview(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setDeleteError("");
                  let committed = false;
                  try {
                    await api("meta-ads/aliases/" + review.id, "DELETE", {
                      token: review.token,
                    });
                    committed = true;
                    dialog.current?.close();
                    setReview(null);
                    await onChanged();
                    setMessage(
                      "Inventario eliminado únicamente de «" +
                        review.table.name +
                        "».",
                    );
                  } catch (e) {
                    if (committed)
                      setMessage(
                        "Eliminado. Recarga para ver la lista actualizada.",
                      );
                    else setDeleteError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Eliminar de esta hoja
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
