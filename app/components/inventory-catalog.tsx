"use client";
import { useEffect, useState, type ReactNode } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { EffectivenessCell } from "./effectiveness-cell";
type Table = {
  id: string;
  name: string;
  aliases: { id: string; name: string }[];
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
export function InventoryCatalog({
  tables,
  initialTableId,
  sheetTabs,
  onChanged,
}: {
  tables: Table[];
  initialTableId: string;
  sheetTabs: ReactNode;
  onChanged: () => Promise<void>;
}) {
  const [sheet, setSheet] = useState(""),
    [item, setItem] = useState(""),
    [query, setQuery] = useState(""),
    [target, setTarget] = useState(initialTableId || tables[0]?.id || ""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const items = tables
    .flatMap((t) =>
      t.aliases.map((a) => ({ ...a, tableId: t.id, tableName: t.name })),
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
  const available = items.filter((a) => !sheet || a.tableId === sheet),
    words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const visible = available.filter(
    (a) =>
      (!item || a.id === item) &&
      words.every((w) => normalize(a.name).includes(w)),
  );
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
            ...available.map((a) => ({
              value: a.id,
              label: a.name + (sheet ? "" : " · " + a.tableName),
            })),
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
              <th>Hoja</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id} data-inventory-id={a.id}>
                <td>
                  <EffectivenessCell
                    label={`Nombre de inventario ${a.name} · ${a.tableName}`}
                    value={a.name}
                    onError={setMessage}
                    onSave={async (value) => {
                      await api("meta-ads/aliases/" + a.id, "PATCH", {
                        name: value.trim(),
                      });
                      await onChanged();
                    }}
                  />
                </td>
                <td>{a.tableName}</td>
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
    </section>
  );
}
