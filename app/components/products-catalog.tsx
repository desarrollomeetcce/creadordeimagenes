"use client";
import { useEffect, useRef, useState, useId } from "react";
import { engineRequest as api } from "./generation-engine";
import { useSheetOrder } from "./use-sheet-order";
import { InventoryCatalog } from "./inventory-catalog";
import { MetaEffectiveness } from "./meta-effectiveness";
import { DeleteAliasTable } from "./delete-alias-table";
import { AdvisorsSheet } from "./advisors-sheet";
import { EffectivenessTotals } from "./effectiveness-totals";
import { EffectivenessCell } from "./effectiveness-cell";
import type { MetaAliasOption } from "./meta-alias-directory";
type CatalogTable = {
  id: string;
  name: string;
  aliases: MetaAliasOption[];
  aliasColumnName: string;
  defaultCountry: string;
  defaultCurrency: string;
};
export function ProductsCatalog() {
  const [tables, setTables] = useState<CatalogTable[]>([]),
    [selected, setSelected] = useState("diplomados"),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false);
  type Special = {
    id: string;
    kind: "TOTALS" | "ADVISORS" | "INVENTORY";
    name: string;
    revision: number;
  };
  const [specials, setSpecials] = useState<Special[]>([]),
    [specialId, setSpecialId] = useState<string | null>(null);
  const special = specials.find((s) => s.id === specialId);
  const totals = special?.kind === "TOTALS",
    advisorSheet = special?.kind === "ADVISORS",
    inventorySheet = special?.kind === "INVENTORY";
  const [editing, setEditing] = useState<{
      id: string;
      name: string;
      special: boolean;
      revision?: number;
    } | null>(null),
    [editBusy, setEditBusy] = useState(false);
  const editPending = useRef(false),
    editCancelled = useRef(false);
  const saveTab = async () => {
    if (!editing || editPending.current || editCancelled.current) return;
    const draft = { ...editing, name: editing.name.trim() };
    const currentName = editing.special
      ? specials.find((t) => t.id === editing.id)?.name
      : tables.find((t) => t.id === editing.id)?.name;
    if (draft.name === currentName) {
      setEditing(null);
      return;
    }
    if (!draft.name || draft.name.length > 100) {
      setMessage("El nombre admite de 1 a 100 caracteres.");
      return;
    }
    editPending.current = true;
    setEditBusy(true);
    try {
      if (draft.special) {
        const updated = await api(
          "meta-ads/workbook-sheets/" + draft.id,
          "PATCH",
          { name: draft.name, revision: draft.revision },
        );
        setSpecials((old) => old.map((t) => (t.id === draft.id ? updated : t)));
      } else {
        await api("meta-ads/alias-tables/" + draft.id, "PATCH", {
          name: draft.name,
        });
        await load();
      }
      setEditing((old) => (old?.id === draft.id ? null : old));
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      editPending.current = false;
      setEditBusy(false);
    }
  };
  const editTab = (
    id: string,
    name: string,
    isSpecial = false,
    revision?: number,
  ) => {
    editCancelled.current = false;
    setEditing({ id, name, special: isSpecial, revision });
  };
  const tabEditor = (id: string) =>
    editing?.id === id ? (
      <input
        autoFocus
        aria-label="Nombre de pestaña"
        maxLength={100}
        value={editing.name}
        disabled={editBusy}
        onFocus={(e) => e.target.select()}
        onChange={(e) =>
          setEditing((old) => (old ? { ...old, name: e.target.value } : old))
        }
        onClick={(e) => e.stopPropagation()}
        onBlur={() => void saveTab()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            editCancelled.current = true;
            setEditing(null);
          } else if (e.key === "Enter") {
            e.preventDefault();
            void saveTab();
          } else if (e.key === "Tab") void saveTab();
        }}
      />
    ) : null;
  const addSpecial = async (kind: Special["kind"]) => {
    setBusy(true);
    setMessage("");
    try {
      const created = await api("meta-ads/workbook-sheets", "POST", { kind });
      setSpecials((old) => [...old, created]);
      setSpecialId(created.id);
      editTab(created.id, created.name, true, created.revision);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    void api("meta-ads/workbook-sheets")
      .then((v) => {
        if (active) setSpecials(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const load = async () => {
    const v: CatalogTable[] = await api("meta-ads/alias-tables");
    setTables(v);
  };
  useEffect(() => {
    let active = true;
    void api("meta-ads/alias-tables")
      .then((v: CatalogTable[]) => {
        if (active) {
          setTables(v);
          setSelected((old) =>
            v.some((t) => t.id === old) ? old : (v[0]?.id ?? ""),
          );
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const menuId = useId(),
    menu = useRef<HTMLDivElement>(null);
  const [contextTable, setContextTable] = useState<CatalogTable | null>(null),
    [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 }),
    [deleting, setDeleting] = useState<string | null>(null);
  const openMenu = (t: CatalogTable, x: number, y: number) => {
    setContextTable(t);
    setMenuPosition({
      left: Math.max(8, Math.min(x, innerWidth - 210)),
      top: Math.max(8, Math.min(y, innerHeight - 90)),
    });
    requestAnimationFrame(() => {
      menu.current?.showPopover();
      menu.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
    });
  };
  const deleted = async (id: string) => {
    try {
      const v: CatalogTable[] = await api("meta-ads/alias-tables");
      setTables(v);
      if (selected === id || !v.some((t) => t.id === selected))
        setSelected(v[0]?.id ?? "");

      setMessage("Tabla eliminada.");
    } catch {
      setMessage(
        "La tabla se eliminó, pero no se pudo recargar la lista. Actualiza la página.",
      );
    } finally {
      setDeleting(null);
      setContextTable(null);
    }
  };
  const [view, setView] = useState<"manual" | "automatic">("manual");
  const [advisors, setAdvisors] = useState<
    { id: string; name: string; label?: string }[]
  >([]);
  const loadAdvisors = async () => setAdvisors(await api("meta-ads/advisors"));
  useEffect(() => {
    let active = true;
    void api("meta-ads/advisors")
      .then((v) => {
        if (active) setAdvisors(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const {
    ids: sheetOrder,
    move: moveSheet,
    warning: orderWarning,
    append: appendSheet,
  } = useSheetOrder(tables);
  const orderedTables = sheetOrder.map((id) =>
    tables.find((t) => t.id === id)!,
  );
  const dragged = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null),
    [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null),
    [orderMessage, setOrderMessage] = useState("");
  const reorder = (from: string, to: string, after = false) => {
    if (moveSheet(from, to, after))
      setOrderMessage(
        `Hoja ${tables.find((t) => t.id === from)?.name} reordenada.`,
      );
  };
  const table = tables.find((t) => t.id === selected);
  const sheetTabs = (
    <nav className="sheet-tabs" aria-label="Hojas del libro de efectividad">
      <div
        className="sheet-tab-list"
        role="tablist"
        aria-label="Tablas de efectividad"
      >
        {orderedTables.map((t) => (
          <span key={t.id} className="sheet-tab-wrap">
            <button
              role="tab"
              aria-selected={
                !totals && !advisorSheet && !inventorySheet && selected === t.id
              }
              className={
                "sheet-tab-alias" + (editing?.id === t.id ? " sr-only" : "")
              }
              draggable
              data-sheet-id={t.id}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(t, e.clientX, e.clientY);
              }}
              data-dragging={dragging === t.id || undefined}
              data-drop-edge={
                drop?.id === t.id
                  ? drop.after
                    ? "after"
                    : "before"
                  : undefined
              }
              title="Arrastra para ordenar; Alt + flecha izquierda/derecha también mueve la hoja"
              onDragStart={(e) => {
                dragged.current = t.id;
                setDragging(t.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", t.id);
              }}
              onDragOver={(e) => {
                if (!dragged.current) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect(),
                  after = e.clientX > rect.left + rect.width / 2;
                setDrop((old) =>
                  old?.id === t.id && old.after === after
                    ? old
                    : { id: t.id, after },
                );
              }}
              onDrop={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                if (dragged.current)
                  reorder(
                    dragged.current,
                    t.id,
                    e.clientX > rect.left + rect.width / 2,
                  );
                dragged.current = null;
                setDragging(null);
                setDrop(null);
              }}
              onDragEnd={() => {
                dragged.current = null;
                setDragging(null);
                setDrop(null);
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "ContextMenu" ||
                  (e.shiftKey && e.key === "F10")
                ) {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu(t, r.left, r.bottom);
                  return;
                }
                if (!e.altKey || !["ArrowLeft", "ArrowRight"].includes(e.key))
                  return;
                e.preventDefault();
                const index = sheetOrder.indexOf(t.id),
                  target =
                    sheetOrder[index + (e.key === "ArrowRight" ? 1 : -1)];
                if (target) {
                  const button = e.currentTarget;
                  reorder(t.id, target, e.key === "ArrowRight");
                  requestAnimationFrame(() =>
                    button.focus({ preventScroll: true }),
                  );
                }
              }}
              onClick={() => {
                setSelected(t.id);
                setSpecialId(null);
                editTab(t.id, t.name);
                setMessage("");
              }}
            >
              {t.name} ({t.aliases.length})
            </button>
            {tabEditor(t.id)}
          </span>
        ))}
        <button
          className="sheet-add-tab"
          aria-expanded={adding}
          onClick={() => setAdding((v) => !v)}
        >
          + Tabla
        </button>
        {(["TOTALS", "ADVISORS", "INVENTORY"] as const).map((kind) => (
          <span className="sheet-tab-group" key={kind}>
            {specials
              .filter((s) => s.kind === kind)
              .map((t) => (
                <span key={t.id} className="sheet-tab-wrap">
                  <button
                    role="tab"
                    className={
                      "sheet-tab-" +
                      (kind === "TOTALS"
                        ? "totals"
                        : kind === "ADVISORS"
                          ? "advisors"
                          : "inventory") +
                      (editing?.id === t.id ? " sr-only" : "")
                    }
                    aria-selected={specialId === t.id}
                    onClick={() => {
                      setSpecialId(t.id);
                      setMessage("");
                      editTab(t.id, t.name, true, t.revision);
                    }}
                  >
                    {t.name}
                  </button>
                  {tabEditor(t.id)}
                </span>
              ))}
            <button
              className="sheet-add-tab"
              disabled={busy || !specials.length}
              onClick={() => void addSpecial(kind)}
            >
              +{" "}
              {kind === "TOTALS"
                ? "Totales"
                : kind === "ADVISORS"
                  ? "Asesores"
                  : "Inventario"}
            </button>
          </span>
        ))}
      </div>
    </nav>
  );
  return (
    <section className="products-catalog effectiveness-workbook">
      {!totals && !advisorSheet && !inventorySheet && (
        <div className="sheet-book-bar">
          {!totals && !advisorSheet && !inventorySheet && (
            <div
              className="row sheet-view-buttons"
              aria-label="Vista de la hoja"
            >
              <button
                className={
                  "sheet-mode-manual" + (view === "manual" ? " primary" : "")
                }
                aria-pressed={view === "manual"}
                onClick={() => setView("manual")}
              >
                Vista manual
              </button>
              <button
                className={
                  "sheet-mode-automatic" +
                  (view === "automatic" ? " primary" : "")
                }
                aria-pressed={view === "automatic"}
                onClick={() => setView("automatic")}
              >
                Vista automática
              </button>
            </div>
          )}
          {table && !totals && !advisorSheet && !inventorySheet && (
            <label className="sheet-table-title">
              Nombre de tabla
              <EffectivenessCell
                key={table.id}
                value={table.name}
                label="Nombre de la tabla"
                onError={setMessage}
                onSave={async (name) => {
                  if (!name || name.length > 100)
                    throw Error(
                      "El nombre de la tabla admite de 1 a 100 caracteres.",
                    );
                  await api("meta-ads/alias-tables/" + table.id, "PATCH", {
                    name,
                  });
                  await load();
                }}
              />
            </label>
          )}
        </div>
      )}
      {adding && (
        <form
          className="row sheet-add-table"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name"));
            setBusy(true);
            try {
              const t = await api("meta-ads/alias-tables", "POST", { name });
              appendSheet(t.id);
              await load();
              setSelected(t.id);
              setSpecialId(null);
              setAdding(false);
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "No se pudo crear la tabla.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nombre de la nueva tabla
            <input name="name" required maxLength={100} />
          </label>
          <button disabled={busy}>Crear tabla</button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        </form>
      )}
      {message && (
        <p className="sheet-message" role="status">
          {message}
        </p>
      )}
      {loading && <p role="status">Cargando tablas…</p>}
      {orderWarning && (
        <p className="sheet-message" role="status">
          {orderWarning}
        </p>
      )}
      <span className="sr-only" role="status">
        {orderMessage}
      </span>
      {!loading && !tables.length && !special && (
        <div className="sheet-empty-workbook">
          {sheetTabs}
          <p>
            No hay tablas. Usa + Tabla para crear una; Asesores sigue
            disponible.
          </p>
        </div>
      )}
      {inventorySheet && (
        <InventoryCatalog
          key={special!.id}
          listId={special!.id}
          tables={orderedTables}
          initialTableId={table?.id ?? ""}
          sheetTabs={sheetTabs}
          onChanged={load}
        />
      )}
      {advisorSheet && !inventorySheet && (
        <AdvisorsSheet
          key={special!.id}
          listId={special!.id}
          tables={orderedTables}
          initialTableId={table?.id ?? "all"}
          sheetTabs={sheetTabs}
          onChanged={loadAdvisors}
        />
      )}
      {totals && !advisorSheet && !inventorySheet && (
        <EffectivenessTotals
          key={special!.id}
          listId={special!.id}
          tables={orderedTables}
          initialTableId={table?.id ?? ""}
          sheetTabs={sheetTabs}
        />
      )}
      {table && !totals && !advisorSheet && !inventorySheet && (
        <MetaEffectiveness
          key={table.id}
          view={view}
          advisors={advisors}
          sheetTabs={sheetTabs}
          tables={orderedTables}
          tableId={table.id}
          aliases={table.aliases}
          settings={table}
          onNamesChanged={load}
        />
      )}
      <div
        id={menuId}
        ref={menu}
        popover="auto"
        className="sheet-table-context-menu"
        role="menu"
        aria-label="Opciones de tabla"
        style={menuPosition}
      >
        <button
          type="button"
          role="menuitem"
          className="danger"
          onClick={() => {
            menu.current?.hidePopover();
            if (contextTable) setDeleting(contextTable.id);
          }}
        >
          Eliminar tabla
        </button>
      </div>
      {deleting && (
        <DeleteAliasTable
          tableId={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={deleted}
        />
      )}
    </section>
  );
}
