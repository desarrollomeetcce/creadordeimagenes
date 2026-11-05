"use client";
import dynamic from "next/dynamic";
const InventoryMetaPicker = dynamic(()=>import("./inventory-meta-picker").then(m=>m.InventoryMetaPicker));
import { InventoryGroupCategoryAdditions } from "./inventory-group-category-additions";
import {
  randomCategoryAdditions,
  randomInventoryAdditions,
  replaceRandomAddition,
} from "../../lib/meta-ads/inventory-group-addition-policy";
import { InventoryGroupReplacements } from "./inventory-group-replacements";
import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import {
  orderedGroupCountries,
  moveGroupCountry,
} from "../../lib/meta-ads/inventory-group-country-order";
import { InventoryGroupUsageBatch } from "./inventory-group-usage-batch";
import { groupCountryCampaignLabels } from "../../lib/meta-ads/inventory-group-country-state";
import { groupUsageStatus } from "../../lib/meta-ads/inventory-group-usage-policy";
import { financialRequest as api } from "./financial-request";
import { useGroupDraftState } from "./use-group-draft-state";
import { CurrentUserId } from "./role-guide";
import { SheetSearchSelect } from "./sheet-search-select";
import { matchesSearchWords } from "../../lib/search";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { type TrialItem } from "../../lib/meta-ads/inventory-trial-policy";
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
  group: selectedGroup,
  initialNames,
  onClose,
  onSaved,
  onGroupsChanged,
  onUsageChange,
  onUsageBatchChange,
  topContent,
  initialTab,
  onChooseGroup,
  onTabChange,
  externalBusy = false,
  evaluationColumns = [],
}: {
  evaluationColumns?: { value: string; label: string }[];
  externalBusy?: boolean;
  topContent?: ReactNode;
  initialTab?: "create" | "edit" | "top";
  onChooseGroup?: (id: string) => void;
  onTabChange?: (tab: "create" | "edit" | "top") => void;
  directory: TrialDirectory;
  group?: TrialGroup;
  initialNames: string[];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
  onGroupsChanged?: () => Promise<void>;
  onUsageChange?: (key: string, cell: GroupUsageCell) => void;
  onUsageBatchChange?: (updates: Record<string, GroupUsageCell>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [metaPicker,setMetaPicker]=useState(false);
  const userId = useContext(CurrentUserId);
  const pinKey = `inventory-group-pins:v1:${userId}:${directory.listId}`;
  const [groupAction, setGroupAction] = useState<{
    kind: "assign" | "archive" | "rename" | "menu" | "move";
    source?: TrialGroup;
    item?: TrialItem;
    itemIds?: string[];
    group: TrialGroup | null;
  } | null>(null);
  const groupActionPending = useRef(false);
  const [assignDraft, setAssignDraft] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [notice, setNotice] = useState("");
  const [managementTab, setManagementTab] = useState<"create" | "edit" | "top">(
    initialTab ?? (selectedGroup ? "edit" : "create"),
  );
  const group = managementTab === "edit" ? selectedGroup : undefined;
  const draftKey = group ? "edit:" + group.id : "create";
  function changeTab(tab: "create" | "edit" | "top") {
    setManagementTab(tab);
    setError("");
    setNotice("");
    onTabChange?.(tab);
  }
  useEffect(() => {
    if (initialTab) setManagementTab(initialTab);
  }, [initialTab]);
  const [proposal, setProposal] = useState<{
    items: TrialItem[];
    requested: number;
    key: string;
    category?: string;
  } | null>(null);
  const [additionCategory, setAdditionCategory] = useState<string | null>(null);
  const [queuedIds, setQueuedIds] = useGroupDraftState<string[]>(draftKey, []);
  const [removal, setRemoval] = useState<{
    ids: string[];
    persisted: string[];
    groupId?: string;
    revision: number;
    groupName: string;
    baseName: string;
    baseIds: string[];
  } | null>(null);
  const [reviewError, setReviewError] = useState("");
  const removePending = useRef(false);
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
  const [countryOrder, setCountryOrder] = useWorkbookPreference<string[]>(
    directory.listId,
    "group-country-order",
    [],
  );
  const countryOptions = useMemo(
    () => orderedGroupCountries(directory.countries, countryOrder),
    [directory.countries, countryOrder],
  );
  const draggedCountry = useRef<string | null>(null);
  function moveCountry(from: string, to: string) {
    if (from !== to)
      setCountryOrder(
        moveGroupCountry(
          countryOptions.map((country) => country.code),
          from,
          to,
        ),
      );
  }
  function clearCountryDrag() {
    draggedCountry.current = null;
    dialog.current
      ?.querySelectorAll<HTMLElement>("[data-country-dragover]")
      .forEach((element) => delete element.dataset.countryDragover);
  }
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
  const [usageBatch, setUsageBatch] = useState<{
    mode: "USED" | "UNUSED";
    items: TrialItem[];
  } | null>(null);
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
    { key: "selection", label: "Acciones", width: 170 },
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
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const savePending = useRef(false);
  const [name, setName] = useGroupDraftState(
    draftKey,
    group?.name ?? "Grupo " + (directory.groups.length + 1),
  );
  const [ids, setIds] = useGroupDraftState(draftKey, () => [
    ...new Set([
      ...(group?.members.map((m) => m.itemId) ?? []),
      ...(!group
        ? directory.catalog
            .filter((i) =>
              initialNames.some((n) => categoryKey(n) === categoryKey(i.name)),
            )
            .map((i) => i.id)
        : []),
    ]),
  ]);
  const [draftBase, setDraftBase] = useGroupDraftState(draftKey, () => ({
    revision: group?.revision ?? 0,
    name: group?.name ?? "",
    ids: group?.members.map((member) => member.itemId) ?? [],
  }));
  useEffect(() => {
    if (!group || draftBase.revision === group.revision) return;
    const clean =
      name === draftBase.name &&
      ids.length === draftBase.ids.length &&
      ids.every((id) => draftBase.ids.includes(id));
    if (clean) {
      const next = group.members.map((member) => member.itemId);
      setName(group.name);
      setIds(next);
      setCheckedIds((current) => current.filter((id) => next.includes(id)));
      setDraftBase({ revision: group.revision, name: group.name, ids: next });
    } else
      setNotice(
        "El grupo cambió mientras tienes cambios pendientes. Revisa antes de guardar.",
      );
  }, [group?.id, group?.revision, draftKey]);
  const editing = managementTab === "edit" && !!group;
  const [checkedIds, setCheckedIds] = useGroupDraftState<string[]>(
    draftKey,
    [],
  );
  const [replacementIds, setReplacementIds] = useState<string[] | null>(null);
  const [replacementMode, setReplacementMode] = useState<
    "ANY" | "SAME" | "OTHER" | "DIVERSE"
  >("ANY");
  const [onlyChecked, setOnlyChecked] = useGroupDraftState(draftKey, false);
  const selectedIds = editing ? checkedIds : ids;
  const setSelectedIds = editing ? setCheckedIds : setIds;
  const draftAvailable = managementTab === "create" && !group && !!name.trim();
  const assignmentIds =
    groupAction?.kind === "assign"
      ? (groupAction.itemIds ?? selectedIds)
      : selectedIds;
  const showGroup = (id: string) => {
    if (managementTab === "edit" && id && onChooseGroup) {
      onChooseGroup(id);
      setManagementTab("edit");
    } else setBrowsedGroupId(id);
  };
  const countries = group?.countries ?? countryOptions.map((c) => c.code);
  const [browsedGroupId, setBrowsedGroupId] = useGroupDraftState(
    draftKey,
    group?.id ?? "",
  );
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
  const browsedMembers = useMemo(
    () =>
      browsedGroup
        ? new Set(browsedGroup.members.map((member) => member.itemId))
        : null,
    [browsedGroup],
  );
  const [query, setQuery] = useGroupDraftState(draftKey, ""),
    [primary, setPrimary] = useGroupDraftState<string[]>(draftKey, []),
    [secondary, setSecondary] = useGroupDraftState<string[]>(draftKey, []),
    [sheets, setSheets] = useGroupDraftState<string[]>(draftKey, []);
  const [count, setCount] = useGroupDraftState(draftKey, 10),
    [onlySelected, setOnlySelected] = useGroupDraftState(draftKey, !!group),
    [replacing, setReplacing] = useGroupDraftState<string | null>(
      draftKey,
      null,
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const catalog = directory.catalog;
  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [item.id, item])),
    [catalog],
  );
  const groupsByName = useMemo(
    () =>
      new Map(
        directory.groups.flatMap((group) =>
          group.members.map(
            (member) =>
              [
                categoryKey(
                  catalogById.get(member.itemId)?.name ?? member.name,
                ),
                group,
              ] as const,
          ),
        ),
      ),
    [directory.groups, catalogById],
  );
  const occupied = useMemo(
    () =>
      new Map(
        [...groupsByName]
          .filter(([, entry]) => entry.id !== group?.id)
          .map(([key, entry]) => [key, entry.name]),
      ),
    [groupsByName, group?.id],
  );
  function assignToDraft(itemIds: string[]) {
    const assigned = itemIds.flatMap((id) => {
      const item = catalogById.get(id);
      const existing = item && groupsByName.get(categoryKey(item.name));
      return existing ? [existing.name] : [];
    });
    if (assigned.length)
      throw new Error(
        `Un diplomado ya pertenece a ${[...new Set(assigned)].join(", ")}. Para trasladarlo, guarda primero el grupo nuevo y cambia su grupo desde la fila.`,
      );
    setIds((current) => [...new Set([...current, ...itemIds])]);
    setNotice(
      `Asignado al borrador «${name.trim()}». Se guardará al pulsar Crear grupo.`,
    );
  }
  const primaryOptions = useMemo(
    () =>
      [...new Set(catalog.flatMap((i) => i.primaryNames))].sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [catalog],
  );
  const secondaryOptions = useMemo(
    () =>
      [...new Set(catalog.flatMap((i) => i.secondaryNames ?? []))].sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [catalog],
  );
  const sheetOptions = useMemo(
    () => [
      ...new Map(
        catalog.flatMap((i) => (i.sheets ?? []).map((s) => [s.id, s] as const)),
      ).values(),
    ],
    [catalog],
  );
  const pool = useMemo(
    () => catalog.filter((i) => !occupied.has(categoryKey(i.name))),
    [catalog, occupied],
  );
  const matching = useMemo(
    () =>
      catalog.filter(
        (i) =>
          (editing && !replacing
            ? ids.includes(i.id)
            : replacing || !browsedMembers || browsedMembers.has(i.id)) &&
          matchesSearchWords(i.name, query) &&
          (!primary.length ||
            i.primaryNames.some((n) => primary.includes(n))) &&
          (!secondary.length ||
            i.secondaryNames?.some((n) => secondary.includes(n))) &&
          (!sheets.length || i.sheets?.some((s) => sheets.includes(s.id))),
      ),
    [
      catalog,
      editing,
      replacing,
      ids,
      browsedMembers,
      query,
      primary,
      secondary,
      sheets,
    ],
  );
  const filtered = useMemo(
    () =>
      editing
        ? onlyChecked
          ? matching.filter((item) => checkedIds.includes(item.id))
          : matching
        : onlySelected
          ? matching.filter((item) => ids.includes(item.id))
          : matching,
    [matching, editing, onlyChecked, checkedIds, onlySelected, ids],
  );
  const eligible = filtered;
  const proposalPool = (editing ? catalog : matching).filter(
    (i) =>
      !occupied.has(categoryKey(i.name)) &&
      !queuedIds.includes(i.id) &&
      (!editing || !ids.includes(i.id)),
  );
  const [page, setPage] = useGroupDraftState(draftKey, 1),
    [pageSize, setPageSize] = useGroupDraftState(draftKey, 50);
  useEffect(() => {
    setPage(1);
  }, [query, primary, secondary, onlySelected, browsedGroupId]);
  const ordered = useMemo(
    () =>
      filtered
        .slice()
        .sort(
          (a, b) =>
            a.primaryNames
              .join(" · ")
              .localeCompare(b.primaryNames.join(" · "), "es") ||
            a.name.localeCompare(b.name, "es"),
        ),
    [filtered],
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
  const availableAdditions = pool.filter((item) => !ids.includes(item.id));
  const additionCategoryOptions = [
    ...new Map(
      catalog
        .flatMap((item) => [
          ...item.primaryNames,
          ...(item.secondaryNames ?? []),
        ])
        .map((name) => [categoryKey(name), name]),
    ).values(),
  ]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((name) => ({ value: name, label: name }));
  const addingChipIds = editing ? [...new Set(queuedIds)] : [];
  function toggleQueued(id: string) {
    if (!availableAdditions.some((item) => item.id === id)) return;
    setQueuedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }
  async function acceptQueuedAdditions() {
    if (
      !group ||
      !queuedIds.length ||
      savePending.current ||
      committed ||
      busy ||
      externalBusy ||
      !directory.canEdit
    )
      return;
    if (
      queuedIds.some((id) => {
        const item = catalogById.get(id);
        return (
          !item || occupied.has(categoryKey(item.name)) || ids.includes(id)
        );
      })
    ) {
      setError(
        "El inventario o sus grupos cambiaron. Revisa los diplomados preparados para añadir.",
      );
      return;
    }
    const additions = [...queuedIds];
    const baseIds = [...draftBase.ids];
    savePending.current = true;
    setBusy(true);
    setError("");
    setNotice("Guardando diplomados añadidos…");
    let saved = false;
    try {
      const result: TrialGroup = await api(
        "meta-ads/inventory/trials",
        "POST",
        {
          action: "ADD_MEMBERS",
          listId: directory.listId,
          groupId: group.id,
          revision: draftBase.revision,
          itemIds: additions,
          since: limaToday(),
        },
      );
      saved = true;
      const persisted = result.members.map((member) => member.itemId);
      setIds((current) => [
        ...new Set([
          ...current.filter(
            (id) => !additions.includes(id) || persisted.includes(id),
          ),
          ...persisted.filter((id) => !baseIds.includes(id)),
        ]),
      ]);
      setDraftBase({
        revision: result.revision,
        name: result.name,
        ids: persisted,
      });
      setQueuedIds((current) =>
        current.filter((id) => !additions.includes(id)),
      );
      await onGroupsChanged?.();
      setNotice(
        `Diplomados añadidos a «${result.name}» y guardados automáticamente.`,
      );
    } catch (e) {
      setNotice(saved ? "Los diplomados ya están guardados en el grupo." : "");
      setError(
        (saved
          ? "Se guardaron los añadidos, pero no se pudo actualizar la vista. "
          : "No se pudieron guardar los añadidos; puedes volver a intentarlo. ") +
          (e instanceof Error ? e.message : "Revisa la conexión."),
      );
    } finally {
      savePending.current = false;
      setBusy(false);
    }
  }
  function replaceProposedItem(itemId: string, category?: string) {
    if (!proposal || proposal.key !== draftKey) return;
    const selectedCategory=category ?? proposal.category;
    if (!replaceRandomAddition(proposal.items,itemId,proposalPool,[...ids,...queuedIds],selectedCategory,()=>0)) {
      setReviewError(selectedCategory ? `No hay otro diplomado disponible de «${selectedCategory}». La propuesta se mantiene.` : "No hay otro diplomado disponible. La propuesta se mantiene.");
      return;
    }
    setReviewError("");
    setProposal(current=>{
      if(!current || current.key!==draftKey)return current;
      const items=replaceRandomAddition(current.items,itemId,proposalPool,[...ids,...queuedIds],selectedCategory);
      return items ? {...current,items,category:current.category===selectedCategory?current.category:undefined} : current;
    });
  }
  function approveProposal() {
    if (!proposal || proposal.key !== draftKey) return;
    if (
      proposal.items.some(
        (item) =>
          !catalogById.has(item.id) || occupied.has(categoryKey(item.name)),
      )
    ) {
      setReviewError(
        "El inventario o sus grupos cambiaron. Cierra y propón otra vez.",
      );
      return;
    }
    const additions = proposal.items.map((item) => item.id);
    if (editing)
      setQueuedIds((current) => [...new Set([...current, ...additions])]);
    else {
      setIds((current) => [...new Set([...current, ...additions])]);
      setOnlySelected(true);
    }
    setReplacing(null);
    setProposal(null);
    setReviewError("");
    setError("");
    setNotice(
      `Propuesta aprobada: ${additions.length} diplomados. ${editing ? "Pulsa Aceptar añadidos para incorporarlos." : "Pulsa Crear grupo para guardar el borrador."}`,
    );
  }
  function reviewRemoval(itemIds: string[]) {
    const target = [...new Set(itemIds)].filter((id) => ids.includes(id));
    if (!target.length) return;
    setReviewError("");
    setRemoval({
      ids: target,
      persisted: target.filter((id) =>
        group?.members.some((member) => member.itemId === id),
      ),
      groupId: group?.id,
      revision: draftBase.revision,
      groupName: group?.name ?? name,
      baseName: draftBase.name,
      baseIds: draftBase.ids,
    });
  }
  async function removeFromGroup() {
    if (!removal || removePending.current) return;
    removePending.current = true;
    setBusy(true);
    setReviewError("");
    let written = false;
    try {
      if (removal.groupId && removal.persisted.length) {
        await api("meta-ads/inventory/trials", "POST", {
          action: "REMOVE_MEMBERS",
          listId: directory.listId,
          groups: [
            {
              groupId: removal.groupId,
              revision: removal.revision,
              itemIds: removal.persisted,
            },
          ],
        });
        written = true;
        setDraftBase({
          revision: removal.revision + 1,
          name: removal.baseName,
          ids: removal.baseIds.filter((id) => !removal.persisted.includes(id)),
        });
      }
      const target = new Set(removal.ids);
      setIds((current) => current.filter((id) => !target.has(id)));
      setCheckedIds((current) => current.filter((id) => !target.has(id)));
      setOnlyChecked(false);
      if (replacing && target.has(replacing)) setReplacing(null);
      setRemoval(null);
      setNotice(
        `${target.size} diplomados quitados ${removal.groupId ? "del grupo" : "del borrador"}. Se conservan en el inventario con sus datos.`,
      );
      if (written) await onGroupsChanged?.();
    } catch (error) {
      const message =
        (written
          ? "Se quitaron del grupo, pero no se pudo actualizar la vista. "
          : "") +
        (error instanceof Error
          ? error.message
          : "No se pudo quitar del grupo.");
      if (written) setError(message);
      else setReviewError(message);
    } finally {
      removePending.current = false;
      setBusy(false);
    }
  }
  async function applyGroupAction() {
    if (groupAction?.kind === "assign" && assignDraft) {
      try {
        if (!draftAvailable)
          throw new Error("Escribe el nombre del grupo que estás preparando.");
        assignToDraft(assignmentIds);
        setGroupAction(null);
        setAssignDraft(false);
        setError("");
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo asignar al borrador.",
        );
      }
      return;
    }

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
                ? { itemIds: assignmentIds, since: limaToday() }
                : groupAction.kind === "rename"
                  ? { name: renameValue }
                  : {}),
            },
      );
      saved = true;
      if (groupAction.kind === "assign" && groupAction.itemIds && !editing)
        setIds((current) =>
          current.filter((id) => !groupAction.itemIds!.includes(id)),
        );
      if (groupAction.kind === "move" && groupAction.item) {
        const moved = groupAction.item.id;
        setCheckedIds((current) => current.filter((id) => id !== moved));
        if (group?.id === groupAction.source?.id) {
          setIds((current) => current.filter((id) => id !== moved));
          setDraftBase({
            revision: groupAction.source!.revision + 1,
            name: groupAction.source!.name,
            ids: groupAction
              .source!.members.filter((member) => member.itemId !== moved)
              .map((member) => member.itemId),
          });
        }
      }
      setGroupAction(null);
      if (groupAction.kind === "archive") setBrowsedGroupId("");
      if (groupAction.kind === "rename" && group?.id === target.id) {
        setName(renameValue);
        setDraftBase({
          ...draftBase,
          revision: target.revision + 1,
          name: renameValue,
        });
      }
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
    if (savePending.current || committed) return;
    if (editing && queuedIds.length) {
      setError("Acepta los diplomados de Añadir antes de guardar.");
      return;
    }
    savePending.current = true;
    setBusy(true);
    setError("");
    let saved = false;
    const creating = !group;
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
              revision: draftBase.revision,
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
      saved = true;
      setCommitted(true);
      if (!creating) {
        setIds(result.members.map((member) => member.itemId));
        setDraftBase({
          revision: result.revision,
          name: result.name,
          ids: result.members.map((member) => member.itemId),
        });
      }
      await onSaved(result.id);
      if (creating) {
        setIds([]);
        setName("Grupo " + (directory.groups.length + 2));
        setQuery("");
        setPrimary([]);
        setSecondary([]);
        setSheets([]);
        setOnlySelected(false);
        setBrowsedGroupId("");
        setRequestId(crypto.randomUUID());
      }
      setCommitted(false);
      setNotice(
        creating
          ? `Grupo «${result.name}» creado. Puedes seguir editándolo o crear otro.`
          : `Cambios de «${result.name}» guardados.`,
      );
    } catch (e) {
      setError(
        (saved
          ? "El grupo se guardó. No se pudo actualizar la vista; cierra y vuelve a abrir antes de continuar. "
          : "") + (e instanceof Error ? e.message : "No se pudo guardar."),
      );
    } finally {
      savePending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
    {metaPicker&&<InventoryMetaPicker directory={directory} initialCountry={selectedGroup?.countries.length===1?selectedGroup.countries[0]:""} onClose={()=>setMetaPicker(false)}/>}
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
                onClick={() => changeTab("top")}
              >
                Top · evaluar y reemplazar
              </button>
            )}
            <button
              type="button"
              aria-pressed={managementTab === "create"}
              disabled={busy || externalBusy || !directory.canEdit}
              onClick={() => changeTab("create")}
            >
              Crear
            </button>
            <button
              type="button"
              aria-pressed={managementTab === "edit"}
              disabled={busy || externalBusy || !directory.canEdit}
              onClick={() => changeTab("edit")}
            >
              Editar grupos
            </button>
            <button type="button" disabled={busy||externalBusy} onClick={()=>setMetaPicker(true)}>Anuncios Meta IA</button>
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
      {proposal && (
        <InventoryGroupActionDialog
          title={
            proposal.category
              ? "Revisar propuesta al azar por categoría"
              : "Revisar propuesta al azar"
          }
          busy={false}
          error={reviewError}
          canAccept={proposal.items.length > 0}
          acceptLabel="Aprobar propuesta"
          onAccept={approveProposal}
          onClose={() => {
            setProposal(null);
            setReviewError("");
          }}
        >
          <p>
            Se añadirán {proposal.items.length} diplomados al borrador «{name}».
            Revisa antes de aprobar; todavía no se ha cambiado la selección ni
            el grupo.
          </p>
          {proposal.items.length < proposal.requested && (
            <p>
              La propuesta incluye {proposal.items.length} de los{" "}
              {proposal.requested} diplomados solicitados.
            </p>
          )}
          {proposal.category && <small>Categoría: {proposal.category}</small>}
          <ul className="inventory-group-review-list inventory-group-review-editable">
            {proposal.items.map((item) => (
              <li key={item.id} data-proposed-item={item.id}>
                <strong>{item.name}</strong>
                <small>
                  {item.primaryNames.join(" · ") || "Sin categoría principal"}
                </small>
                {item.secondaryNames?.length ? <small>Secundarias: {item.secondaryNames.join(" · ")}</small> : null}
                <div className="inventory-proposal-row-actions">
                  <button type="button" aria-label={`Cambiar al azar ${item.name}`} onClick={()=>replaceProposedItem(item.id)}>Cambiar al azar</button>
                  <SheetSearchSelect label={`Cambiar por categoría ${item.name}`} value="" placeholder="Cambiar por categoría" options={additionCategoryOptions} onSelect={category=>replaceProposedItem(item.id,category)}/>
                </div>
              </li>
            ))}
          </ul>
        </InventoryGroupActionDialog>
      )}
      {additionCategory !== null && (
        <InventoryGroupCategoryAdditions
          items={availableAdditions}
          selectedIds={queuedIds}
          initialCategory={additionCategory}
          onToggle={toggleQueued}
          onClose={() => setAdditionCategory(null)}
        />
      )}
      {removal && (
        <InventoryGroupActionDialog
          title="Quitar del grupo"
          busy={busy}
          error={reviewError}
          canAccept={removal.ids.length > 0}
          acceptLabel="Quitar del grupo"
          onAccept={() => void removeFromGroup()}
          onClose={() => {
            if (!busy) {
              setRemoval(null);
              setReviewError("");
            }
          }}
        >
          <p>
            ¿Quitar {removal.ids.length} diplomados{" "}
            {removal.groupId ? "del grupo" : "del borrador"} «
            {removal.groupName}»? Los diplomados, hojas, ventas, campañas e
            historial se conservan en el inventario.
          </p>
          <ul className="inventory-group-review-list">
            {removal.ids.map((id) => (
              <li key={id}>{catalogById.get(id)?.name ?? id}</li>
            ))}
          </ul>
        </InventoryGroupActionDialog>
      )}
      {replacementIds && group && (
        <InventoryGroupReplacements
          directory={directory}
          group={group}
          itemIds={replacementIds}
          initialMode={replacementMode}
          onInspect={setObservations}
          onClose={() => setReplacementIds(null)}
          onApplied={async (result) => {
            setIds((current) => [
              ...new Set([
                ...result.members
                  .filter(
                    (member) =>
                      current.includes(member.itemId) ||
                      !group.members.some(
                        (old) => old.itemId === member.itemId,
                      ),
                  )
                  .map((member) => member.itemId),
                ...current.filter(
                  (id) => !group.members.some((member) => member.itemId === id),
                ),
              ]),
            ]);
            setDraftBase({
              revision: result.revision,
              name: result.name,
              ids: result.members.map((member) => member.itemId),
            });
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
            (!!groupAction.group ||
              (groupAction.kind === "assign" &&
                assignDraft &&
                draftAvailable)) &&
            (groupAction.kind !== "assign" || assignmentIds.length > 0) &&
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
                Agregar {assignmentIds.length} diplomados seleccionados sin
                retirar los que ya tiene el grupo.
              </p>
              <SheetSearchSelect
                label="Grupo para asignar seleccionados"
                value={
                  assignDraft ? "__draft__" : (groupAction.group?.id ?? "")
                }
                placeholder="Busca el grupo destino…"
                disabled={busy}
                options={[
                  ...(draftAvailable
                    ? [
                        {
                          value: "__draft__",
                          label: `${name.trim()} · En preparación`,
                          group: "En preparación",
                        },
                      ]
                    : []),
                  ...directory.groups.map((entry) => ({
                    value: entry.id,
                    label: entry.name,
                    group: "Guardados",
                  })),
                ]}
                onSelect={(id) => {
                  setAssignDraft(id === "__draft__");
                  setGroupAction({
                    ...groupAction,
                    kind: "assign",
                    group:
                      directory.groups.find((entry) => entry.id === id) ?? null,
                  });
                  setError("");
                }}
              />
              <small>
                {assignDraft
                  ? "En preparación: la asignación se conserva en este borrador hasta pulsar Crear grupo."
                  : "Si un diplomado ya pertenece a otro grupo, se avisará sin cambiar su asignación."}
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
                    if (id) {
                      onChooseGroup(id);
                      setManagementTab("edit");
                    }
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
      {usageBatch && (
        <InventoryGroupUsageBatch
          listId={directory.listId}
          items={usageBatch.items}
          countries={countryOptions}
          usage={usage}
          mode={usageBatch.mode}
          onClose={() => setUsageBatch(null)}
          onApplied={(updates) => {
            setUsage((previous) => ({ ...previous, ...updates }));
            onUsageBatchChange?.(updates);
            setUsageBatch(null);
            setNotice(
              "Marca de uso actualizada. La activación y las campañas se conservan.",
            );
          }}
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
                      placeholder="Añadir diplomado"
                      disabled={busy || externalBusy || !directory.canEdit}
                      options={availableAdditions
                        .filter((item) => !queuedIds.includes(item.id))
                        .map((item) => ({ value: item.id, label: item.name }))}
                      onSelect={toggleQueued}
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
                {editing && !replacing && (
                  <SheetSearchSelect
                    label="Añadir categoría"
                    className="inventory-group-category-trigger"
                    value=""
                    placeholder="Añadir categoría"
                    disabled={busy || externalBusy || !directory.canEdit}
                    options={[
                      { value: "", label: "Todas las categorías" },
                      ...additionCategoryOptions,
                    ]}
                    onSelect={setAdditionCategory}
                  />
                )}
                {
                  <>
                    <button
                      disabled={
                        busy ||
                        !Number.isInteger(count) ||
                        count < 1 ||
                        count > 100
                      }
                      onClick={() => {
                        const proposal = randomInventoryAdditions(
                          proposalPool,
                          count,
                          [...ids, ...queuedIds],
                        );
                        setReviewError("");
                        setProposal({
                          items: proposal,
                          requested: count,
                          key: draftKey,
                        });
                      }}
                    >
                      Azar
                    </button>
                    <SheetSearchSelect
                      label="Azar por categoría"
                      className="inventory-group-category-trigger"
                      value=""
                      placeholder="Azar por categoría"
                      disabled={
                        busy ||
                        externalBusy ||
                        !directory.canEdit ||
                        !Number.isInteger(count) ||
                        count < 1 ||
                        count > 100
                      }
                      options={additionCategoryOptions}
                      onSelect={(category) => {
                        const items = randomCategoryAdditions(
                          proposalPool,
                          category,
                          count,
                          [...ids, ...queuedIds],
                        );
                        setReviewError("");
                        setProposal({
                          items,
                          requested: count,
                          key: draftKey,
                          category,
                        });
                      }}
                    />
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
              {editing && addingChipIds.length > 0 && (
                <div
                  className="inventory-group-additions"
                  aria-label="Diplomados para añadir al grupo"
                >
                  <strong>Añadir: {addingChipIds.length}</strong>
                  <div className="inventory-group-addition-chips">
                    {addingChipIds.map((id) => (
                      <span className="inventory-group-selection-chip" key={id}>
                        <span title={catalogById.get(id)?.name}>
                          {catalogById.get(id)?.name ?? "No disponible"}
                        </span>
                        <button
                          type="button"
                          aria-label={`Quitar de añadir ${catalogById.get(id)?.name}`}
                          disabled={busy || externalBusy}
                          onClick={() => {
                            if (savePending.current) return;
                            setQueuedIds((current) =>
                              current.filter((value) => value !== id),
                            );
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {!!queuedIds.length && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || externalBusy || !directory.canEdit}
                      onClick={acceptQueuedAdditions}
                    >
                      Aceptar añadidos ({queuedIds.length})
                    </button>
                  )}
                </div>
              )}
              {selectedIds.length > 0 && (
                <div className="inventory-group-search-section">
                  <div
                    className="inventory-group-selected"
                    aria-label="Diplomados seleccionados para el grupo"
                  >
                    <div className="inventory-group-selection-actions">
                      <strong>Seleccionados: {selectedIds.length}</strong>
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
                      {editing && (
                        <button
                          type="button"
                          disabled={
                            busy ||
                            externalBusy ||
                            !directory.canEdit ||
                            !selectedIds.length ||
                            selectedIds.length > 1500
                          }
                          onClick={() => reviewRemoval(selectedIds)}
                        >
                          Quitar del grupo
                        </button>
                      )}
                      {editing &&
                        (
                          [
                            ["USED", "Marcar usado"],
                            ["UNUSED", "Marcar sin usar"],
                          ] as const
                        ).map(([mode, label]) => (
                          <button
                            type="button"
                            key={mode}
                            disabled={
                              busy ||
                              externalBusy ||
                              !directory.canEdit ||
                              selectedIds.length > 1500 ||
                              !countryOptions.length
                            }
                            onClick={() =>
                              setUsageBatch({
                                mode,
                                items: selectedIds.flatMap((id) => {
                                  const item = catalogById.get(id);
                                  return item ? [item] : [];
                                }),
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      {onGroupsChanged && !editing && (
                        <button
                          type="button"
                          className="primary"
                          disabled={
                            busy ||
                            externalBusy ||
                            !directory.canEdit ||
                            (!directory.groups.length && !draftAvailable) ||
                            selectedIds.length > 1500
                          }
                          onClick={() => {
                            setError("");
                            setAssignDraft(false);
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
                        {editing && !replacing && (
                          <input
                            className="inventory-group-name-search"
                            type="search"
                            aria-label="Buscar diplomado dentro del grupo"
                            placeholder="Buscar en este grupo…"
                            value={query}
                            disabled={busy || externalBusy}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.preventDefault();
                            }}
                          />
                        )}
                      </th>
                      {columnSpecs.slice(1).map((c, index) => (
                        <th
                          key={c.key}
                          data-country-code={
                            c.key.startsWith("usage:")
                              ? c.key.slice(6)
                              : undefined
                          }
                          draggable={c.key.startsWith("usage:") || undefined}
                          onDragStart={(event) => {
                            if (
                              !c.key.startsWith("usage:") ||
                              (event.target as HTMLElement).closest(
                                "button,input,select",
                              )
                            ) {
                              event.preventDefault();
                              return;
                            }
                            draggedCountry.current = c.key.slice(6);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "text/x-group-country",
                              draggedCountry.current,
                            );
                          }}
                          onDragOver={(event) => {
                            if (
                              draggedCountry.current &&
                              c.key.startsWith("usage:")
                            ) {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              event.currentTarget.dataset.countryDragover =
                                "true";
                            }
                          }}
                          onDragLeave={(event) => {
                            delete event.currentTarget.dataset.countryDragover;
                          }}
                          onDrop={(event) => {
                            if (
                              draggedCountry.current &&
                              c.key.startsWith("usage:")
                            ) {
                              event.preventDefault();
                              moveCountry(
                                draggedCountry.current,
                                c.key.slice(6),
                              );
                              clearCountryDrag();
                            }
                          }}
                          onDragEnd={clearCountryDrag}
                        >
                          {c.key.startsWith("usage:") ? (
                            <abbr
                              title={`${c.label} · Arrastra para cambiar de posición. Alt + flechas también permite moverlo.`}
                              role="button"
                              tabIndex={0}
                              aria-label={`Mover país ${c.label}`}
                              onKeyDown={(event) => {
                                if (
                                  event.altKey &&
                                  (event.key === "ArrowLeft" ||
                                    event.key === "ArrowRight")
                                ) {
                                  event.preventDefault();
                                  const code = c.key.slice(6),
                                    index = countryOptions.findIndex(
                                      (country) => country.code === code,
                                    ),
                                    target =
                                      countryOptions[
                                        index +
                                          (event.key === "ArrowRight" ? 1 : -1)
                                      ];
                                  if (target) moveCountry(code, target.code);
                                }
                              }}
                            >
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
                      const memberGroup = groupsByName.get(categoryKey(i.name));
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
                              {onGroupsChanged &&
                              (memberGroup || draftAvailable) ? (
                                <SheetSearchSelect
                                  label={
                                    memberGroup
                                      ? `Cambiar grupo de ${i.name}`
                                      : `Asignar grupo a ${i.name}`
                                  }
                                  value={
                                    memberGroup?.id ??
                                    (ids.includes(i.id) ? "__draft__" : "")
                                  }
                                  placeholder={
                                    memberGroup?.name ?? "Asignar grupo…"
                                  }
                                  disabled={
                                    busy || externalBusy || !directory.canEdit
                                  }
                                  options={[
                                    ...(draftAvailable
                                      ? [
                                          {
                                            value: "__draft__",
                                            label: `${name.trim()} · En preparación`,
                                            group: "En preparación",
                                          },
                                        ]
                                      : []),
                                    ...directory.groups.map((entry) => ({
                                      value: entry.id,
                                      label: entry.name,
                                      group: "Guardados",
                                    })),
                                  ]}
                                  onError={setError}
                                  onSelect={(targetId) => {
                                    if (targetId === "__draft__") {
                                      assignToDraft([i.id]);
                                      return;
                                    }
                                    if (targetId === memberGroup?.id) return;
                                    const target = directory.groups.find(
                                      (entry) => entry.id === targetId,
                                    );
                                    if (target) {
                                      setError("");
                                      setAssignDraft(false);
                                      setGroupAction(
                                        memberGroup
                                          ? {
                                              kind: "move",
                                              group: target,
                                              source: memberGroup,
                                              item: i,
                                            }
                                          : {
                                              kind: "assign",
                                              group: target,
                                              itemIds: [i.id],
                                            },
                                      );
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
                                status = groupUsageStatus(cell, clock),
                                campaignState =
                                  directory.campaignStates?.[
                                    JSON.stringify([
                                      categoryKey(i.name),
                                      c.code,
                                    ])
                                  ] ?? "NO_RECORD";
                              const label =
                                status === "USED" ? "✓ Usado" : "— Sin usar";
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
                                    title={`${label} · ${cell.mode === "AUTO" ? "Automático" : "Manual"}${cell.activationHours === null ? "" : ` · ${cell.activationHours.toFixed(1)} h registradas`}`}
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
                                      {status === "USED" ? "✓" : "—"}
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
                                  {editing && (
                                    <span
                                      className="inventory-group-country-campaign-state"
                                      data-campaign-state={campaignState}
                                      aria-label={`Estado de ${i.name} en ${c.name}: ${groupCountryCampaignLabels[campaignState]}`}
                                      title={`${groupCountryCampaignLabels[campaignState]} · ${i.name} · ${c.name}${campaignState === "MIXED" ? ". Hay registros con estados diferentes; consulta Detalle." : ""}`}
                                    >
                                      {
                                        groupCountryCampaignLabels[
                                          campaignState
                                        ]
                                      }
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="inventory-group-actions-cell">
                              <div className="inventory-group-actions-inline">
                                <button
                                  type="button"
                                  className="inventory-group-history"
                                  onClick={() => setObservations(i.name)}
                                >
                                  Antecedentes
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
                                              (member) =>
                                                member.itemId === i.id,
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
                                        Reemplazar
                                      </button>
                                    </div>
                                  )
                                )}
                              </div>
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
                    (editing && queuedIds.length > 0) ||
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
    </>
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
        {groupUsageStatus({ ...cell, mode: "AUTO" }) === "USED"
          ? "Usado"
          : "Sin usar"}
        {cell.activationHours !== null
          ? ` · ${cell.activationHours.toFixed(1)} horas`
          : ""}
        .
      </small>
      <div className="inventory-group-usage-options">
        {(
          [
            ["USED", "✓ Marcar usado"],
            ["UNUSED", "— Marcar sin usar"],
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
  acceptLabel = "Aceptar",
  onAccept,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  error: string;
  canAccept: boolean;
  showAccept?: boolean;
  acceptLabel?: string;
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
            {busy ? "Guardando…" : acceptLabel}
          </button>
        )}
      </footer>
    </dialog>
  );
}
