"use client";
import { MetaWorkspaceSharing } from "./meta-workspace-sharing";
import { useFinancialReadOnly } from "./financial-read-only";
import { engineRequest as generalApi } from "./generation-engine";
import { useEffect, useRef, useState, useId, useContext } from "react";
import { CurrentUserId, CurrentRole } from "./role-guide";
import { financialRequest as api } from "./financial-request";
import { SheetTabColorDialog, useSheetTabColors } from "./sheet-tab-colors";
import { useSheetOrder } from "./use-sheet-order";
import { InventoryCatalog } from "./inventory-catalog";
import { MetaEffectiveness } from "./meta-effectiveness";
import { DeleteAliasTable } from "./delete-alias-table";
import { AdvisorsSheet } from "./advisors-sheet";
import { EffectivenessTotals } from "./effectiveness-totals";
import { EffectivenessCell } from "./effectiveness-cell";
import {
  parsePeriodTableLink,
  type PeriodTableLink,
} from "../../lib/meta-ads/period-table-link";
import type { AdvisorPeriodView } from "../../lib/meta-ads/advisor-period-history";
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
  const actualRole = useContext(CurrentRole);
  const [access, setAccess] = useState<{
    isOwner: boolean;
    global: "VIEW" | "EDIT" | null;
    grants: { scope: string; permission: "VIEW" | "EDIT" }[];
  } | null>(null);
  const [sharingScope, setSharingScope] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const accessVersion = useRef("");
  const permission = (scope: string) =>
    access?.isOwner ||
    access?.global === "EDIT" ||
    access?.grants.some((g) => g.scope === scope && g.permission === "EDIT")
      ? "EDIT"
      : access?.global || access?.grants.some((g) => g.scope === scope)
        ? "VIEW"
        : null;
  useEffect(() => {
    let live = true;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      void generalApi("meta-ads/effectiveness-access")
        .then((a) => {
          if (live) {
            const signature = JSON.stringify([
              a.isOwner,
              a.global,
              [...a.grants].sort((x, y) => x.scope.localeCompare(y.scope)),
            ]);
            const changed =
              !!accessVersion.current && accessVersion.current !== signature;
            accessVersion.current = signature;
            setAccess(a);
            if (changed)
              void Promise.all([
                api("meta-ads/alias-tables"),
                api("meta-ads/workbook-sheets"),
              ])
                .then(([tables, sheets]) => {
                  if (live) {
                    setTables(tables);
                    setSpecials(sheets);
                  }
                })
                .catch(() => {
                  if (live) {
                    setTables([]);
                    setSpecials([]);
                  }
                });
          }
        })
        .catch(() => {});
    };
    update();
    window.addEventListener("focus", update);
    const timer = setInterval(update, 30000);
    const sharing = () => setSharingScope("ALL");
    window.addEventListener("share-effectiveness", sharing);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("share-effectiveness", sharing);
    };
  }, []);
  const userId = useContext(CurrentUserId),
    locationKey = `effectiveness-location:v1:${userId}`;
  const [restoredLocationKey, setRestoredLocationKey] = useState<string | null>(
      null,
    ),
    [locationWarning, setLocationWarning] = useState("");
  const tabColors = useSheetTabColors(userId);
  const [colorTab, setColorTab] = useState<{ id: string; name: string } | null>(
    null,
  );
  const locationReady = restoredLocationKey === locationKey;
  const [tables, setTables] = useState<CatalogTable[]>([]),
    [selected, setSelected] = useState("diplomados"),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const creatingTable = useRef(false);
  async function createTableDirectly() {
    if (creatingTable.current || busy || !canCreate) return;
    creatingTable.current = true;
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      const t = await api("meta-ads/alias-tables", "POST", {});
      committed = true;
      appendSheet(t.id);
      await load();
      setSelected(t.id);
      setSpecialId(null);
      setEditing(null);
    } catch (error) {
      setMessage(
        (committed ? "La hoja se creó. Actualiza la lista. " : "") +
          (error instanceof Error
            ? error.message
            : "No se pudo crear la hoja."),
      );
    } finally {
      creatingTable.current = false;
      setBusy(false);
    }
  }
  type Special = {
    id: string;
    kind: "TOTALS" | "ADVISORS" | "INVENTORY";
    name: string;
    revision: number;
    config?: { selected?: string[] | null; tableId?: string };
  };
  const [periodLink, setPeriodLink] = useState<PeriodTableLink | null>(null);
  const periodSequence = useRef(0);
  const [advisorPeriodRequest, setAdvisorPeriodRequest] = useState<{
    key: number;
    period: AdvisorPeriodView;
  } | null>(null);
  const openAdvisorPeriod = (period: AdvisorPeriodView) => {
    if (!period.from || !period.since) return;
    setSpecialId(null);
    setSelected(period.tableId);
    setAdvisorPeriodRequest({ key: ++periodSequence.current, period });
  };
  const [specialsLoaded, setSpecialsLoaded] = useState(false);
  const specialDeletePending = useRef(false);
  const [specials, setSpecials] = useState<Special[]>([]),
    [specialId, setSpecialId] = useState<string | null>(null);
  const special = specials.find((s) => s.id === specialId);
  const totals = special?.kind === "TOTALS",
    advisorSheet = special?.kind === "ADVISORS",
    inventorySheet = special?.kind === "INVENTORY";
  const documentScope = special ? "TAB:" + special.id : "TABLE:" + selected;
  const canEdit =
    permission(documentScope) === "EDIT" || actualRole === "OWNER";
  const isOwner = access?.isOwner ?? actualRole === "OWNER";
  const canCreate = isOwner || access?.global === "EDIT";
  useFinancialReadOnly(root, !canEdit);
  useEffect(() => {
    if (!access || !specialsLoaded || loading) return;
    if (special && permission("TAB:" + special.id)) return;
    if (
      !specialId &&
      tables.some((t) => t.id === selected) &&
      permission("TABLE:" + selected)
    )
      return;
    const allowed = specials.find((s) => permission("TAB:" + s.id));
    if (allowed) setSpecialId(allowed.id);
    else {
      const first = tables.find((t) => permission("TABLE:" + t.id));
      if (first) {
        setSpecialId(null);
        setSelected(first.id);
      }
    }
  }, [access, specialsLoaded, loading, specialId, specials, tables, selected]);
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
    if (!canEdit) return;
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
        if (active) {
          setSpecials(v);
          setSpecialsLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const load = async () => {
    const [v, sheets]: [CatalogTable[], Special[]] = await Promise.all([
      api("meta-ads/alias-tables"),
      api("meta-ads/workbook-sheets"),
    ]);
    setTables(v);
    setSpecials(sheets);
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
  const [contextTable, setContextTable] = useState<{
      id: string;
      name: string;
      kind?: Special["kind"];
      revision?: number;
    } | null>(null),
    [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 }),
    [deleting, setDeleting] = useState<string | null>(null);
  const contextTrigger = useRef<HTMLButtonElement | null>(null);
  const openMenu = (
    t: { id: string; name: string; kind?: Special["kind"]; revision?: number },
    x: number,
    y: number,
    trigger?: HTMLButtonElement,
  ) => {
    if (!canEdit) return;
    contextTrigger.current = trigger ?? null;
    setContextTable(t);
    setMenuPosition({
      left: Math.max(8, Math.min(x, innerWidth - 210)),
      top: Math.max(8, Math.min(y, innerHeight - 170)),
    });
    requestAnimationFrame(() => {
      menu.current?.showPopover();
      menu.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
    });
  };
  const deleteSpecial = async (
    id: string,
    name: string,
    kind: Special["kind"],
  ) => {
    if (specialDeletePending.current) return;
    specialDeletePending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const review = await api(
        "meta-ads/workbook-sheets/" + id + "/delete-preview",
      );
      if (
        review.sheet.id !== id ||
        review.sheet.name !== name ||
        review.sheet.kind !== kind
      )
        throw Error(
          "La pestaña cambió. Actualiza la página antes de eliminarla.",
        );
      await api("meta-ads/workbook-sheets/" + id, "DELETE", {
        token: review.token,
        confirmedName: review.sheet.name,
      });
      const next = specials.filter((s) => s.id !== id);
      setSpecials((old) => old.filter((s) => s.id !== id));
      setSpecialId((old) =>
        old === id
          ? (next.find((s) => s.kind === kind)?.id ?? next[0]?.id ?? null)
          : old,
      );
      setContextTable(null);
      try {
        setSpecials(await api("meta-ads/workbook-sheets"));
        setMessage("Pestaña eliminada. Sus registros se conservaron.");
      } catch {
        setMessage("Pestaña eliminada. Recarga para actualizar el libro.");
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo eliminar la pestaña.",
      );
    } finally {
      specialDeletePending.current = false;
      setBusy(false);
    }
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
  useEffect(() => {
    if (loading || !specialsLoaded || locationReady) return;
    try {
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem(locationKey);
      } catch {}
      if (saved === null)
        try {
          saved = localStorage.getItem(locationKey);
        } catch {}
      const raw = JSON.parse(saved || "null");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const tableId =
          typeof raw.tableId === "string" &&
          tables.some((t) => t.id === raw.tableId)
            ? raw.tableId
            : (tables[0]?.id ?? "");
        const storedSpecial =
          typeof raw.specialId === "string"
            ? specials.find((t) => t.id === raw.specialId)
            : undefined;
        const replacement =
          !storedSpecial && typeof raw.specialId === "string"
            ? specials.find((t) => t.kind === raw.kind)
            : undefined;
        setSelected(tableId);
        setSpecialId(storedSpecial?.id ?? replacement?.id ?? null);
        if (raw.view === "manual" || raw.view === "automatic")
          setView(raw.view);
      }
    } catch {
      setLocationWarning(
        "No se pudo recuperar la última pestaña de este navegador.",
      );
    }
    const requested = parsePeriodTableLink(
      new URLSearchParams(window.location.search),
    );
    if (requested) {
      const linkedTable = tables.find((t) => t.id === requested.tableId);
      if (
        linkedTable &&
        (!requested.aliasId ||
          linkedTable.aliases.some((a) => a.id === requested.aliasId))
      ) {
        setSelected(requested.tableId);
        setSpecialId(null);
        setPeriodLink(requested);
      } else
        setMessage(
          "La hoja o el inventario del período ya no están disponibles.",
        );
    }
    setRestoredLocationKey(locationKey);
  }, [loading, specialsLoaded, locationReady, locationKey, tables, specials]);
  useEffect(() => {
    if (!locationReady || loading || !specialsLoaded) return;
    const saved = JSON.stringify({
      tableId: selected,
      specialId: special?.id ?? null,
      kind: special?.kind ?? "TABLE",
      view,
    });
    let stored = false;
    try {
      sessionStorage.setItem(locationKey, saved);
      stored = true;
    } catch {}
    try {
      localStorage.setItem(locationKey, saved);
      stored = true;
    } catch {}
    setLocationWarning(
      stored
        ? ""
        : "El navegador no permite guardar la pestaña abierta; al recargar podría abrir otra hoja.",
    );
  }, [
    locationReady,
    loading,
    specialsLoaded,
    locationKey,
    selected,
    special?.id,
    special?.kind,
    view,
  ]);
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
        className="sheet-tab-list sheet-special-tabs"
        role="tablist"
        aria-label="Pestañas del libro"
      >
        <span className="sheet-tab-row-label">Pestañas:</span>
        {(["TOTALS", "ADVISORS", "INVENTORY"] as const).map((kind) => (
          <span className="sheet-tab-group" key={kind}>
            {specials
              .filter((s) => s.kind === kind)
              .map((t) => (
                <span key={t.id} className="sheet-tab-wrap">
                  <button
                    style={tabColors.style(t.id)}
                    data-custom-tab-color={
                      !!tabColors.colors[t.id] || undefined
                    }
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
                    title="Clic derecho para cambiar color, editar nombre o eliminar la pestaña"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMenu(t, e.clientX, e.clientY, e.currentTarget);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "ContextMenu" ||
                        (e.shiftKey && e.key === "F10")
                      ) {
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        openMenu(t, r.left, r.bottom, e.currentTarget);
                      }
                    }}
                    onClick={() => {
                      setSpecialId(t.id);
                      setMessage("");
                      setEditing(null);
                    }}
                  >
                    {t.name}
                  </button>
                  {tabEditor(t.id)}
                </span>
              ))}
            <button
              className="sheet-add-tab"
              hidden={!canCreate}
              disabled={busy || !specialsLoaded}
              aria-label={`Agregar pestaña de ${kind === "TOTALS" ? "Totales" : kind === "ADVISORS" ? "Asesores" : "Inventario"}`}
              title={`Agregar ${kind === "TOTALS" ? "Totales" : kind === "ADVISORS" ? "Asesores" : "Inventario"}`}
              onClick={() => void addSpecial(kind)}
            >
              +
            </button>
          </span>
        ))}
      </div>
      <div
        className={
          "sheet-tab-list sheet-financial-tabs" +
          (!orderedTables.some((t) => permission("TABLE:" + t.id)) && !canCreate
            ? " sheet-financial-tabs-empty"
            : "")
        }
        role="tablist"
        aria-label="Hojas de datos"
      >
        <span className="sheet-tab-row-label">Hojas:</span>
        {orderedTables
          .filter((t) => permission("TABLE:" + t.id))
          .map((t) => (
            <span key={t.id} className="sheet-tab-wrap">
              <button
                role="tab"
                style={tabColors.style(t.id)}
                data-custom-tab-color={!!tabColors.colors[t.id] || undefined}
                aria-selected={
                  !totals &&
                  !advisorSheet &&
                  !inventorySheet &&
                  selected === t.id
                }
                className={
                  "sheet-tab-alias" + (editing?.id === t.id ? " sr-only" : "")
                }
                draggable
                data-sheet-id={t.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(t, e.clientX, e.clientY, e.currentTarget);
                }}
                data-dragging={dragging === t.id || undefined}
                data-drop-edge={
                  drop?.id === t.id
                    ? drop.after
                      ? "after"
                      : "before"
                    : undefined
                }
                title="Clic derecho para cambiar color, editar o eliminar; arrastra o usa Alt + flecha izquierda/derecha para ordenar"
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
                    openMenu(t, r.left, r.bottom, e.currentTarget);
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
                  setEditing(null);
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
          hidden={!canCreate}
          disabled={busy}
          onClick={() => void createTableDirectly()}
        >
          + Tabla
        </button>
      </div>
    </nav>
  );
  const documentShare = isOwner ? (
    <button
      type="button"
      className="sheet-document-share"
      title={"Compartir " + (special?.name ?? table?.name ?? "esta hoja")}
      onClick={() => setSharingScope(documentScope)}
    >
      Compartir hoja
    </button>
  ) : null;
  if (access && !isOwner && !permission(documentScope))
    return (
      <section ref={root} className="products-catalog effectiveness-workbook">
        {access.grants.length ? sheetTabs : null}
        <p role="status" className="notice">
          {access.grants.length
            ? "Selecciona un documento compartido para continuar."
            : "No tienes documentos compartidos de Efectividad."}
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Actualizar acceso
        </button>
      </section>
    );
  return (
    <section
      ref={root}
      data-effectiveness-document={documentScope}
      data-financial-read-only={!canEdit || undefined}
      className="products-catalog effectiveness-workbook"
    >
      {sharingScope && isOwner && (
        <MetaWorkspaceSharing
          scope={sharingScope}
          onClose={() => setSharingScope(null)}
        />
      )}
      {!isOwner && (
        <p className="sheet-share-status">
          {canEdit ? "Puede editar" : "Solo lectura"}
        </p>
      )}
      {locationReady && !totals && !advisorSheet && !inventorySheet && (
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
          {locationReady &&
            table &&
            !totals &&
            !advisorSheet &&
            !inventorySheet && (
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
          {documentShare}
        </div>
      )}
      {message && (
        <p className="sheet-message" role="status">
          {message}
        </p>
      )}
      {loading && (
        <p role="status" className="sheet-loading-status">
          Cargando tablas…
        </p>
      )}
      {!loading && !locationReady && (
        <p role="status">Abriendo la última hoja…</p>
      )}
      {locationWarning && (
        <p className="sheet-message" role="status">
          {locationWarning}
        </p>
      )}
      {orderWarning && (
        <p className="sheet-message" role="status">
          {orderWarning}
        </p>
      )}
      <span className="sr-only" role="status">
        {orderMessage}
      </span>
      {locationReady && !loading && !tables.length && !special && (
        <div className="sheet-empty-workbook">
          {sheetTabs}
          <p>
            No hay tablas. Usa + Tabla para crear una; Asesores sigue
            disponible.
          </p>
        </div>
      )}
      {locationReady && inventorySheet && (
        <InventoryCatalog
          key={special!.id}
          listId={special!.id}
          tables={orderedTables}
          initialTableId={table?.id ?? ""}
          sheetTabs={sheetTabs}
          toolbarActions={documentShare}
          onChanged={load}
          onOpenInventory={(id) => setSpecialId(id)}
        />
      )}
      {locationReady && advisorSheet && !inventorySheet && (
        <AdvisorsSheet
          key={special!.id}
          listId={special!.id}
          tables={orderedTables}
          initialTableId={table?.id ?? "all"}
          sheetTabs={sheetTabs}
          toolbarActions={documentShare}
          onChanged={loadAdvisors}
          onOpenPeriod={openAdvisorPeriod}
        />
      )}
      {locationReady && totals && !advisorSheet && !inventorySheet && (
        <EffectivenessTotals
          key={special!.id}
          listId={special!.id}
          tables={orderedTables}
          initialTableId={table?.id ?? ""}
          initialSelected={
            !isOwner ? (special?.config?.selected ?? null) : undefined
          }
          sheetTabs={sheetTabs}
          toolbarActions={documentShare}
        />
      )}
      {table && !totals && !advisorSheet && !inventorySheet && (
        <MetaEffectiveness
          key={table.id}
          inventoryLists={specials.filter((s) => s.kind === "INVENTORY")}
          view={view}
          advisors={advisors}
          sheetTabs={sheetTabs}
          tables={orderedTables}
          tableId={table.id}
          aliases={table.aliases}
          settings={table}
          onNamesChanged={load}
          onOpenAdvisorPeriod={openAdvisorPeriod}
          advisorPeriodRequest={advisorPeriodRequest}
          onAdvisorPeriodHandled={() => setAdvisorPeriodRequest(null)}
          initialPeriodLink={periodLink}
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
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            menu.current?.hidePopover();
            contextTrigger.current?.focus({ preventScroll: true });
            return;
          }
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const buttons = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                'button[role="menuitem"]:not(:disabled)',
              ),
            ],
            index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            menu.current?.hidePopover();
            if (!contextTable) return;
            if (contextTable.kind) setSpecialId(contextTable.id);
            else {
              setSelected(contextTable.id);
              setSpecialId(null);
            }
            setMessage("");
            editTab(
              contextTable.id,
              contextTable.name,
              !!contextTable.kind,
              contextTable.revision,
            );
          }}
        >
          Editar nombre
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            menu.current?.hidePopover();
            if (contextTable)
              setColorTab({ id: contextTable.id, name: contextTable.name });
          }}
        >
          Cambiar color
        </button>
        {contextTable && (
          <button
            type="button"
            role="menuitem"
            className="danger"
            disabled={busy}
            onClick={() => {
              menu.current?.hidePopover();
              if (contextTable?.kind)
                void deleteSpecial(
                  contextTable.id,
                  contextTable.name,
                  contextTable.kind,
                );
              else if (contextTable) setDeleting(contextTable.id);
            }}
          >
            {contextTable.kind ? "Eliminar pestaña" : "Eliminar tabla"}
          </button>
        )}
      </div>
      {tabColors.warning && (
        <p role="status" className="notice">
          {tabColors.warning}
        </p>
      )}
      {colorTab && (
        <SheetTabColorDialog
          key={colorTab.id}
          name={colorTab.name}
          color={tabColors.colors[colorTab.id]}
          onApply={(color) => tabColors.setColor(colorTab.id, color)}
          onClose={() => {
            setColorTab(null);
            requestAnimationFrame(() =>
              contextTrigger.current?.focus({ preventScroll: true }),
            );
          }}
        />
      )}
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
