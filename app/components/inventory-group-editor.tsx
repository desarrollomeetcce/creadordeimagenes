"use client";
import { InventoryGroupReplacements } from "./inventory-group-replacements";
import {
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { financialRequest as api } from "./financial-request";
import { CurrentUserId } from "./role-guide";
import { SheetSearchSelect } from "./sheet-search-select";
import { matchesSearchWords } from "../../lib/search";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import {
  diverseTrialItems,
  type TrialItem,
} from "../../lib/meta-ads/inventory-trial-policy";
import type {
  TrialDirectory,
  TrialGroup,
} from "../../lib/meta-ads/inventory-trials";
import { limaToday } from "./date-range";
import { useSheetWidths } from "./use-sheet-widths";
import { SheetColumnResizer } from "./sheet-column-resizer";
import type {
  GroupUsageCell,
  GroupUsageMode,
} from "../../lib/meta-ads/inventory-group-usage";
import { InventoryDiplomaObservations } from "./inventory-diploma-observations";

export function InventoryGroupEditor({
  directory,
  group,
  initialNames,
  onClose,
  onSaved,
  onGroupsChanged,
  onUsageChange,
  topContent,
  initialTab,
  onChooseGroup,
  externalBusy = false,
  evaluationColumns = [],
}: {
  evaluationColumns?: { value: string; label: string }[];
  externalBusy?: boolean;
  topContent?: ReactNode;
  initialTab?: "create" | "edit" | "top";
  onChooseGroup?: (id: string) => void;
  directory: TrialDirectory;
  group?: TrialGroup;
  initialNames: string[];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
  onGroupsChanged?: () => Promise<void>;
  onUsageChange?: (key: string, cell: GroupUsageCell) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const userId = useContext(CurrentUserId);
  const pinKey = `inventory-group-pins:v1:${userId}:${directory.listId}`;
  const [groupAction, setGroupAction] = useState<{
    kind: "assign" | "archive" | "rename" | "menu" | "move";
    source?: TrialGroup;
    item?: TrialItem;
    group: TrialGroup | null;
  } | null>(null);
  const groupActionPending = useRef(false);
  const [renameValue, setRenameValue] = useState("");
  const [notice, setNotice] = useState("");
  const [managementTab, setManagementTab] = useState<"create" | "edit" | "top">(
    initialTab ?? (group ? "edit" : "create"),
  );
  const [categoryPicker, setCategoryPicker] = useState<
    "primary" | "secondary" | null
  >(null);
  const [expanded, setExpanded] = useState(false),
    [observations, setObservations] = useState(""),
    [evaluationColumn, setEvaluationColumn] = useState(
      evaluationColumns[0]?.value ?? "",
    );
  const { widths, resize, warning } = useSheetWidths(
    "inventory-group-picker:" + directory.listId,
  );
  const countryOptions = directory.countries;
  const [usage, setUsage] = useState(directory.usage);
  useEffect(() => {
    setUsage(directory.usage);
  }, [directory.usage]);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setClock(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const [usageEditing, setUsageEditing] = useState<{
    item: TrialItem;
    country: string;
  } | null>(null);
  const columnSpecs = [
    { key: "name", label: "Diplomado", width: 230 },
    { key: "primary", label: "Categoría principal", width: 110 },
    { key: "secondary", label: "Categorías secundarias", width: 120 },
    { key: "group", label: "Grupo", width: 75 },
    ...countryOptions.map((c) => ({
      key: "usage:" + c.code,
      label: c.name,
      width: 48,
    })),
    { key: "selection", label: "Acciones", width: 130 },
  ];
  const usageCell = (item: TrialItem, country: string): GroupUsageCell =>
    usage[JSON.stringify([categoryKey(item.name), country])] ?? {
      automatic: "NEVER",
      activationHours: 0,
      mode: "AUTO",
      revision: null,
    };
  async function saveUsage(mode: GroupUsageMode) {
    if (!usageEditing) return;
    const { item, country } = usageEditing;
    setBusy(true);
    setError("");
    try {
      const result = await api("meta-ads/inventory/trials", "POST", {
        action: "USAGE",
        listId: directory.listId,
        itemId: item.id,
        country,
        mode,
        expectedRevision: usageCell(item, country).revision,
      });
      setUsage((previous) => ({
        ...previous,
        [result.usageUpdate.key]: result.usageUpdate.cell,
      }));
      onUsageChange?.(result.usageUpdate.key, result.usageUpdate.cell);
      setUsageEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el uso.");
    } finally {
      setBusy(false);
    }
  }
  const handle = (index: number) => (
    <SheetColumnResizer
      label={columnSpecs[index].label}
      onResize={(value) => resize(columnSpecs[index].key, value)}
      onReset={() => resize(columnSpecs[index].key)}
    />
  );
  const [requestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(
    group?.name ?? "Grupo " + (directory.groups.length + 1),
  );
  const [ids, setIds] = useState(() => [
    ...new Set([
      ...(group?.members.map((m) => m.itemId) ?? []),
      ...directory.catalog
        .filter((i) =>
          initialNames.some((n) => categoryKey(n) === categoryKey(i.name)),
        )
        .map((i) => i.id),
    ]),
  ]);
  const editing = managementTab === "edit" && !!group;
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [replacementIds, setReplacementIds] = useState<string[] | null>(null);
  const [replacementMode, setReplacementMode] = useState<
    "ANY" | "SAME" | "OTHER" | "DIVERSE"
  >("ANY");
  const [onlyChecked, setOnlyChecked] = useState(false);
  const selectedIds = editing ? checkedIds : ids;
  const setSelectedIds = editing ? setCheckedIds : setIds;
  const showGroup = (id: string) => {
    if (managementTab === "edit" && id && onChooseGroup) onChooseGroup(id);
    else setBrowsedGroupId(id);
  };
  const countries = group?.countries ?? countryOptions.map((c) => c.code);
  const [browsedGroupId, setBrowsedGroupId] = useState(group?.id ?? "");
  const [pinnedGroupIds, setPinnedGroupIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(pinKey) || "[]");
      setPinnedGroupIds(
        Array.isArray(raw)
          ? raw
              .filter((value): value is string => typeof value === "string")
              .slice(0, 100)
          : [],
      );
    } catch {
      setPinnedGroupIds([]);
    }
  }, [pinKey]);
  function pinGroups(update: (current: string[]) => string[]) {
    setPinnedGroupIds((current) => {
      const next = update(current);
      try {
        localStorage.setItem(pinKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const browsedGroup = directory.groups.find(
    (entry) => entry.id === browsedGroupId,
  );
  const browsedMembers = browsedGroup
    ? new Set(browsedGroup.members.map((member) => member.itemId))
    : null;
  const [query, setQuery] = useState(""),
    [primary, setPrimary] = useState<string[]>([]),
    [secondary, setSecondary] = useState<string[]>([]),
    [sheets, setSheets] = useState<string[]>([]);
  const [count, setCount] = useState(10),
    [onlySelected, setOnlySelected] = useState(!!group),
    [replacing, setReplacing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const catalog = directory.catalog;
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const occupied = new Map(
    directory.groups
      .filter((g) => g.id !== group?.id)
      .flatMap((g) =>
        g.members.map(
          (m) =>
            [
              categoryKey(
                directory.catalog.find((i) => i.id === m.itemId)?.name ??
                  m.name,
              ),
              g.name,
            ] as const,
        ),
      ),
  );
  const primaryOptions = [
    ...new Set(catalog.flatMap((i) => i.primaryNames)),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const secondaryOptions = [
    ...new Set(catalog.flatMap((i) => i.secondaryNames ?? [])),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const sheetOptions = [
    ...new Map(
      catalog.flatMap((i) => (i.sheets ?? []).map((s) => [s.id, s] as const)),
    ).values(),
  ];
  const pool = catalog.filter((i) => !occupied.has(categoryKey(i.name)));
  const matching = catalog.filter(
    (i) =>
      (editing && !replacing
        ? ids.includes(i.id)
        : replacing || !browsedMembers || browsedMembers.has(i.id)) &&
      ((editing && !replacing) || matchesSearchWords(i.name, query)) &&
      (!primary.length || i.primaryNames.some((n) => primary.includes(n))) &&
      (!secondary.length ||
        i.secondaryNames?.some((n) => secondary.includes(n))) &&
      (!sheets.length || i.sheets?.some((s) => sheets.includes(s.id))),
  );
  const filtered = matching.filter((i) =>
    editing
      ? !onlyChecked || checkedIds.includes(i.id)
      : !onlySelected || ids.includes(i.id),
  );
  const eligible = filtered;
  const proposalPool = (editing ? catalog : matching).filter(
    (i) =>
      !occupied.has(categoryKey(i.name)) && (!editing || !ids.includes(i.id)),
  );
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(50);
  useEffect(() => {
    setPage(1);
  }, [query, primary, secondary, onlySelected, browsedGroupId]);
  const ordered = filtered
    .slice()
    .sort(
      (a, b) =>
        a.primaryNames
          .join(" · ")
          .localeCompare(b.primaryNames.join(" · "), "es") ||
        a.name.localeCompare(b.name, "es"),
    );
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize)),
    currentPage = Math.min(page, pages);
  const visibleItems = ordered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const toggle = (id: string) =>
    setSelectedIds((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
  function replaceRandom(item: TrialItem, same: boolean) {
    const candidates = pool.filter(
      (i) =>
        !ids.includes(i.id) &&
        (same
          ? i.primaryIds.length === item.primaryIds.length &&
            i.primaryIds.every((c) => item.primaryIds.includes(c))
          : !i.primaryIds.some((c) => item.primaryIds.includes(c)) &&
            i.primaryIds.length > 0),
    );
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    if (!next) {
      setError(
        "No hay otro diplomado libre con esa condición. Puedes elegirlo con Editar.",
      );
      return;
    }
    setIds((v) => v.map((x) => (x === item.id ? next.id : x)));
    setCheckedIds((current) =>
      current.map((id) => (id === item.id ? next.id : id)),
    );
    setError("");
  }
  async function applyGroupAction() {
    if (
      !groupAction?.group ||
      groupAction.kind === "menu" ||
      groupActionPending.current
    )
      return;
    groupActionPending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let saved = false;
    try {
      const target = groupAction.group;
      await api(
        "meta-ads/inventory/trials",
        "POST",
        groupAction.kind === "move" && groupAction.source && groupAction.item
          ? {
              action: "MOVE_MEMBER",
              listId: directory.listId,
              groupId: groupAction.source.id,
              revision: groupAction.source.revision,
              targetGroupId: target.id,
              targetRevision: target.revision,
              itemId: groupAction.item.id,
              since: limaToday(),
            }
          : {
              action:
                groupAction.kind === "assign"
                  ? "ADD_MEMBERS"
                  : groupAction.kind === "rename"
                    ? "RENAME"
                    : "ARCHIVE",
              listId: directory.listId,
              groupId: target.id,
              revision: target.revision,
              ...(groupAction.kind === "assign"
                ? { itemIds: selectedIds, since: limaToday() }
                : groupAction.kind === "rename"
                  ? { name: renameValue }
                  : {}),
            },
      );
      saved = true;
      if (groupAction.kind === "move" && groupAction.item) {
        const moved = groupAction.item.id;
        setCheckedIds((current) => current.filter((id) => id !== moved));
        if (group?.id === groupAction.source?.id)
          setIds((current) => current.filter((id) => id !== moved));
      }
      setGroupAction(null);
      if (groupAction.kind === "archive") setBrowsedGroupId("");
      if (groupAction.kind === "rename" && group?.id === target.id)
        setName(renameValue);
      await onGroupsChanged?.();
      setNotice(
        groupAction.kind === "assign"
          ? `Diplomados asignados a ${target.name}.`
          : groupAction.kind === "move"
            ? `Diplomado trasladado a ${target.name}.`
            : groupAction.kind === "rename"
              ? `Nombre actualizado: ${renameValue}.`
              : `Grupo ${target.name} eliminado de la lista. Sus diplomados e historial se conservan.`,
      );
    } catch (error) {
      setError(
        (saved ? "Cambio guardado. Actualiza la vista. " : "") +
          (error instanceof Error ? error.message : "No se pudo guardar."),
      );
    } finally {
      setBusy(false);
      groupActionPending.current = false;
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result: TrialGroup = await api(
        "meta-ads/inventory/trials",
        "POST",
        group
          ? {
              action: "MEMBERS",
              name,
              listId: directory.listId,
              groupId: group.id,
              revision: group.revision,
              itemIds: ids,
              since: limaToday(),
            }
          : {
              action: "CREATE",
              requestId,
              listId: directory.listId,
              name,
              itemIds: ids,
              countries,
              since: limaToday(),
              reserve: false,
              diverse: false,
              rules: { zero: 25, perSale: 50 },
            },
      );
      setCommitted(true);
      await onSaved(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="trial-dialog inventory-group-editor inventory-group-editor-compact"
      data-expanded={expanded || undefined}
      aria-label={
        group ? "Editar " + group.name : "Crear grupo desde inventario"
      }
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !externalBusy) onClose();
      }}
    >
      <header className="inventory-group-header">
        {(topContent || onChooseGroup) && (
          <nav
            className="inventory-management-tabs"
            aria-label="Gestionar inventario"
          >
            {topContent && (
              <button
                type="button"
                aria-pressed={managementTab === "top"}
                disabled={busy || externalBusy}
                onClick={() => setManagementTab("top")}
              >
                Top · evaluar y reemplazar
              </button>
            )}
            <button
              type="button"
              aria-pressed={managementTab === "create"}
              disabled={busy || externalBusy || !directory.canEdit}
              onClick={() => {
                if (group && onChooseGroup) onChooseGroup("");
                else setManagementTab("create");
              }}
            >
              Crear
            </button>
            <button
              type="button"
              aria-pressed={managementTab === "edit"}
              disabled={busy || externalBusy || !directory.canEdit}
              onClick={() => setManagementTab("edit")}
            >
              Editar grupos
            </button>
          </nav>
        )}
        <div className="inventory-group-window-actions">
          <button
            type="button"
            aria-label={
              expanded
                ? "Restaurar ventana de grupos"
                : "Maximizar ventana de grupos"
            }
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "↙ Restaurar ventana" : "⛶ Maximizar ventana"}
          </button>
          <button
            type="button"
            className="ui-close-button"
            aria-label="Cerrar edición de grupo"
            disabled={busy || externalBusy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>
      {replacementIds && group && (
        <InventoryGroupReplacements
          directory={directory}
          group={group}
          itemIds={replacementIds}
          initialMode={replacementMode}
          onClose={() => setReplacementIds(null)}
          onApplied={async (result) => {
            setIds(result.members.map((member) => member.itemId));
            setCheckedIds([]);
            setOnlyChecked(false);

            setReplacementIds(null);
            await onGroupsChanged?.();
            setNotice(
              "Reemplazos aprobados. El uso por país sigue a cada diplomado.",
            );
          }}
        />
      )}
      {groupAction && (
        <InventoryGroupActionDialog
          title={
            groupAction.kind === "assign"
              ? "Asignar a grupo"
              : groupAction.kind === "move"
                ? "Trasladar diplomado de grupo"
                : groupAction.kind === "rename"
                  ? "Editar nombre del grupo"
                  : groupAction.kind === "menu"
                    ? (groupAction.group?.name ?? "Grupo")
                    : "Eliminar grupo"
          }
          busy={busy}
          error={error}
          canAccept={
            !!groupAction.group &&
            (groupAction.kind !== "assign" || selectedIds.length > 0) &&
            (groupAction.kind !== "rename" || !!renameValue.trim())
          }
          showAccept={groupAction.kind !== "menu"}
          onAccept={() => void applyGroupAction()}
          onClose={() => {
            if (!busy) {
              setGroupAction(null);
              setError("");
            }
          }}
        >
          {groupAction.kind === "assign" ? (
            <>
              <p>
                Agregar {selectedIds.length} diplomados seleccionados sin
                retirar los que ya tiene el grupo.
              </p>
              <SheetSearchSelect
                label="Grupo para asignar seleccionados"
                value={groupAction.group?.id ?? ""}
                placeholder="Busca el grupo destino…"
                disabled={busy}
                options={directory.groups.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                }))}
                onSelect={(id) =>
                  setGroupAction({
                    kind: "assign",
                    group:
                      directory.groups.find((entry) => entry.id === id) ?? null,
                  })
                }
              />
              <small>
                Si un diplomado ya pertenece a otro grupo, se avisará sin
                cambiar su asignación.
              </small>
            </>
          ) : groupAction.kind === "move" ? (
            <p>
              ¿Trasladar «{groupAction.item?.name}» de «
              {groupAction.source?.name}» a «{groupAction.group?.name}»? Se
              retira del grupo de origen y se añade al destino. Sus hojas,
              países, ventas, vínculos e historial se conservan.
            </p>
          ) : groupAction.kind === "rename" ? (
            <label>
              Nombre del grupo
              <input
                aria-label="Nuevo nombre del grupo"
                value={renameValue}
                maxLength={100}
                disabled={busy}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </label>
          ) : groupAction.kind === "menu" ? (
            <div className="inventory-group-context-actions">
              <button
                type="button"
                disabled={!directory.canEdit}
                onClick={() => {
                  setRenameValue(groupAction.group?.name ?? "");
                  setGroupAction({ ...groupAction, kind: "rename" });
                }}
              >
                Editar nombre
              </button>
              {onChooseGroup && (
                <button
                  type="button"
                  onClick={() => {
                    const id = groupAction.group?.id;
                    setGroupAction(null);
                    if (id) onChooseGroup(id);
                  }}
                >
                  Editar diplomados
                </button>
              )}
              <button
                type="button"
                className="danger"
                disabled={!directory.canEdit}
                onClick={() =>
                  setGroupAction({ ...groupAction, kind: "archive" })
                }
              >
                Eliminar grupo
              </button>
            </div>
          ) : (
            <p>
              ¿Eliminar el grupo «{groupAction.group?.name}» de la lista? Sus
              diplomados, hojas, ventas, vínculos e historial se conservarán. La
              publicidad seguirá igual.
            </p>
          )}
        </InventoryGroupActionDialog>
      )}
      {categoryPicker && (
        <InventoryGroupCategoryDialog
          title={
            categoryPicker === "primary"
              ? "Categoría principal"
              : "Categoría secundaria"
          }
          options={
            categoryPicker === "primary" ? primaryOptions : secondaryOptions
          }
          values={categoryPicker === "primary" ? primary : secondary}
          onApply={(values) => {
            if (categoryPicker === "primary") setPrimary(values);
            else setSecondary(values);
            setCategoryPicker(null);
          }}
          onClose={() => setCategoryPicker(null)}
        />
      )}
      {usageEditing && (
        <InventoryGroupUsageDialog
          item={usageEditing.item.name}
          country={
            countryOptions.find((c) => c.code === usageEditing.country)?.name ??
            usageEditing.country
          }
          cell={usageCell(usageEditing.item, usageEditing.country)}
          busy={busy}
          error={error}
          onSave={saveUsage}
          onClose={() => {
            if (!busy) {
              setUsageEditing(null);
              setError("");
            }
          }}
        />
      )}
      {observations && (
        <InventoryDiplomaObservations
          listId={directory.listId}
          name={observations}
          columns={evaluationColumns}
          initialColumn={evaluationColumn}
          onClose={() => setObservations("")}
        />
      )}
      {notice && (
        <p role="status" className="inventory-group-notice">
          {notice}
        </p>
      )}
      {managementTab === "top" ? (
        topContent
      ) : (
        <>
          <div className="inventory-saved-groups" aria-label="Grupos guardados">
            {(managementTab !== "edit" || group) && (
              <label className="inventory-group-name">
                {group ? "Nombre del grupo" : "Nombre del nuevo grupo"}
                <input
                  aria-label="Nombre del grupo"
                  value={name}
                  maxLength={100}
                  disabled={busy || externalBusy}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <div className="inventory-group-browser">
              <label>
                Mis grupos
                <SheetSearchSelect
                  label="Buscar grupos"
                  className="primary inventory-group-find"
                  value={browsedGroupId}
                  placeholder="Buscar grupos…"
                  disabled={busy || externalBusy}
                  options={[
                    { value: "", label: "Todos los grupos" },
                    ...(browsedGroup
                      ? [
                          {
                            value: "__actions__",
                            label: "Administrar grupo seleccionado…",
                          },
                        ]
                      : []),
                    ...directory.groups.map((entry) => ({
                      value: entry.id,
                      label: `${entry.name} (${entry.members.length})`,
                    })),
                  ]}
                  onSelect={(id) => {
                    if (id === "__actions__" && browsedGroup) {
                      setError("");
                      setGroupAction({ kind: "menu", group: browsedGroup });
                    } else showGroup(id);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={
                  !browsedGroup ||
                  busy ||
                  pinnedGroupIds.includes(browsedGroupId)
                }
                onClick={() =>
                  pinGroups((current) => [...current, browsedGroupId])
                }
              >
                Fijar
              </button>
              {pinnedGroupIds.map((id) => {
                const entry = directory.groups.find(
                  (candidate) => candidate.id === id,
                );
                return entry ? (
                  <span
                    className="inventory-group-pin"
                    key={id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (busy || externalBusy) return;
                      setError("");
                      setGroupAction({ kind: "menu", group: entry });
                    }}
                  >
                    <button
                      type="button"
                      aria-pressed={browsedGroupId === id}
                      disabled={busy || externalBusy}
                      onClick={() => showGroup(id)}
                    >
                      {entry.name} <small>{entry.members.length}</small>
                    </button>
                    <button
                      type="button"
                      aria-label={`Acciones de ${entry.name}`}
                      disabled={busy || externalBusy}
                      onClick={() => {
                        setError("");
                        setGroupAction({ kind: "menu", group: entry });
                      }}
                    >
                      ⋯
                    </button>
                    <button
                      type="button"
                      aria-label={`Desfijar ${entry.name}`}
                      disabled={busy}
                      onClick={() =>
                        pinGroups((current) =>
                          current.filter((value) => value !== id),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ) : null;
              })}
            </div>
            {(managementTab !== "edit" || group) && (
              <div className="row inventory-group-proposal">
                <label className="inventory-group-inline-search">
                  {editing && !replacing
                    ? "Añadir inventario"
                    : "Buscar inventario"}
                  {editing && !replacing ? (
                    <SheetSearchSelect
                      label="Añadir diplomado al grupo"
                      value=""
                      placeholder="Buscar diplomado para añadir…"
                      disabled={busy || externalBusy || !directory.canEdit}
                      options={pool
                        .filter((item) => !ids.includes(item.id))
                        .map((item) => ({ value: item.id, label: item.name }))}
                      onSelect={(id) => {
                        setIds((current) => [...new Set([...current, id])]);
                        setCheckedIds((current) => [
                          ...new Set([...current, id]),
                        ]);
                        setNotice(
                          "Diplomado añadido al borrador. Guarda los cambios del grupo.",
                        );
                      }}
                    />
                  ) : (
                    <input
                      type="search"
                      aria-label="Buscar inventario para grupo"
                      placeholder="Nombre del diplomado…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  )}
                </label>
                {
                  <>
                    <button
                      disabled={busy || !count || count > 100}
                      onClick={() => {
                        const proposal = diverseTrialItems(
                          proposalPool,
                          count,
                          [],
                        );
                        setIds((current) => [
                          ...new Set([
                            ...current,
                            ...proposal.map((i) => i.id),
                          ]),
                        ]);
                        setOnlySelected(true);
                        if (editing) {
                          setCheckedIds((current) => [
                            ...new Set([
                              ...current,
                              ...proposal.map((item) => item.id),
                            ]),
                          ]);
                          setOnlyChecked(true);
                        }
                        setReplacing(null);
                        setError(
                          proposal.length < count
                            ? `Se encontraron ${proposal.length} categorías principales diferentes con los filtros actuales. Revisa la propuesta.`
                            : "",
                        );
                      }}
                    >
                      Proponer al azar
                    </button>
                    <label>
                      Cantidad
                      <input
                        type="number"
                        aria-label="Cantidad aleatoria del grupo"
                        min={1}
                        max={100}
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                      />
                    </label>
                  </>
                }
                {!editing && (
                  <label>
                    <input
                      type="checkbox"
                      checked={onlySelected}
                      onChange={(e) => setOnlySelected(e.target.checked)}
                    />{" "}
                    {editing ? "Selección" : "Ver seleccionados"} (
                    {selectedIds.length})
                  </label>
                )}
                {editing && (
                  <label>
                    <input
                      type="checkbox"
                      aria-label="Ver seleccionados para reemplazar"
                      checked={onlyChecked}
                      onChange={(event) => setOnlyChecked(event.target.checked)}
                    />
                    Ver seleccionados
                  </label>
                )}
                <button
                  type="button"
                  className="inventory-group-clear"
                  disabled={busy}
                  onClick={() => {
                    setQuery("");
                    setPrimary([]);
                    setSecondary([]);
                    setSheets([]);
                    setBrowsedGroupId(group?.id ?? "");
                    setOnlySelected(false);

                    setOnlyChecked(false);
                  }}
                >
                  Limpiar filtros
                </button>
                <button
                  type="button"
                  className="inventory-group-deselect"
                  disabled={busy || !selectedIds.length}
                  onClick={() => {
                    setSelectedIds([]);
                    setOnlySelected(false);
                    setOnlyChecked(false);
                  }}
                >
                  Quitar selección
                </button>
              </div>
            )}
          </div>
          {managementTab === "edit" && !group && (
            <p className="inventory-group-empty">
              Elige un grupo en Mis grupos para ver y editar sus diplomados.
            </p>
          )}
          {(managementTab !== "edit" || group) && (
            <>
              {selectedIds.length > 0 && (
                <div className="inventory-group-search-section">
                  <div
                    className="inventory-group-selected"
                    aria-label="Diplomados seleccionados para el grupo"
                  >
                    <div className="inventory-group-selection-actions">
                      <strong>{selectedIds.length} seleccionados</strong>
                      {editing && group && onGroupsChanged && (
                        <button
                          type="button"
                          disabled={
                            busy ||
                            externalBusy ||
                            selectedIds.length > 100 ||
                            selectedIds.some(
                              (id) =>
                                !group.members.some(
                                  (member) => member.itemId === id,
                                ),
                            )
                          }
                          onClick={() => {
                            setReplacementMode("ANY");
                            setReplacementIds([...selectedIds]);
                          }}
                        >
                          Reemplazar seleccionados
                        </button>
                      )}
                      {onGroupsChanged && !editing && (
                        <button
                          type="button"
                          className="primary"
                          disabled={
                            busy ||
                            externalBusy ||
                            !directory.canEdit ||
                            !directory.groups.length ||
                            selectedIds.length > 1500
                          }
                          onClick={() => {
                            setError("");
                            setGroupAction({ kind: "assign", group: null });
                          }}
                        >
                          Asignar a grupo
                        </button>
                      )}
                    </div>
                    <div className="inventory-group-selected-chips">
                      {selectedIds.map((id) => (
                        <span
                          key={id}
                          className="inventory-group-selection-chip"
                        >
                          <span
                            title={
                              catalogById.get(id)?.name ??
                              "Diplomado no disponible"
                            }
                          >
                            {catalogById.get(id)?.name ??
                              "Diplomado no disponible"}
                          </span>
                          <button
                            type="button"
                            disabled={busy || externalBusy}
                            aria-label={
                              "Quitar de selección " +
                              (catalogById.get(id)?.name ?? "diplomado")
                            }
                            onClick={() => {
                              setSelectedIds((current) =>
                                current.filter((value) => value !== id),
                              );
                              if (replacing === id) setReplacing(null);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {!selectedIds.length && (
                        <small>
                          Los diplomados que marques aparecerán aquí.
                        </small>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {!countryOptions.length && (
                <p role="status">
                  Vincula una hoja de país al inventario para mostrar sus
                  columnas.
                </p>
              )}
              {warning && <small role="status">{warning}</small>}
              {replacing && (
                <p role="status" className="notice">
                  Elige el reemplazo de{" "}
                  <strong>
                    {catalog.find((i) => i.id === replacing)?.name}
                  </strong>{" "}
                  usando los filtros.{" "}
                  <button onClick={() => setReplacing(null)}>
                    Cancelar reemplazo
                  </button>
                </p>
              )}
              <div className="table-scroll inventory-group-picker-table">
                <table
                  className="sheet-resizable-table inventory-group-matrix"
                  style={{
                    tableLayout: "fixed",
                    width: columnSpecs.reduce(
                      (n, c) => n + (widths[c.key] ?? c.width),
                      0,
                    ),
                    minWidth: 0,
                  }}
                >
                  <colgroup>
                    {columnSpecs.map((c) => (
                      <col
                        key={c.key}
                        style={{ width: widths[c.key] ?? c.width }}
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Seleccionar inventarios filtrados para grupo"
                          disabled={busy || !eligible.length || !!replacing}
                          checked={
                            !!eligible.length &&
                            eligible.every((i) => selectedIds.includes(i.id))
                          }
                          onChange={(e) =>
                            setSelectedIds((v) =>
                              e.target.checked
                                ? [
                                    ...new Set([
                                      ...v,
                                      ...eligible.map((i) => i.id),
                                    ]),
                                  ]
                                : v.filter(
                                    (id) => !eligible.some((i) => i.id === id),
                                  ),
                            )
                          }
                        />{" "}
                        Diplomado ({filtered.length}){handle(0)}
                      </th>
                      {columnSpecs.slice(1).map((c, index) => (
                        <th key={c.key}>
                          {c.key.startsWith("usage:") ? (
                            <abbr title={c.label}>
                              {c.key === "usage:SV"
                                ? "SAL"
                                : c.label.slice(0, 3).toLocaleUpperCase("es")}
                            </abbr>
                          ) : (
                            c.label
                          )}
                          {(c.key === "primary" || c.key === "secondary") && (
                            <button
                              type="button"
                              className="inventory-group-category-heading"
                              aria-label={
                                c.key === "primary"
                                  ? "Elegir categoría principal para grupo"
                                  : "Elegir categoría secundaria para grupo"
                              }
                              onClick={() =>
                                setCategoryPicker(
                                  c.key === "primary" ? "primary" : "secondary",
                                )
                              }
                            >
                              {(c.key === "primary" ? primary : secondary).join(
                                " · ",
                              ) || "Elegir…"}{" "}
                              ▾
                            </button>
                          )}
                          {handle(index + 1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((i, index) => {
                      const heading =
                        i.primaryNames.join(" · ") || "Sin categoría principal";
                      const assigned = occupied.get(categoryKey(i.name));
                      const memberGroup = directory.groups.find((g) =>
                        g.members.some(
                          (m) => categoryKey(m.name) === categoryKey(i.name),
                        ),
                      );
                      return (
                        <Fragment key={i.id}>
                          {(index === 0 ||
                            heading !==
                              (visibleItems[index - 1].primaryNames.join(
                                " · ",
                              ) || "Sin categoría principal")) && (
                            <tr className="inventory-group-band">
                              <th colSpan={columnSpecs.length}>{heading}</th>
                            </tr>
                          )}
                          <tr
                            data-group-candidate={i.name}
                            data-selected={
                              selectedIds.includes(i.id) || undefined
                            }
                          >
                            <td>
                              <label>
                                <input
                                  type="checkbox"
                                  aria-label={"Incluir " + i.name}
                                  checked={selectedIds.includes(i.id)}
                                  disabled={
                                    busy ||
                                    (!!assigned && !!replacing) ||
                                    (!!replacing && ids.includes(i.id))
                                  }
                                  onChange={() => {
                                    if (replacing) {
                                      setIds((v) =>
                                        v.map((x) =>
                                          x === replacing ? i.id : x,
                                        ),
                                      );
                                      setCheckedIds((current) =>
                                        current.map((id) =>
                                          id === replacing ? i.id : id,
                                        ),
                                      );
                                      setReplacing(null);
                                      setError("");
                                    } else toggle(i.id);
                                  }}
                                />{" "}
                                {i.name}
                              </label>
                            </td>
                            <td>{i.primaryNames.join(" · ") || "—"}</td>
                            <td>{i.secondaryNames?.join(" · ") || "—"}</td>
                            <td>
                              {memberGroup && onGroupsChanged ? (
                                <SheetSearchSelect
                                  label={`Cambiar grupo de ${i.name}`}
                                  value={memberGroup.id}
                                  placeholder={memberGroup.name}
                                  disabled={
                                    busy || externalBusy || !directory.canEdit
                                  }
                                  options={directory.groups.map((entry) => ({
                                    value: entry.id,
                                    label: entry.name,
                                  }))}
                                  onSelect={(targetId) => {
                                    if (targetId === memberGroup.id) return;
                                    const target = directory.groups.find(
                                      (entry) => entry.id === targetId,
                                    );
                                    if (target) {
                                      setError("");
                                      setGroupAction({
                                        kind: "move",
                                        group: target,
                                        source: memberGroup,
                                        item: i,
                                      });
                                    }
                                  }}
                                />
                              ) : (
                                <span className="inventory-group-chip">
                                  {memberGroup?.name ??
                                    (ids.includes(i.id) ? name : "Sin grupo")}
                                </span>
                              )}
                            </td>
                            {countryOptions.map((c) => {
                              const cell = usageCell(i, c.code),
                                status =
                                  cell.mode === "USED"
                                    ? "USED"
                                    : cell.mode === "UNUSED"
                                      ? "NEVER"
                                      : cell.nextUsedAt &&
                                          Date.parse(cell.nextUsedAt) <= clock
                                        ? "USED"
                                        : cell.automatic;
                              const label =
                                status === "USED"
                                  ? "✓ Usado"
                                  : status === "TEST"
                                    ? "◷ En prueba"
                                    : status === "UNKNOWN"
                                      ? "? Sin confirmar"
                                      : "○ Falta usar";
                              return (
                                <td
                                  key={c.code}
                                  className="inventory-group-country-cell"
                                >
                                  <button
                                    type="button"
                                    className="inventory-group-usage"
                                    data-usage={status}
                                    data-manual={
                                      cell.mode !== "AUTO" || undefined
                                    }
                                    aria-label={`Editar uso de ${i.name} en ${c.name}: ${label}`}
                                    title={`${label} · ${cell.mode === "AUTO" ? "Automático" : "Manual"}${cell.activationHours === null ? " · Inicio desconocido" : ` · ${cell.activationHours.toFixed(1)} h registradas`}`}
                                    disabled={
                                      busy || externalBusy || !directory.canEdit
                                    }
                                    onClick={() =>
                                      setUsageEditing({
                                        item: i,
                                        country: c.code,
                                      })
                                    }
                                  >
                                    <span aria-hidden="true">
                                      {status === "USED"
                                        ? "✓"
                                        : status === "TEST"
                                          ? "◷"
                                          : status === "UNKNOWN"
                                            ? "?"
                                            : "—"}
                                    </span>
                                    {cell.mode !== "AUTO" && (
                                      <small aria-hidden="true">•</small>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className="inventory-group-country-detail"
                                    aria-label={`Ver detalle de ${i.name} en ${c.name}`}
                                    title={`Ver detalle guardado en ${c.name}`}
                                    disabled={
                                      !evaluationColumns.some((column) =>
                                        column.value.endsWith(":" + c.code),
                                      )
                                    }
                                    onClick={() => {
                                      setEvaluationColumn(
                                        evaluationColumns.find((column) =>
                                          column.value.endsWith(":" + c.code),
                                        )!.value,
                                      );
                                      setObservations(i.name);
                                    }}
                                  >
                                    Detalle
                                  </button>
                                </td>
                              );
                            })}
                            <td>
                              <button
                                type="button"
                                className="inventory-group-history"
                                onClick={() => setObservations(i.name)}
                              >
                                Antecedentes ↗
                              </button>
                              {assigned ? (
                                <small>En {assigned}</small>
                              ) : (
                                ids.includes(i.id) && (
                                  <div className="inventory-group-row-actions">
                                    <button
                                      disabled={busy}
                                      onClick={() => {
                                        if (
                                          editing &&
                                          group?.members.some(
                                            (member) => member.itemId === i.id,
                                          )
                                        ) {
                                          setReplacementMode("ANY");
                                          setReplacementIds([i.id]);
                                          return;
                                        }
                                        setReplacing(i.id);
                                        setOnlySelected(false);
                                        setQuery("");
                                        setPrimary([]);
                                        setSecondary([]);
                                        setSheets([]);
                                      }}
                                    >
                                      ↔ Reemplazar
                                    </button>
                                    <button
                                      disabled={busy}
                                      onClick={() => {
                                        if (
                                          editing &&
                                          group?.members.some(
                                            (member) => member.itemId === i.id,
                                          )
                                        ) {
                                          setReplacementMode("SAME");
                                          setReplacementIds([i.id]);
                                        } else replaceRandom(i, true);
                                      }}
                                    >
                                      Azar · misma
                                    </button>
                                    <button
                                      disabled={busy}
                                      onClick={() => {
                                        if (
                                          editing &&
                                          group?.members.some(
                                            (member) => member.itemId === i.id,
                                          )
                                        ) {
                                          setReplacementMode("OTHER");
                                          setReplacementIds([i.id]);
                                        } else replaceRandom(i, false);
                                      }}
                                    >
                                      Azar · otra
                                    </button>
                                    <button
                                      disabled={busy}
                                      aria-label={"Quitar del grupo " + i.name}
                                      onClick={() => {
                                        setIds((v) =>
                                          v.filter((x) => x !== i.id),
                                        );
                                        setCheckedIds((v) =>
                                          v.filter((x) => x !== i.id),
                                        );
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                )
                              )}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={columnSpecs.length}>
                          No hay resultados con estos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {error && (
                <p role="alert" className="notice error">
                  {error}
                </p>
              )}
              <footer>
                <div className="inventory-group-pagination">
                  <span>
                    {ordered.length ? (currentPage - 1) * pageSize + 1 : 0}–
                    {Math.min(currentPage * pageSize, ordered.length)} de{" "}
                    {ordered.length} diplomados
                  </span>
                  <label>
                    Por página
                    <select
                      aria-label="Diplomados por página del grupo"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      {[25, 50, 100, 200].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    {currentPage} / {pages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Siguiente
                  </button>
                </div>

                <button disabled={busy} onClick={onClose}>
                  Cancelar
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !directory.canEdit ||
                    committed ||
                    !!replacing ||
                    ids.length > 1500 ||
                    !name.trim() ||
                    (!group &&
                      (!ids.length ||
                        !name.trim() ||
                        !countries.length ||
                        countries.length > 20))
                  }
                  onClick={() => void save()}
                >
                  {busy
                    ? "Guardando…"
                    : group
                      ? "Guardar cambios"
                      : "Crear grupo"}
                </button>
              </footer>
            </>
          )}
        </>
      )}
    </dialog>
  );
}

function InventoryGroupCategoryDialog({
  title,
  options,
  values,
  onApply,
  onClose,
}: {
  title: string;
  options: string[];
  values: string[];
  onApply: (values: string[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false),
    [query, setQuery] = useState(""),
    [draft, setDraft] = useState(values);
  useEffect(() => {
    ref.current?.showModal();
    search.current?.focus();
  }, []);
  const choices = options.filter((option) => matchesSearchWords(option, query));
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-group-category-dialog"
      data-expanded={expanded || undefined}
      aria-label={`Elegir ${title.toLocaleLowerCase("es")}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h3>{title}</h3>
        <button
          type="button"
          aria-label={
            expanded
              ? "Restaurar selector de categorías"
              : "Maximizar selector de categorías"
          }
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "↙ Restaurar" : "⛶ Maximizar"}
        </button>
        <button
          type="button"
          className="ui-close-button"
          aria-label="Cerrar selector de categorías"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <input
        ref={search}
        type="search"
        aria-label={`Buscar ${title.toLocaleLowerCase("es")}`}
        placeholder="Buscar categoría…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <fieldset>
        <label>
          <input
            type="checkbox"
            checked={!draft.length}
            onChange={() => setDraft([])}
          />{" "}
          Todas las categorías
        </label>
        {choices.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={draft.includes(option)}
              onChange={(e) =>
                setDraft((current) =>
                  e.target.checked
                    ? [...current, option]
                    : current.filter((v) => v !== option),
                )
              }
            />
            {option}
          </label>
        ))}
        {!choices.length && <p>Sin coincidencias.</p>}
      </fieldset>
      <footer>
        <span>
          {draft.length
            ? `${draft.length} seleccionadas`
            : "Todas las categorías"}
        </span>
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => onApply(draft)}
        >
          Ver diplomados
        </button>
      </footer>
    </dialog>
  );
}

function InventoryGroupUsageDialog({
  item,
  country,
  cell,
  busy,
  error,
  onSave,
  onClose,
}: {
  item: string;
  country: string;
  cell: GroupUsageCell;
  busy: boolean;
  error: string;
  onSave: (mode: GroupUsageMode) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-group-usage-dialog"
      data-expanded={expanded || undefined}
      aria-label={`Uso de ${item} en ${country}`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h3>Uso en {country}</h3>
        <button
          type="button"
          aria-label={
            expanded ? "Restaurar ventana de uso" : "Maximizar ventana de uso"
          }
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "↙ Restaurar" : "⛶ Maximizar"}
        </button>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar uso"
        >
          ×
        </button>
      </header>
      <strong>{item}</strong>
      <p>
        Este estado sirve para organizar los grupos. No activa ni pausa
        campañas.
      </p>
      <small>
        Registro automático:{" "}
        {cell.automatic === "USED"
          ? "Usado"
          : cell.automatic === "TEST"
            ? "En prueba"
            : cell.automatic === "UNKNOWN"
              ? "Sin confirmar"
              : "Falta usar"}
        {cell.activationHours !== null
          ? ` · ${cell.activationHours.toFixed(1)} horas`
          : " · Sin inicio verificable"}
        .
      </small>
      <div className="inventory-group-usage-options">
        {(
          [
            ["USED", "✓ Marcar usado"],
            ["UNUSED", "○ Marcar falta usar"],
            ["AUTO", "↻ Automático · 12 horas"],
          ] as const
        ).map(([mode, label]) => (
          <button
            type="button"
            key={mode}
            aria-pressed={cell.mode === mode}
            disabled={busy}
            onClick={() => void onSave(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </footer>
    </dialog>
  );
}

export function InventoryGroupSelect({
  groups,
  label,
  disabled,
  onSelect,
  value = "",
  placeholder = "Asignar grupo…",
}: {
  groups: TrialGroup[];
  label: string;
  disabled?: boolean;
  onSelect: (id: string) => void | Promise<void>;
  value?: string;
  placeholder?: string;
}) {
  return (
    <SheetSearchSelect
      label={label}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      options={[
        ...groups.map((g) => ({ value: g.id, label: g.name })),
        { value: "new", label: "+ Crear grupo" },
      ]}
      onSelect={(id) => {
        if (id) return onSelect(id);
      }}
    />
  );
}

function InventoryGroupActionDialog({
  title,
  busy,
  error,
  canAccept,
  showAccept = true,
  onAccept,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  error: string;
  canAccept: boolean;
  showAccept?: boolean;
  onAccept: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-group-action"
      aria-label={title}
      data-expanded={expanded || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h3>{title}</h3>
        <button
          type="button"
          aria-label={
            expanded ? "Restaurar acción de grupo" : "Maximizar acción de grupo"
          }
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Restaurar" : "Maximizar"}
        </button>
        <button
          type="button"
          className="ui-close-button"
          aria-label="Cerrar acción de grupo"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {children}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        {showAccept && (
          <button
            type="button"
            className="primary"
            disabled={busy || !canAccept}
            onClick={onAccept}
          >
            {busy ? "Guardando…" : "Aceptar"}
          </button>
        )}
      </footer>
    </dialog>
  );
}
