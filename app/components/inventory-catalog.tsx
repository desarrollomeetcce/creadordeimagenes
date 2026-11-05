"use client";
import dynamic from "next/dynamic";
const SelectedInventoryEvaluation=dynamic(()=>import("./sheet-sales-detail").then(m=>m.SheetSalesDetail));
const InventoryCompactEvaluation=dynamic(()=>import("./inventory-compact-evaluation").then(m=>m.InventoryCompactEvaluation));
import {useInventoryCountryViewport} from "./use-inventory-country-viewport";
import {InventoryInlineGroups} from "./inventory-inline-groups";
import {InventoryUsageControl} from "./inventory-usage-control";
import {compactCountryHidden} from "../../lib/meta-ads/inventory-inline-policy";
import {orderedGroupCountries,moveGroupCountry} from "../../lib/meta-ads/inventory-group-country-order";
import { EvaluationOrderControl, useEvaluationPeriod, evaluationRange } from "./evaluation-date-control";
import { groupUsageStatus } from "../../lib/meta-ads/inventory-group-usage-policy";
import {InventoryDiplomaUnification} from "./inventory-diploma-unification";
import { InventoryCountryCorrection } from "./inventory-country-correction";
import { inventorySheetCountryLabel } from "../../lib/meta-ads/inventory-sheet-column-policy";
import { InventoryMetaSync } from "./inventory-meta-sync";
import { compareInventoryEvaluation } from "../../lib/meta-ads/inventory-evaluation-order";
import {
  InventoryColumnVisibility,
  inventoryParameters,
} from "./inventory-column-visibility";
import {InventoryGroupSelect} from "./inventory-group-select";
import { CurrentUserId } from "./role-guide";
import { readGroupDirectory } from "./inventory-group-directory-cache";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import {
  InventoryCountryCells,
  inventoryCountryMetrics,
  useInventoryCountryEvaluation,
} from "./inventory-country-evaluation";
import {
  InventoryDeactivationConfirm,
  type InventoryActivationSelection,
} from "./inventory-deactivation-confirm";
import type { InventoryCampaignChange } from "./inventory-campaign-control";
import {inventoryTopPriority} from "../../lib/meta-ads/inventory-top-priority";
import { InventoryFactorSettings } from "./inventory-factor-settings";
import { InventorySheetHistory } from "./inventory-sheet-history";
import { EffectivenessHistory } from "./effectiveness-history";
import { limaToday } from "./date-range";
import { InventoryAddEvaluationSheet } from "./inventory-add-evaluation-sheet";
import { countryName } from "../../lib/meta-ads/countries";
import type { InventorySheetActivationDirectory } from "../../lib/meta-ads/inventory-sheet-activation";
import { InventoryActionMenu } from "./inventory-action-menu";
import {
  FinancialTableWindow,
  type FinancialTableWindowMode,
} from "./financial-table-window";
import { useInventoryPinnedColumns } from "./use-inventory-pinned-columns";
import { Fragment, memo, useContext, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { financialRequest as api } from "./financial-request";
import { InventoryCategoryAssign } from "./inventory-category-assign";
import { InventoryCategoryFilter } from "./inventory-category-filter";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { useSheetWidths } from "./use-sheet-widths";
import { useSheetHeights } from "./use-sheet-heights";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { SheetSizedRow } from "./sheet-sized-row";
import { useInventoryDuplicateReview } from "./inventory-duplicate-review";
import {
  categoryKey,
  splitCategoryNames,
} from "../../lib/meta-ads/category-paste";
import {
  InventoryNewRow,
  type InventoryNewRowValue,
} from "./inventory-new-row";
import { InventorySyllabusChips } from "./inventory-syllabus-chips";
import { InventorySyllabi } from "./inventory-syllabi";
import { InventoryPackageImport } from "./inventory-package-import";
import { InventoryImport } from "./inventory-import";
import { InventoryImportMenu } from "./inventory-import-menu";
import { InventorySelectionDelete } from "./inventory-selection-delete";
import { InventoryCategoryManager } from "./inventory-category-manager";
import type {
  InventoryCategoryState,
  InventoryCategoryAction,
} from "./inventory-category-types";
import { inventoryDetailDestinations } from "../../lib/meta-ads/inventory-detail-destinations";
import { EffectivenessCell } from "./effectiveness-cell";
type Table = {
  id: string;
  name: string;
  aliases: {
    id: string;
    name: string;
    inventorySheetId?: string;
    detached?: boolean;
  }[];
};
function InventoryActionIcon({
  name,
}: {
  name: "paste" | "import" | "categories" | "delete" | "filters";
}) {
  const paths = {
    paste:
      "M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3M9 3h6v4H9zM8 11h8M8 15h6",
    import: "M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6",
    categories: "M3 3h8l10 10-8 8L3 11V3zm5 4h.01",
    delete: "M4 7h16M9 3h6l1 4H8l1-4zm-3 4 1 14h10l1-14M10 11v6m4-6v6",
    filters: "M3 4h18l-7 8v6l-4 2v-8L3 4m14 13 4 4m0-4-4 4",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
// Selection changes only the checkbox/name cell. All other cells keep their
// mounted controls and drafts until their data or permissions actually change.
const InventoryStableCells = memo(function InventoryStableCells({children,render}:{children?:ReactNode;render?:()=>ReactNode;model:object;evaluation:string}) {
  return <>{render?render():children}</>;
}, (previous,next)=>previous.model===next.model && previous.evaluation===next.evaluation);

// Skip rebuilding unchanged row controls when a different diploma is selected.
type InventorySizedRowProps=ComponentProps<typeof SheetSizedRow>&{model:object;evaluation:string;selection:string;"data-selected"?:boolean;"data-inventory-name"?:string};
const InventorySizedRow=memo(function InventorySizedRow({model,evaluation,selection,...props}:InventorySizedRowProps){return <SheetSizedRow {...props}/>},(previous,next)=>previous.model===next.model&&previous.evaluation===next.evaluation&&previous.selection===next.selection&&previous.height===next.height&&previous.label===next.label&&previous["data-selected"]===next["data-selected"]);

function InventoryCheck({
  label,
  checked,
  mixed = false,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = mixed;
      }}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
export function InventoryCatalog({
  tables,
  listId = "default-inventory",
  sheetTabs,
  toolbarActions,
  onChanged,
  onOpenInventory,
}: {
  listId?: string;
  tables: Table[];
  initialTableId: string;
  sheetTabs: ReactNode;
  toolbarActions?: ReactNode;
  onChanged: () => Promise<void>;
  onOpenInventory?: (id: string) => void;
}) {
  const inventoryScroll = useRef<HTMLDivElement>(null);
  const inventoryWindowControls = useRef<{
    changeMode: (mode: FinancialTableWindowMode) => void;
  }>(null);
  const [inventoryWindowMode, setInventoryWindowMode] =
    useState<FinancialTableWindowMode>("inline");
  const [trialDirectory, setTrialDirectory] = useState<TrialDirectory | null>(
    null,
  );
  const [categories, setCategories] = useState<InventoryCategoryState | null>(null);
  const [selectionEvaluation,setSelectionEvaluation]=useState<{column:string;names:string[];ids:string[];since:string;until:string}|null>(null);
  const [replacementDraft,setReplacementDraft]=useState<{column:string;names:string[]}|null>(null);
  useEffect(()=>{setReplacementDraft(null);setSelectionEvaluation(null)},[listId]);
  const [groupUnification,setGroupUnification]=useState<string[]|null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [groupOrder, setGroupOrder] = useWorkbookPreference<string>(
    listId,
    "group-order",
    "",
  );
  const groupUserId = useContext(CurrentUserId);
  const groupLoad = useRef<{listId:string; promise:Promise<void>} | null>(null);
  const activeGroupList = useRef(listId); activeGroupList.current = listId;
  const [groupLoadError, setGroupLoadError] = useState("");
  async function reloadGroups(refresh = true) {
    if (groupLoad.current?.listId === listId) return groupLoad.current.promise;
    const requestedList = listId;
    setGroupLoadError("");
    const promise = readGroupDirectory(groupUserId,requestedList,()=>api("meta-ads/inventory/trials?" + new URLSearchParams({ listId:requestedList, mode: "directory" })),refresh).then((data: TrialDirectory) => { if (activeGroupList.current === requestedList) setTrialDirectory(data); }).catch(e => { if (activeGroupList.current === requestedList) setGroupLoadError(e.message); throw e; }).finally(() => { if (groupLoad.current?.promise === promise) groupLoad.current = null; });
    groupLoad.current = {listId:requestedList,promise};
    return promise;
  }
  useEffect(() => {
    let active = true;
    setTrialDirectory(null);
    setGroupFilter("");

    setGroupUnification(null);


    void reloadGroups(false)
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [listId]);
  const [compactEvaluation,setCompactEvaluation]=useState<{groupId:string;name:string}|null>(null);
  const trialGroups = trialDirectory?.groups ?? [];
  const trialItemsByName = useMemo(()=>new Map(trialDirectory?.catalog.map(i=>[categoryKey(i.name),i])??[]),[trialDirectory?.catalog]);
  const trialItemsById = useMemo(()=>new Map(trialDirectory?.catalog.map(i=>[i.id,i])??[]),[trialDirectory?.catalog]);
  const trialGroupByName = useMemo(()=>new Map(trialGroups.flatMap(g=>g.members.map(m=>[categoryKey(trialItemsById.get(m.itemId)?.name??m.name),g] as const))),[trialDirectory?.groups,trialItemsById]);
  const usageLoading = useRef<{listId:string;request:Promise<void>}|null>(null);
  const [usageError,setUsageError]=useState("");
  const reloadUsage = useCallback(()=>{
    if(usageLoading.current?.listId===listId)return usageLoading.current.request;
    setUsageError("");
    const request=api("meta-ads/inventory/trials?"+new URLSearchParams({listId,mode:"usage"})).then((data:TrialDirectory)=>setTrialDirectory(current=>current?.listId===listId?{...current,usage:data.usage,countries:data.countries,campaignStates:data.campaignStates,usageReady:true}:current)).catch(e=>setUsageError(e.message)).finally(()=>{if(usageLoading.current?.request===request)usageLoading.current=null;});
    usageLoading.current={listId,request};return request;
  },[listId]);
  useEffect(()=>{if(trialDirectory?.listId===listId&&trialDirectory.usageReady===false)void reloadUsage();},[listId,trialDirectory?.listId,trialDirectory?.usageReady,reloadUsage]);
  const categoryDrag = useRef<{
      name: string;
      categoryId: string;
      kind: "PRIMARY" | "SECONDARY";
    } | null>(null),
    [draggingCategory, setDraggingCategory] = useState<string | null>(null),
    [categoryDrop, setCategoryDrop] = useState<string | null>(null);
  const clearCategoryDrag = () => {
    categoryDrag.current = null;
    setDraggingCategory(null);
    setCategoryDrop(null);
  };
  const [syllabiOpen, setSyllabiOpen] = useState<{
    name: string;
    id?: string;
  } | null>(null);
  const [packageOpen, setPackageOpen] = useState(false);
  const importTrigger = useRef<HTMLButtonElement>(null);
  const restoreImportFocus = () =>
    requestAnimationFrame(() =>
      importTrigger.current?.focus({ preventScroll: true }),
    );
  const [syllabiBusy, setSyllabiBusy] = useState(false);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const duplicateReview = useInventoryDuplicateReview();
  const { widths, resize, warning } = useSheetWidths("inventory:" + listId),
    rowsLayout = useSheetHeights("inventory:" + listId);
  const removeSyllabus = async (name: string, id: string) => {
    setSyllabiBusy(true);
    let committed = false;
    try {
      const data = await api(
        "meta-ads/inventory/syllabi?" + new URLSearchParams({ listId, name }),
      );
      await api("meta-ads/inventory/syllabi", "PUT", {
        listId,
        name,
        revision: data.revision,
        syllabi: data.syllabi.filter((s: { id: string }) => s.id !== id),
      });
      committed = true;
      await reloadCategories();
    } catch (e) {
      setMessage(
        committed
          ? "Temario eliminado. Actualiza el inventario para ver el cambio."
          : e instanceof Error
            ? e.message
            : "No se pudo eliminar el temario.",
      );
    } finally {
      setSyllabiBusy(false);
    }
  };
  const renameSyllabus = async (name: string, id: string, title: string) => {
    setSyllabiBusy(true);
    let committed = false;
    try {
      const data = await api(
        "meta-ads/inventory/syllabi?" + new URLSearchParams({ listId, name }),
      );
      if (!data.syllabi.some((s: { id: string }) => s.id === id))
        throw Error("El temario cambió. Actualiza el inventario.");
      await api("meta-ads/inventory/syllabi", "PUT", {
        listId,
        name,
        revision: data.revision,
        syllabi: data.syllabi.map((s: { id: string }) =>
          s.id === id ? { ...s, title } : s,
        ),
      });
      committed = true;
      await reloadCategories();
    } catch (e) {
      if (committed)
        setMessage(
          "Nombre guardado. Actualiza el inventario para ver el cambio.",
        );
      else throw e;
    } finally {
      setSyllabiBusy(false);
    }
  };
  const [parameterChoice, setParameterChoice] = useWorkbookPreference<string[]>(
    listId,
    "visibleParameters",
    inventoryParameters.map((p) => p.key),
  );
  const [groupColumnIntroduced, setGroupColumnIntroduced] =
    useWorkbookPreference<string>(listId, "group-column-introduced", "");
  useEffect(() => {
    if (!groupColumnIntroduced) {
      if (parameterChoice.length && !parameterChoice.includes("group"))
        setParameterChoice((current) =>
          current.length === 1 && current[0] === "advisors"
            ? inventoryParameters.map((p) => p.key)
            : current.includes("group")
              ? current
              : [...current, "group"],
        );
      setGroupColumnIntroduced("yes");
    }
  }, [
    groupColumnIntroduced,
    parameterChoice,
    setParameterChoice,
    setGroupColumnIntroduced,
  ]);
  const [countryColumnsIntroduced, setCountryColumnsIntroduced] =
    useWorkbookPreference<string>(listId, "country-columns-introduced", "");
  const [countryChoice, setCountryChoice] = useWorkbookPreference<
    string[] | null
  >(listId, "inventory-sheet-columns", null);
  const [countryReload, setCountryReload] = useState(0);
  useEffect(() => {
    if (!countryColumnsIntroduced) {
      if (parameterChoice.length && !parameterChoice.includes("countries"))
        setParameterChoice((current) =>
          current.length === 1 && current[0] === "advisors"
            ? inventoryParameters.map((p) => p.key)
            : current.includes("countries")
              ? current
              : [...current, "countries"],
        );
      setCountryColumnsIntroduced("yes");
    }
  }, [
    countryColumnsIntroduced,
    parameterChoice,
    setParameterChoice,
    setCountryColumnsIntroduced,
  ]);
  const visibleChoices =
    parameterChoice.length === 1 && parameterChoice[0] === "advisors"
      ? inventoryParameters.map((p) => p.key)
      : parameterChoice;
  const parameters = inventoryParameters
    .filter(
      (p) => Array.isArray(visibleChoices) && visibleChoices.includes(p.key),
    )
    .map((p) => p.key);
  const showParameter = (key: string) => parameters.includes(key);
  const [sheetDirectory, setSheetDirectory] =
    useState<InventorySheetActivationDirectory | null>(null);
  const [countryCorrection, setCountryCorrection] = useState<
    { aliasId: string; country: string }[] | null
  >(null);
  const [sheetAddOpen, setSheetAddOpen] = useState(false);
  const [factorOpen, setFactorOpen] = useState(false);
  const [factorLoading, setFactorLoading] = useState(false);
  const [deactivationPrompt, setDeactivationPrompt] = useState<{
    tableId: string;
    names: string[];
    items: InventoryActivationSelection;
  } | null>(null);
  const [fullDetail, setFullDetail] = useState<{
    tableId: string;
    country: string;
    aliasId: string;
    name: string;
  } | null>(null);
  const [activationHistory, setActivationHistory] = useState<{
    tableId: string;
    name: string;
  } | null>(null);
  const reloadSheetDirectory = useCallback(async () => {
    const next: InventorySheetActivationDirectory = await api(
      "meta-ads/inventory/sheet-activation/directory?" +
        new URLSearchParams({ listId }),
    );
    setSheetDirectory(next);
  }, [listId]);
  useEffect(() => {
    let alive = true;
    setSheetDirectory(null);
    void api(
      "meta-ads/inventory/sheet-activation/directory?" +
        new URLSearchParams({ listId }),
    )
      .then((d) => {
        if (alive) setSheetDirectory(d);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [listId]);
  const [countryBlockOrder,setCountryBlockOrder] = useWorkbookPreference<string[]>(listId,"inventory-country-block-order-v1",[]);
  const countryPointer = useRef<{id:string;x:number;y:number;moving:boolean}|null>(null);
  const knownCountries = useMemo(()=>orderedGroupCountries((sheetDirectory?.columns??[]).map(column=>({code:column.id})),countryBlockOrder).map(c=>c.code),[sheetDirectory?.columns,countryBlockOrder]);
  const moveCountryBlock=(from:string,to:string)=>setCountryBlockOrder(moveGroupCountry(knownCountries,from,to));
  const sheetLabel = (id: string) => {
    const column = sheetDirectory?.columns.find((column) => column.id === id);
    const table = sheetDirectory?.tables.find(
      (table) => table.id === id.split(":")[0],
    );
    const label = table?.name ?? "Hoja";
    return column?.country
      ? inventorySheetCountryLabel(table ?? { name: label }, column.country)
      : label;
  };
  const countryCodes = showParameter("countries")
    ? knownCountries.filter(
        (c) =>
          countryChoice === null ||
          countryChoice.includes(c) ||
          countryChoice.includes(c.split(":")[0]),
      )
    : [];
  const [hiddenColumnKeys, setHiddenColumnKeys] = useWorkbookPreference<
    string[]
  >(listId, "inventory-hidden-columns", []);
  const visibleCountryMetrics = (id: string) =>
    compactCountryHidden(hiddenColumnKeys,id) ? [] : inventoryCountryMetrics;
  const hasCountryColumns = countryCodes.some(
    (id) => visibleCountryMetrics(id).length > 0,
  );
  const [evaluationPeriod, setEvaluationPeriod] = useEvaluationPeriod(listId);
  const [topPreference, setTopPreference] = useWorkbookPreference<string>(
    listId,
    "inventory-top-sheet",
    "",
  );
  const [campaignFilterSheet, setCampaignFilterSheet] =
    useWorkbookPreference<string>(
      listId,
      "inventory-campaign-filter-sheet",
      "",
    );
  const [campaignFilter, setCampaignFilter] = useWorkbookPreference<string>(
    listId,
    "inventory-campaign-filter",
    "",
  );
  const [countryFilterChoice,setCountryFilterChoice] = useWorkbookPreference<string[]>(listId,"inventory-country-filters-v2",[]);
  const countryFilters=useMemo(()=>new Map(countryFilterChoice.flatMap(value=>{try{const pair=JSON.parse(value);return Array.isArray(pair)&&pair.length===2&&pair.every(v=>typeof v==="string")?[pair as [string,string]]:[]}catch{return[]}})),[countryFilterChoice]);
  const setCountryFilter=(column:string,value:string)=>{setCampaignFilter("");setCountryFilterChoice(current=>[...current.filter(entry=>{try{return JSON.parse(entry)[0]!==column}catch{return false}}),...(value?[JSON.stringify([column,value])]:[])]);};
  const topSheet =
    countryCodes.includes(topPreference) &&
    visibleCountryMetrics(topPreference).length
      ? topPreference
      : "";
  const activeCampaignFilter =
    countryCodes.includes(campaignFilterSheet) &&
    visibleCountryMetrics(campaignFilterSheet).length
      ? campaignFilter
      : "";
  const [countrySort, setCountrySort] = useState<{
    country: string;
    metric: "activation" | "factor" | "status";
    ascending: boolean;
  } | null>(null);
  const activeCountrySort =
    countrySort &&
    countryCodes.includes(countrySort.country) &&
    visibleCountryMetrics(countrySort.country).some(
      (m) => m.key === countrySort.metric,
    )
      ? countrySort
      : null;
  const countrySortButton = (
    country: string,
    metric: (typeof inventoryCountryMetrics)[number],
  ) => {
    const chosen =
      activeCountrySort?.country === country &&
      activeCountrySort.metric === metric.key;
    return (
      <button
        type="button"
        className="inventory-country-sort"
        aria-label={`Ordenar por ${metric.label} en ${sheetLabel(country)}`}
        title={
          chosen
            ? activeCountrySort.ascending
              ? "Quitar orden"
              : "Cambiar a menor primero"
            : "Ordenar de mayor a menor"
        }
        onClick={() =>
          setCountrySort(
            chosen
              ? activeCountrySort.ascending
                ? null
                : { ...activeCountrySort, ascending: true }
              : { country, metric: metric.key, ascending: false },
          )
        }
      >
        {metric.label}{" "}
        <span aria-hidden="true">
          {chosen ? (activeCountrySort.ascending ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  };
  const viewportCountries=useInventoryCountryViewport(countryCodes,inventoryWindowMode);
  const evaluationCountries=[...new Set([...viewportCountries,...countryFilters.keys(),...(topSheet?[topSheet]:[]),...(activeCountrySort?[activeCountrySort.country]:[]),...(activeCampaignFilter?[campaignFilterSheet]:[])])].filter(id=>countryCodes.includes(id));
  const countryEvaluation=useInventoryCountryEvaluation(listId,hasCountryColumns&&trialDirectory&&categories?evaluationCountries:[],countryReload,evaluationRange(evaluationPeriod),true);
  const campaignMatches = (name:string) => {
    const matches=(column:string,filter:string)=>{
      const point=countryEvaluation.lookup.get(JSON.stringify([categoryKey(name),column]));
      if(filter.startsWith("status:"))return countryEvaluation.ready&&(point?.cac?.meta.assessment.status??"PENDING")===filter.slice(7);
      if(["NEVER","TEST","USED","UNKNOWN"].includes(filter)){
        const code=column.slice(column.lastIndexOf(":")+1),cell=trialDirectory?.usage[JSON.stringify([categoryKey(name),code])];
        return trialDirectory?.usageReady!==false&&groupUsageStatus(cell??{automatic:point?.usage??"NEVER",mode:"AUTO"})===(filter==="USED"?"USED":"NEVER");
      }
      if(filter==="HISTORY")return countryEvaluation.ready&&!!point&&point.usage!=="NEVER";
      if(filter==="ACTIVE")return point?.activation==="ACTIVE"||point?.activation==="MIXED";
      if(filter==="INACTIVE")return countryEvaluation.ready&&(!point||point.activation==="INACTIVE");
      return point?.campaignTasks.includes(filter as "CREATE"|"STOP")??false;
    };
    return countryCodes.every(column=>{const filter=countryFilters.get(column)||(column===campaignFilterSheet?activeCampaignFilter:"");return !filter||matches(column,filter)});
  };
  const columns = [
    { key: "inventory", label: "Inventario", width: 340 },
    { key: "primary", label: "Categoría principal", width: 174 },
    { key: "secondary", label: "Categorías secundarias", width: 202 },
    { key: "sheets", label: "Hojas", width: 380 },
    { key: "group", label: "Grupo", width: 230 },
    ...countryCodes.filter(country=>!compactCountryHidden(hiddenColumnKeys,country)).map(country=>({key:`country:${country}:compact`,label:sheetLabel(country),width:158})),
    { key: "gap", label: "", width: 22 },
    { key: "syllabi", label: "Temarios", width: 285 },
  ].filter(
    (c) =>
      !hiddenColumnKeys.includes(c.key) &&
      (c.key === "gap"
        ? showParameter("syllabi") && parameters.length > 1
        : c.key.startsWith("country:") || showParameter(c.key)),
  );
  const hideColumns = (keys: string[]) => {
    const regular = keys.filter((key) => !key.startsWith("country:"));
    if (regular.length)
      setParameterChoice((current) =>
        current.filter((key) => !regular.includes(key)),
      );
    const metrics = keys.filter((key) => key.startsWith("country:"));
    if (metrics.length)
      setHiddenColumnKeys((current) => [...new Set([...current, ...metrics])]);
  };
  const hideControl = (keys: string[], label: string) => (
    <button
      type="button"
      className="inventory-hide-button"
      aria-label={`Ocultar columna ${label}`}
      title={`Ocultar ${label}. Recuperar en Ver parámetros.`}
      onClick={() => hideColumns(keys)}
    >
      −
    </button>
  );

  const [pinnedColumns, setPinnedColumns] = useWorkbookPreference<string[]>(
    listId,
    "inventory-pinned-columns",
    [],
  );
  const tableRef = useInventoryPinnedColumns(pinnedColumns);
  const pinControl = (keys: string[], label: string) => {
    const fixed = keys.every((key) => pinnedColumns.includes(key));
    return (
      <button
        type="button"
        className="inventory-pin-button"
        data-pin-keys={keys.join("|")}
        aria-label={`${fixed ? "Desfijar" : "Fijar"} columna ${label}`}
        title={`${fixed ? "Desfijar" : "Fijar"} columna: ${label}`}
        aria-pressed={fixed}
        onClick={() =>
          setPinnedColumns((current) =>
            fixed
              ? current.filter((key) => !keys.includes(key))
              : [...new Set([...current, ...keys])],
          )
        }
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v7" />
        </svg>
      </button>
    );
  };
  const columnHandle = (key: string, label: string) => (
    <>
      <SheetColumnResizer
        label={label}
        onResize={(v) => resize(key, v)}
        onReset={() => resize(key)}
      />
      {pinControl([key], label)}
      {hideControl([key], label)}
    </>
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [categoryManager, setCategoryManager] = useState<
      "paste" | "catalog" | null
    >(null),
    [importView, setImportView] = useState<"paste" | "file" | null>(null),
    [primaryFilter, setPrimaryFilter] = useWorkbookPreference<string[]>(
      listId,
      "primaryFilter",
      [],
    ),
    [secondaryFilter, setSecondaryFilter] = useWorkbookPreference<string[]>(
      listId,
      "secondaryFilter",
      [],
    ),
    [itemFilter, setItemFilter] = useWorkbookPreference<string[]>(
      listId,
      "itemFilter",
      [],
    ),
    [sheetFilter, setSheetFilter] = useWorkbookPreference<string[]>(
      listId,
      "sheetFilter",
      [],
    );
  const [catalogCategory, setCatalogCategory] = useWorkbookPreference<string>(
    listId,
    "catalogCategory",
    "",
  );
  const [catalogCategories, setCatalogCategories] = useWorkbookPreference<
    string[]
  >(listId, "catalogCategories", []);
  const [grouping, setGrouping] = useWorkbookPreference<string>(
    listId,
    "catalogGrouping",
    "continuous",
  );
  const filters = {
    primary: primaryFilter,
    secondary: secondaryFilter,
    items: itemFilter,
    sheets: sheetFilter,
  };
  const setFilters = (v: typeof filters) => {
    setPrimaryFilter(v.primary);
    setSecondaryFilter(v.secondary);
    setItemFilter(v.items);
    setSheetFilter(v.sheets);
  };
  const reloadCategories = useCallback(async () => {
    const next = (await api(
      "meta-ads/inventory/categories?" + new URLSearchParams({ listId }),
    )) as InventoryCategoryState;
    setCategories(next);
    return next;
  }, [listId]);
  const onInventorySynced = useCallback(async (column?:string) => {
    countryEvaluation.refresh(column?[column]:undefined);
    await Promise.all([onChanged(), reloadCategories(), reloadSheetDirectory()]);
  }, [onChanged, reloadCategories, reloadSheetDirectory]);
  useEffect(() => {
    let active = true;
    setCategories(null);
    void api("meta-ads/inventory/categories?" + new URLSearchParams({ listId }))
      .then((v) => {
        if (active) setCategories(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [listId]);
  const saveCategory = async (action: InventoryCategoryAction) => {
    if (!categories) throw Error("Recarga las categorías antes de guardar.");
    setBusy(true);
    try {
      const decisions =
        action.action === "IMPORT"
          ? await duplicateReview.review(
              action.rows.flatMap((r) => [
                ...splitCategoryNames(r.primary).map((name) => ({
                  kind: "PRIMARY" as const,
                  name,
                })),
                ...splitCategoryNames(r.secondary, 100).map((name) => ({
                  kind: "SECONDARY" as const,
                  name,
                })),
              ]),
              categories.categories.map((c) => ({
                kind: c.kind,
                name: c.name,
              })),
            )
          : action.action === "MOVE"
            ? await duplicateReview.review(
                [
                  {
                    kind: action.toKind,
                    name:
                      categories.categories.find(
                        (c) => c.id === action.categoryId,
                      )?.name ?? "",
                  },
                ],
                categories.categories.map((c) => ({
                  kind: c.kind,
                  name: c.name,
                })),
              )
            : action.action === "ASSIGN_LEVEL"
              ? await duplicateReview.review(
                  action.names.map((name) => ({ kind: action.kind, name })),
                  categories.categories.map((c) => ({
                    kind: c.kind,
                    name: c.name,
                  })),
                )
              : [];
      const next = (await api("meta-ads/inventory/categories", "POST", {
        listId,
        revision: categories.revision,
        ...action,
        ...(["IMPORT", "MOVE", "ASSIGN_LEVEL"].includes(action.action)
          ? { decisions }
          : {}),
      })) as InventoryCategoryState;
      setCategories(next);
      if (action.action === "RENAME") {
        const source = categories.categories.find(
          (c) => c.id === action.categoryId,
        );
        const destination = next.categories.find(
          (c) => categoryKey(c.name) === categoryKey(action.name),
        );
        if (source && destination) {
          const replace = (values: string[]) => [
            ...new Set(
              values.map((value) => {
                const name =
                  categories.categories.find((c) => c.id === value)?.name ??
                  value;
                return categoryKey(name) === categoryKey(source.name)
                  ? destination.name
                  : value;
              }),
            ),
          ];
          setCatalogCategories(
            replace(
              catalogCategories.length
                ? catalogCategories
                : catalogCategory
                  ? [catalogCategory]
                  : [],
            ),
          );
          setCatalogCategory("");
          setPrimaryFilter(replace(primaryFilter));
          setSecondaryFilter(replace(secondaryFilter));
        }
        setMessage(
          "Categoría actualizada en toda la lista. Las coincidencias se unificaron sin duplicar categorías en los inventarios.",
        );
      }
    } finally {
      setBusy(false);
    }
  };
  const categoryIds = (g: { links: { id: string }[] }) => [
    ...new Set(g.links.flatMap((a) => categories?.assignments[a.id] ?? [])),
  ];
  const categoryById = useMemo(()=>new Map(categories?.categories.map((c) => [c.id, c])),[categories?.categories]);
  const syllabiByName = useMemo(()=>new Map(
    categories?.items?.map((i) => [i.name, i.syllabi ?? []]),
  ),[categories?.items]);
  const directoryNames = [
    ...new Set(categories?.categories.map((c) => c.name) ?? []),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const categoryFilterNames = (values: string[]) => [
    ...new Set(
      values.flatMap((value) => {
        const c = categoryById.get(value);
        return c ? [c.name] : directoryNames.includes(value) ? [value] : [];
      }),
    ),
  ];
  const primaryNames = categoryFilterNames(filters.primary),
    secondaryNames = categoryFilterNames(filters.secondary);
  const groupCategories = (g: { links: { id: string }[] }) =>
    categoryIds(g)
      .flatMap((id) => {
        const c = categoryById.get(id);
        return c ? [c] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const items: {
    id: string;
    name: string;
    tableId: string;
    tableName: string;
    inventorySheetId?: string;
    standalone: boolean;
  }[] = useMemo(()=>[
    ...tables.flatMap((t) =>
      t.aliases
        .filter(
          (a) =>
            (a.inventorySheetId ?? "default-inventory") === listId &&
            !a.detached,
        )
        .map((a) => ({
          ...a,
          tableId: t.id,
          tableName: t.name,
          standalone: false,
        })),
    ),
    ...(categories?.items ?? []).map((a) => ({
      ...a,
      tableId: "",
      tableName: "",
      standalone: true,
    })),
  ].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "es") ||
      a.tableName.localeCompare(b.tableName, "es"),
  ),[tables,categories?.items,listId]);
  const available = useMemo(()=>{const grouped=new Map<string,{name:string;links:typeof items}>();for(const item of items){const prior=grouped.get(item.name);if(prior)prior.links.push(item);else grouped.set(item.name,{name:item.name,links:[item]});}return [...grouped.values()];},[items]);
  const itemFilterTrack = useRef<HTMLDivElement>(null),
    previousItemFilterCount = useRef(0);
  const itemGroupById = new Map(
    available.flatMap((g) => g.links.map((a) => [a.id, g] as const)),
  );
  const itemFilterChips = [
    ...new Map<string, { key: string; name: string; ids: readonly string[] }>(
      filters.items.map((id) => {
        const group = itemGroupById.get(id);
        return group
          ? ([
              "item:" + group.name,
              {
                key: "item:" + group.name,
                name: group.name,
                ids: group.links.map((a) => a.id),
              },
            ] as const)
          : ([
              "missing:" + id,
              {
                key: "missing:" + id,
                name: "Inventario no disponible",
                ids: [id],
              },
            ] as const);
      }),
    ).values(),
  ];
  useEffect(() => {
    if (!categories) return;
    if (
      filters.items.length > previousItemFilterCount.current &&
      itemFilterTrack.current
    )
      itemFilterTrack.current.scrollLeft = itemFilterTrack.current.scrollWidth;
    previousItemFilterCount.current = filters.items.length;
  }, [filters.items, categories]);
  const noCategory = "::without-categories::";
  const activeCategories = [
    ...new Set(
      catalogCategories.length
        ? catalogCategories
        : catalogCategory
          ? [catalogCategory]
          : [],
    ),
  ].filter((name) => name === noCategory || directoryNames.includes(name));
  const {membership,categoryCounts,levelCategoryCounts}=useMemo(()=>{
    const membership=new Map<string,Set<string>>(),categoryCounts=new Map(directoryNames.map(name=>[name,0]));
    const levelCategoryCounts={PRIMARY:new Map<string,number>(),SECONDARY:new Map<string,number>()};
    for(const group of available){const assigned=groupCategories(group),names=new Set(assigned.map(c=>c.name));membership.set(group.name,names);for(const name of names)categoryCounts.set(name,(categoryCounts.get(name)??0)+1);for(const kind of ["PRIMARY","SECONDARY"] as const)for(const name of new Set(assigned.filter(c=>c.kind===kind).map(c=>c.name)))levelCategoryCounts[kind].set(name,(levelCategoryCounts[kind].get(name)??0)+1);}
    return {membership,categoryCounts,levelCategoryCounts};
  },[available,categories]);
  const categoryOptions = [
    { value: noCategory, label: "Sin categorías" },
    ...directoryNames.map((name) => ({
      value: name,
      label: `${name} (${categoryCounts.get(name) ?? 0})`,
      searchLabel: name,
    })),
  ];
  const selectCategories = (names: string[]) => {
    setFilters({ primary: [], secondary: [], items: [], sheets: [] });
    setCatalogCategory("");
    setCatalogCategories(names);
  };
  const clearFilters = () => {
    selectCategories([]);
    setGroupFilter("");
    setCampaignFilter("");
    setCountryFilterChoice([]);
    setCountrySort(null);
  };
  const matchesCategory = (g: (typeof available)[number]) =>
    !activeCategories.length ||
    activeCategories.some((name) =>
      name === noCategory
        ? !membership.get(g.name)!.size
        : membership.get(g.name)!.has(name),
    );
  const categoryInventory = available.filter(matchesCategory);
  const visible = available.filter(
    (g) =>
      matchesCategory(g) &&
      campaignMatches(g.name) &&
      (!groupFilter ||
        (groupFilter === "none"
          ? !trialGroupByName.has(categoryKey(g.name))
          : trialGroupByName.get(categoryKey(g.name))?.id === groupFilter)) &&
      (!filters.items.length ||
        g.links.some((a) => filters.items.includes(a.id))) &&
      (!filters.sheets.length ||
        g.links.some((a) => filters.sheets.includes(a.tableId))) &&
      (!primaryNames.length ||
        groupCategories(g).some(
          (c) => c.kind === "PRIMARY" && primaryNames.includes(c.name),
        )) &&
      (!secondaryNames.length ||
        groupCategories(g).some(
          (c) => c.kind === "SECONDARY" && secondaryNames.includes(c.name),
        )),
  );
  const topItems =
    topSheet && countryEvaluation.ready
      ? visible
          .filter((group) => {
            const point = countryEvaluation.lookup.get(
              JSON.stringify([categoryKey(group.name), topSheet]),
            );
            return (
              point &&
              (point.activation === "ACTIVE" ||
                point.activation === "MIXED" ||
                point.campaignTasks.length > 0)
            );
          })
          .sort((a, b) => {
            const rank = (name: string) => {
              const point = countryEvaluation.lookup.get(
                JSON.stringify([categoryKey(name), topSheet]),
              );
              return point ? inventoryTopPriority(point, "meta") : 99;
            };
            return (
              rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "es")
            );
          })
      : [];
  const topNames = new Set(topItems.map((item) => categoryKey(item.name)));
  const remainingVisible = visible.filter(
    (item) => !topNames.has(categoryKey(item.name)),
  );
  const bands = new Map<
    string,
    { title: string; groups: typeof visible; accent?: "blue" }
  >();
  for (const g of remainingVisible) {
    const primary = groupCategories(g)
        .filter((c) => c.kind === "PRIMARY")
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
      title =
        primary.map((c) => c.name).join(" · ") || "Sin categoría principal";
    const key = primary.map((c) => c.id).join("|") || "__none";
    if (!bands.has(key)) bands.set(key, { title, groups: [] });
    bands.get(key)!.groups.push(g);
  }
  const primarySections = [...bands.entries()].sort(([a, x], [b, y]) =>
    a === "__none"
      ? 1
      : b === "__none"
        ? -1
        : x.title.localeCompare(y.title, "es"),
  );
  const continuousSections: typeof primarySections = [];
  const categorized = remainingVisible.filter((g) =>
    groupCategories(g).some((c) => c.kind === "PRIMARY"),
  );
  const uncategorized = remainingVisible.filter(
    (g) => !groupCategories(g).some((c) => c.kind === "PRIMARY"),
  );
  const scopeNames = [
    ...new Set([
      ...activeCategories.filter((name) => name !== noCategory),
      ...primaryNames,
      ...secondaryNames,
    ]),
  ];
  if (categorized.length)
    continuousSections.push([
      "__continuous",
      {
        title: scopeNames.join(" · ") || "Todo el inventario",
        groups: categorized,
        accent: "blue",
      },
    ]);
  if (uncategorized.length)
    continuousSections.push([
      "__none",
      { title: "Sin categoría principal", groups: uncategorized },
    ]);
  const baseSections =
    grouping === "primary" ? primarySections : continuousSections;
  const sections: [
    string,
    (typeof primarySections)[number][1] & {
      trialTitle?: string;
      trialId?: string;
      trialCount?: number;
      hideBand?: boolean;
      top?: boolean;
    },
  ][] = [];
  if (topItems.length)
    sections.push([
      "__top",
      {
        title: "Top · " + sheetLabel(topSheet),
        groups: topItems,
        accent: "blue",
        top: true,
      },
    ]);
  if (groupOrder === "groups") {
    const buckets=new Map<string|null,typeof remainingVisible>();
    for(const item of remainingVisible){const key=trialGroupByName.get(categoryKey(item.name))?.id??null;const bucket=buckets.get(key);if(bucket)bucket.push(item);else buckets.set(key,[item]);}
    for (const trial of [...trialGroups, null]) {
      const members = buckets.get(trial?.id??null)??[];
      const memberNames=new Set(members.map(m=>m.name));
      if (!members.length) continue;
      const entries =
        grouping === "primary"
          ? baseSections
              .map(
                ([key, section]) =>
                  [
                    key,
                    {
                      ...section,
                      groups: section.groups.filter((g) => memberNames.has(g.name)),
                    },
                  ] as const,
              )
              .filter(([, section]) => section.groups.length)
          : ([["continuous", { title: "", groups: members }]] as const);
      entries.forEach(([key, section], index) =>
        sections.push([
          (trial?.id ?? "none") + ":" + key,
          {
            ...section,
            hideBand: grouping !== "primary",
            ...(index === 0
              ? {
                  trialTitle: trial?.name ?? "Sin grupo",
                  trialId: trial?.id,
                  trialCount: members.length,
                }
              : {}),
          },
        ]),
      );
    }
  } else sections.push(...baseSections);
  if (activeCountrySort) {
    const { country, metric, ascending } = activeCountrySort;
    const compare = (a: (typeof visible)[number], b: (typeof visible)[number]) =>
        compareInventoryEvaluation(
          countryEvaluation.lookup.get(
            JSON.stringify([categoryKey(a.name), country]),
          ),
          countryEvaluation.lookup.get(
            JSON.stringify([categoryKey(b.name), country]),
          ),
          metric,
          ascending,
        ) || a.name.localeCompare(b.name, "es");
    if (topSheet) {
      for (const [, section] of sections) if (section.top) section.groups = [...section.groups].sort(compare);
    } else {
    const ordered = [...visible].sort(compare);
    sections.splice(0, sections.length, [
      "country-sort",
      {
        title:
          sheetLabel(country) +
          " · " +
          (inventoryCountryMetrics.find((m) => m.key === metric)?.label ??
            "Orden") +
          (ascending ? " ↑" : " ↓"),
        groups: ordered,
        accent: "blue",
      },
    ]);
    }
  }
  const bandCategorySelector = (section: {
    title: string;
    groups: typeof visible;
  }) => {
    const current = groupCategories(section.groups[0])
      .filter((c) => c.kind === "PRIMARY")
      .map((c) => c.name)
      .filter((name) =>
        section.groups.every((g) =>
          groupCategories(g).some(
            (c) => c.kind === "PRIMARY" && c.name === name,
          ),
        ),
      );
    const ids = [
      ...new Set(section.groups.flatMap((g) => g.links.map((a) => a.id))),
    ];
    const add = async (names: string[]) => {
      if (!names.length) return;
      await saveCategory({
        action: "IMPORT",
        rows: [{ primary: names.join(", "), secondary: "" }],
        targetIds: ids,
      });
      setMessage(
        `Categorías principales añadidas a ${section.groups.length} ${section.groups.length === 1 ? "ítem" : "ítems"} de esta franja.`,
      );
    };
    return (
      <InventoryMultiSelect
        label={`Añadir categorías principales a la franja ${section.title}`}
        placeholder={current.length ? "+" : "+ Principal"}
        compact
        all={false}
        values={[]}
        options={directoryNames
          .filter((name) => !current.includes(name))
          .map((name) => ({ value: name, label: name }))}
        disabled={busy || !categories}
        description={`Se añadirán a ${section.groups.length} ${section.groups.length === 1 ? "ítem visible" : "ítems visibles"} de esta franja. Las demás categorías se conservan; si una ya figura como secundaria, se moverá a principal.`}
        onChange={add}
        onCreate={async (name, selectedNames) => add([...selectedNames, name])}
        onError={setMessage}
      />
    );
  };
  const saveNewRow = async (
    value: InventoryNewRowValue,
    behavior: { closeDraft?: boolean; selectItem?: boolean } = {},
  ) => {
    if (!categories) throw Error("Recarga las categorías antes de guardar.");
    setBusy(true);
    let committed = false;
    try {
      const decisions = await duplicateReview.review(
        [
          ...value.primary.map((name) => ({ kind: "PRIMARY" as const, name })),
          ...value.secondary.map((name) => ({
            kind: "SECONDARY" as const,
            name,
          })),
          ...(value.name.trim()
            ? [{ kind: "INVENTORY" as const, name: value.name.trim() }]
            : []),
        ],
        [
          ...categories.categories.map((c) => ({ kind: c.kind, name: c.name })),
          ...available.map((g) => ({
            kind: "INVENTORY" as const,
            name: g.name,
          })),
        ],
      );
      await api("meta-ads/inventory/import", "POST", {
        listId,
        revision: categories.revision,
        decisions,
        rows: [
          {
            name: value.name.trim(),
            primary: value.primary.join(", "),
            secondary: value.secondary.join(", "),
            sheets: value.sheets
              .map((id) => {
                const table = tables.find((t) => t.id === id);
                if (!table)
                  throw Error(
                    "Una hoja ya no está disponible. Revisa la selección.",
                  );
                return table.name;
              })
              .join(", "),
          },
        ],
      });
      committed = true;
      await onChanged();
      const next = await reloadCategories();
      const savedName =
        decisions.find(
          (d) => d.kind === "INVENTORY" && d.name === value.name.trim(),
        )?.useName ?? value.name.trim();
      const savedItem = next.items?.find((i) => i.name === savedName);
      setFilters({
        primary: [],
        secondary: [],
        items: behavior.selectItem && savedItem ? [savedItem.id] : [],
        sheets: [],
      });
      if (behavior.selectItem) {
        setCatalogCategory("");
        setCatalogCategories([]);
      }
      if (behavior.closeDraft !== false) setNewRowOpen(false);
      setMessage(
        behavior.selectItem
          ? `Inventario «${savedName}» disponible en la tabla.`
          : value.name.trim()
            ? "Fila de inventario guardada."
            : "Categorías guardadas. Están disponibles en Ver categorías.",
      );
    } catch (e) {
      if (!committed) throw e;
      if (behavior.closeDraft !== false) setNewRowOpen(false);
      setMessage("La fila se guardó. Recarga para ver la lista actualizada.");
    } finally {
      setBusy(false);
    }
  };
  const createHeaderCategory = async (
    kind: "PRIMARY" | "SECONDARY",
    text: string,
  ) => {
    if (!categories) throw Error("Recarga las categorías antes de guardar.");
    const names = splitCategoryNames(text, kind === "SECONDARY" ? 100 : 20);
    setBusy(true);
    try {
      const decisions = await duplicateReview.review(
        names.map((name) => ({ kind, name })),
        directoryNames.map((name) => ({ kind, name })),
      );
      const chosen = [
        ...new Set(
          names.map(
            (name) =>
              decisions.find((d) => d.kind === kind && d.name === name)
                ?.useName ?? name,
          ),
        ),
      ];
      setCategories(
        await api("meta-ads/inventory/categories", "POST", {
          listId,
          revision: categories.revision,
          action: "IMPORT",
          decisions,
          rows: [
            {
              primary: kind === "PRIMARY" ? chosen.join(", ") : "",
              secondary: kind === "SECONDARY" ? chosen.join(", ") : "",
            },
          ],
        }),
      );
      setMessage(
        `Categoría${chosen.length === 1 ? "" : "s"} «${chosen.join(" · ")}» disponible${chosen.length === 1 ? "" : "s"} en el catálogo. Puedes asignarla${chosen.length === 1 ? "" : "s"} a los ítems.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const categoryCell = (
    g: (typeof visible)[number],
    kind: "PRIMARY" | "SECONDARY",
  ) => {
    const assigned = groupCategories(g).filter((c) => c.kind === kind);
    return (
      <td
        hidden={!showParameter(kind === "PRIMARY" ? "primary" : "secondary")}
        className="inventory-category-cell"
        data-fill-kind="manual"
        data-category-kind={kind}
        data-drop-active={categoryDrop === g.name + "|" + kind || undefined}
        onDragOver={(e) => {
          const from = categoryDrag.current;
          if (!busy && from?.name === g.name && from.kind !== kind) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setCategoryDrop(g.name + "|" + kind);
          }
        }}
        onDragLeave={(e) => {
          if (
            !(e.relatedTarget instanceof Node) ||
            !e.currentTarget.contains(e.relatedTarget)
          )
            setCategoryDrop(null);
        }}
        onDrop={(e) => {
          const from = categoryDrag.current;
          if (!from || from.name !== g.name || from.kind === kind || busy)
            return;
          e.preventDefault();
          e.stopPropagation();
          clearCategoryDrag();
          void saveCategory({
            action: "MOVE",
            ids: g.links.map((a) => a.id),
            expectedName: g.name,
            categoryId: from.categoryId,
            toKind: kind,
          })
            .then(() =>
              setMessage(
                "Categoría movida a " +
                  (kind === "PRIMARY" ? "Principal" : "Secundaria") +
                  ".",
              ),
            )
            .catch((e) => setMessage(e.message));
        }}
      >
        <div className="inventory-category-chips">
          {assigned.map((c) => (
            <span
              key={c.id}
              className={
                "inventory-category-chip inventory-category-draggable " +
                kind.toLowerCase()
              }
              draggable={!busy}
              role="group"
              tabIndex={0}
              aria-label={`${c.name}. Mover a ${kind === "PRIMARY" ? "Secundaria" : "Principal"} con Alt y flecha ${kind === "PRIMARY" ? "derecha" : "izquierda"}`}
              title={`Arrastra a ${kind === "PRIMARY" ? "Secundaria" : "Principal"} · Alt+${kind === "PRIMARY" ? "→" : "←"}`}
              data-dragging={
                draggingCategory === g.name + "|" + c.id || undefined
              }
              onDragStart={(e) => {
                if (busy) {
                  e.preventDefault();
                  return;
                }
                e.stopPropagation();
                categoryDrag.current = { name: g.name, categoryId: c.id, kind };
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(
                  "application/x-inventory-category",
                  JSON.stringify({ categoryId: c.id, listId, name: g.name }),
                );
                setDraggingCategory(g.name + "|" + c.id);
              }}
              onDragEnd={clearCategoryDrag}
              onKeyDown={(e) => {
                if (
                  e.target !== e.currentTarget ||
                  busy ||
                  !e.altKey ||
                  e.key !== (kind === "PRIMARY" ? "ArrowRight" : "ArrowLeft")
                )
                  return;
                e.preventDefault();
                e.stopPropagation();
                void saveCategory({
                  action: "MOVE",
                  ids: g.links.map((a) => a.id),
                  expectedName: g.name,
                  categoryId: c.id,
                  toKind: kind === "PRIMARY" ? "SECONDARY" : "PRIMARY",
                }).catch((e) => setMessage(e.message));
              }}
            >
              <span className="inventory-category-chip-label" title={c.name}>
                {c.name}
              </span>
              {
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Quitar categoría ${c.name} de ${g.name}`}
                  onClick={() =>
                    void saveCategory({
                      action: "ASSIGN",
                      ids: g.links.map((a) => a.id),
                      expectedName: g.name,
                      categoryIds: categoryIds(g).filter((id) => id !== c.id),
                    }).catch((e) => setMessage(e.message))
                  }
                >
                  ×
                </button>
              }
            </span>
          ))}
          <InventoryMultiSelect
            label={`Categorías ${kind === "PRIMARY" ? "principales" : "secundarias"} de ${g.name}`}
            values={assigned.map((c) => c.name)}
            description={`Si una categoría ya figura como ${kind === "PRIMARY" ? "secundaria" : "principal"}, se moverá al nivel elegido y quedará una sola vez.`}
            placeholder={
              assigned.length
                ? "+"
                : kind === "PRIMARY"
                  ? "+ Principal"
                  : "+ Secundaria"
            }
            compact
            onCreate={async (name, selectedNames) => {
              await saveCategory({
                action: "IMPORT",
                rows: [
                  {
                    primary:
                      kind === "PRIMARY"
                        ? [...selectedNames, name].join(", ")
                        : "",
                    secondary:
                      kind === "SECONDARY"
                        ? [...selectedNames, name].join(", ")
                        : "",
                  },
                ],
                targetIds: g.links.map((a) => a.id),
              });
            }}
            options={directoryNames.map((name) => ({
              value: name,
              label: name,
            }))}
            disabled={busy || !categories}
            all={false}
            onChange={async (names) => {
              await saveCategory({
                action: "ASSIGN_LEVEL",
                ids: g.links.map((a) => a.id),
                expectedName: g.name,
                kind,
                names,
              });
            }}
            onError={setMessage}
          />
        </div>
      </td>
    );
  };
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet=useMemo(()=>new Set(selected),[selected]);
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);
  const [sheetRemoval, setSheetRemoval] = useState<string[] | null>(null);
  const sheetAssignment = useRef<{
    revision: number;
    items: { inventoryId: string; expectedName: string }[];
  } | null>(null);
  const visibleIds = visible.flatMap((g) => g.links.map((a) => a.id)),
    selectedVisible = visibleIds.filter((id) => selected.includes(id)),
    selectedGroups = visible.filter((g) =>
      g.links.some((a) => selectedSet.has(a.id)),
    ).length;
  const [assignment, setAssignment] = useState<{
    kind: "PRIMARY" | "SECONDARY";
    ids: string[];
    names: string[];
  } | null>(null);
  const [inventoryRowLimit,setInventoryRowLimit]=useState(100);
  const inventoryWindowKey=JSON.stringify([listId,filters,groupFilter,groupOrder,grouping,topSheet,activeCountrySort,countryFilterChoice,catalogCategories]);
  useEffect(()=>setInventoryRowLimit(100),[inventoryWindowKey]);
  const orderedInventoryNames=sections.flatMap(([,section])=>section.groups.map(group=>group.name));
  const mountedInventoryNames=new Set(orderedInventoryNames.slice(0,inventoryRowLimit));
  const selectedForActions = useRef(selected);
  selectedForActions.current = selected;
  const cellModel = useMemo(()=>({}),[
    listId,tables,categories,trialDirectory?.catalog,trialDirectory?.groups,trialDirectory?.canEdit,
    sheetDirectory,busy,syllabiBusy,categoryDrop,draggingCategory,onChanged,onInventorySynced,replacementDraft,trialDirectory?.usage,trialDirectory?.usageReady,
    parameters.join("|"),countryCodes.join("|"),viewportCountries.join("|"),hiddenColumnKeys.join("|"),
    columns.some(c=>c.key==="gap"),
  ]);
  const rowEvaluationVersions=useMemo(()=>new Map(available.filter(g=>mountedInventoryNames.has(g.name)).map(g=>[g.name,JSON.stringify([
    countryEvaluation.ready,countryEvaluation.error,countryEvaluation.loading && !countryEvaluation.ready,
    viewportCountries.map(country=>countryEvaluation.lookup.get(JSON.stringify([categoryKey(g.name),country]))),
  ])])),[available,countryEvaluation,viewportCountries.join("|"),JSON.stringify([...mountedInventoryNames])]);
  const choose = (ids: string[], checked: boolean) =>
    setSelected((old) =>
      checked
        ? [...new Set([...old, ...ids])]
        : old.filter((id) => !ids.includes(id)),
    );
  const [review, setReview] = useState<{
      id: string;
      name: string;
      table: { id: string; name: string };
      rows: number;
      days: number;
      assignments: number;
      token: string;
    } | null>(null),
    [deleteError, setDeleteError] = useState("");
  const selectedGroupNames = new Set(
    visible
      .filter((g) => g.links.some((a) => selectedVisible.includes(a.id)))
      .map((g) => categoryKey(g.name)),
  );
  const removalGroups = trialGroups
    .map((group) => ({
      groupId: group.id,
      revision: group.revision,
      itemIds: group.members
        .filter((m) =>
          selectedGroupNames.has(
            categoryKey(trialItemsById.get(m.itemId)?.name ?? m.name),
          ),
        )
        .map((m) => m.itemId),
    }))
    .filter((g) => g.itemIds.length);
  const removalCount = removalGroups.reduce((n, g) => n + g.itemIds.length, 0);
  const selectedAssignedGroups = new Set(
    visible
      .filter((g) => g.links.some((a) => selectedVisible.includes(a.id)))
      .map((g) => trialGroupByName.get(categoryKey(g.name))?.id ?? ""),
  );
  const commonSelectedGroup =
    selectedAssignedGroups.size === 1 ? [...selectedAssignedGroups][0] : "";
  async function changeSheetActivation(
    tableId: string,
    names: string[],
    change: InventoryCampaignChange,
    confirmedItems?: InventoryActivationSelection,
  ) {
    if (busy || !names.length || !countryEvaluation.ready) return;
    const items =
      confirmedItems ??
      names.map((name) => ({
        name,
        targets:
          countryEvaluation.lookup.get(
            JSON.stringify([categoryKey(name), tableId]),
          )?.targets ?? [],
      }));
    if (
      !confirmedItems &&
      change.active === false &&
      change.pinned === undefined &&
      names.some((name) => {
        const row = countryEvaluation.lookup.get(
          JSON.stringify([categoryKey(name), tableId]),
        );
        return row && row.activation !== "INACTIVE";
      })
    ) {
      setDeactivationPrompt({ tableId, names: [...names], items });
      return;
    }
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      await api("meta-ads/inventory/sheet-activation", "PATCH", {
        listId,
        tableId: tableId.split(":")[0],
        ...(tableId.includes(":") ? { country: tableId.split(":")[1] } : {}),
        items,
        ...change,
      });
      committed = true;
      setCountryReload((v) => v + 1);
      await Promise.all([onChanged(), reloadCategories(), reloadSheetDirectory()]);
    } catch (e) {
      setMessage(
        (committed ? "Cambio guardado. Actualiza la vista. " : "") +
          (e as Error).message,
      );
      setCountryReload((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  async function changeAssignedGroup(source:TrialDirectory["groups"][number],targetId:string,name:string){
    if(busy||!trialDirectory?.canEdit||source.id===targetId)return;
    const target=trialDirectory.groups.find(group=>group.id===targetId),member=source.members.find(item=>categoryKey(item.name)===categoryKey(name));
    if(!target||!member)return;
    setBusy(true);setMessage("");
    let written=false;
    try{await api("meta-ads/inventory/trials","POST",{action:"MOVE_MEMBER",listId,groupId:source.id,revision:source.revision,itemId:member.itemId,targetGroupId:target.id,targetRevision:target.revision,since:limaToday()});written=true;await reloadGroups();}
    catch(e){setMessage((written?"Traslado guardado; falta actualizar la vista. ":"")+(e as Error).message);}
    finally{setBusy(false);}
  }
  async function assignGroupDirectly(id: string, names: string[]) {
    if (id === "new") {
      setGroupFilter("");
      document.querySelector("[aria-label=\"Grupos integrados\"]")?.scrollIntoView({block:"nearest"});
      return;
    }
    if (busy || !trialDirectory?.canEdit || !names.length) return;
    const group = trialGroups.find((g) => g.id === id);
    if (!group) {
      setMessage("El grupo cambió. Actualiza.");
      return;
    }
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      const itemIds = [
        ...new Set(
          names.map(
            (name) =>
              trialDirectory.catalog.find(
                (i) => categoryKey(i.name) === categoryKey(name),
              )?.id,
          ),
        ),
      ];
      if (itemIds.some((id) => !id))
        throw Error("Un diplomado cambió. Actualiza el inventario.");
      await api("meta-ads/inventory/trials", "POST", {
        action: "ADD_MEMBERS",
        listId,
        groupId: id,
        revision: group.revision,
        itemIds,
        since: new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Lima",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      });
      committed = true;
      setSelected([]);
      await reloadGroups();
      await Promise.all([onChanged(), reloadCategories()]);
      setMessage(
        `${names.length} diplomado${names.length === 1 ? "" : "s"} asignado${names.length === 1 ? "" : "s"} a ${group.name}.`,
      );
    } catch (e) {
      setMessage(
        committed
          ? "Grupo asignado. Actualiza para ver el cambio."
          : e instanceof Error
            ? e.message
            : "No se pudo asignar el grupo.",
      );
      if (!committed) {
        await reloadGroups().catch(() => {});
        throw e;
      }
    } finally {
      setBusy(false);
    }
  }
  async function removeGroupMembers(groups: typeof removalGroups) {
    if (!groups.length || busy) return;
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      const result = await api("meta-ads/inventory/trials", "POST", {
        action: "REMOVE_MEMBERS",
        listId,
        groups,
      });
      committed = true;
      await reloadGroups();
      setMessage(
        `Grupo retirado de ${result.removed} diplomado${result.removed === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setMessage(
        committed
          ? "Las asignaciones se quitaron. Actualiza para ver el cambio."
          : e instanceof Error
            ? e.message
            : "No se pudo quitar el grupo.",
      );
      if (!committed) await reloadGroups().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
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
  const fullDetailPoint = fullDetail ? countryEvaluation.lookup.get(JSON.stringify([categoryKey(fullDetail.name), fullDetail.tableId + ":" + fullDetail.country])) : undefined;
  const fullDetailContent = fullDetail && (
    <EffectivenessHistory
      key={fullDetail.aliasId + ":" + fullDetail.country}
      {...fullDetail}
      destinations={inventoryDetailDestinations(fullDetail.name,items,sheetDirectory?.columns ?? [])}
      autoOpen
      initialSince={fullDetailPoint?.cac?.since ?? evaluationRange(evaluationPeriod).since ?? limaToday()}
      initialUntil={fullDetailPoint?.cac?.until ?? evaluationRange(evaluationPeriod).until ?? limaToday()}
      onPeriod={() => {}}
      onClose={() => setFullDetail(null)}
    />
  );
  return (
    <section
      className="inventory-catalog sheet-view"
      aria-label="Inventario sin países"
    >
      {fullDetailContent}
      {activationHistory && (
        <InventorySheetHistory
          listId={listId}
          tableId={activationHistory.tableId}
          name={activationHistory.name}
          sheetName={sheetLabel(activationHistory.tableId)}
          onClose={() => setActivationHistory(null)}
        />
      )}
      {deactivationPrompt && (
        <InventoryDeactivationConfirm
          names={deactivationPrompt.names}
          sheetName={sheetLabel(deactivationPrompt.tableId)}
          onClose={() => setDeactivationPrompt(null)}
          onConfirm={async (pin) => {
            await changeSheetActivation(
              deactivationPrompt.tableId,
              deactivationPrompt.names,
              { active: false, pinned: pin },
              deactivationPrompt.items,
            );
          }}
        />
      )}
      {factorOpen && sheetDirectory && (
        <InventoryFactorSettings
          listId={listId}
          directory={sheetDirectory}
          onClose={() => setFactorOpen(false)}
          onSaved={async () => {
            await reloadSheetDirectory();
            setCountryReload((value) => value + 1);
          }}
        />
      )}
      {sheetAddOpen && sheetDirectory && (
        <InventoryAddEvaluationSheet
          listId={listId}
          directory={sheetDirectory}
          onClose={() => setSheetAddOpen(false)}
          onSaved={async (id) => {
            await reloadSheetDirectory();
            setCountryChoice([...new Set([...countryCodes, id])]);
            setCountryReload((v) => v + 1);
            await onChanged();
          }}
        />
      )}
      {assignment && (
        <InventoryCategoryAssign
          kind={assignment.kind}
          inventoryNames={assignment.names}
          categoryNames={directoryNames}
          onClose={() => setAssignment(null)}
          onRemoveAll={async () => {
            await saveCategory({
              action: "CLEAR_BULK",
              ids: assignment.ids,
              kind: assignment.kind,
            });
            setSelected([]);
            setMessage("Categorías retiradas de los seleccionados.");
          }}
          onApply={async (names, remove) => {
            await saveCategory({
              action: remove ? "REMOVE_BULK" : "ASSIGN_BULK",
              ids: assignment.ids,
              kind: assignment.kind,
              names,
            });
            setSelected([]);
            setMessage(
              `Categorías ${assignment.kind === "PRIMARY" ? "principales" : "secundarias"} ${remove ? "retiradas de" : "asignadas a"} ${assignment.names.length} inventarios.`,
            );
          }}
        />
      )}
      {packageOpen && (
        <InventoryPackageImport
          onClose={() => {
            setPackageOpen(false);
            restoreImportFocus();
          }}
          onSaved={async (id) => {
            await Promise.all([onChanged(), reloadCategories()]);
            setMessage("Catálogo cargado.");
            onOpenInventory?.(id);
          }}
        />
      )}
      {syllabiOpen && (
        <InventorySyllabi
          listId={listId}
          name={syllabiOpen.name}
          initialId={syllabiOpen.id}
          onClose={() => setSyllabiOpen(null)}
          onChanged={async () => {
            await reloadCategories();
          }}
        />
      )}
      {message && (
        <p role="status" className="sheet-message">
          {message}
        </p>
      )}
      {(warning || rowsLayout.warning) && (
        <p className="sheet-message" role="status">
          {warning || rowsLayout.warning}
        </p>
      )}
      {countryCorrection && (
        <InventoryCountryCorrection
          listId={listId}
          items={countryCorrection}
          onClose={() => setCountryCorrection(null)}
          onSaved={async () => {
            await Promise.all([onChanged(), reloadCategories(), reloadSheetDirectory()]);
          }}
        />
      )}
      <div
        className="row inventory-actions-toolbar sheet-toolbar-with-actions"
        aria-label="Acciones del inventario"
      >
        <div className="row sheet-toolbar-controls">
          {!!sheetDirectory?.countryIssues?.length && sheetDirectory.canCorrectCountry && <button type="button" disabled={busy} onClick={() => setCountryCorrection(sheetDirectory.countryIssues!.map(i => ({aliasId:i.aliasId,country:i.country})))}>Revisar asociaciones</button>}
          <button
            type="button"
            className="inventory-maximize-trigger"
            aria-label="Maximizar inventario"
            title="Ampliar toda la tabla de Lista de Diplomados"
            onClick={() =>
              inventoryWindowControls.current?.changeMode("maximized")
            }
          >
            ⛶ Maximizar inventario
          </button>
          <div
            className="inventory-toolbar-main"
            role="group"
            aria-label="Añadir y organizar inventario"
          >
            <button
              type="button"
              className="inventory-action-primary"
              disabled={busy || !categories}
              onClick={() => setImportView("paste")}
            >
              <InventoryActionIcon name="paste" />
              Pegar inventario
            </button>
            <InventoryImportMenu
              triggerRef={importTrigger}
              icon={<InventoryActionIcon name="import" />}
              disabled={busy || !categories}
              onFile={() => setImportView("file")}
              onCatalog={() => setPackageOpen(true)}
            />
            <button
              type="button"
              disabled={busy || !categories}
              onClick={() => setCategoryManager("catalog")}
            >
              <InventoryActionIcon name="categories" />
              Ver categorías
            </button>
          </div>
          <div
            className="inventory-toolbar-delete"
            role="group"
            aria-label="Eliminar inventario seleccionado"
          >
            <button
              type="button"
              className="danger"
              disabled={busy || !selectedVisible.length}
              onClick={() => setBulkIds([...selectedVisible])}
              title="Eliminar los ítems marcados después de revisar sus hojas"
            >
              <InventoryActionIcon name="delete" />
              Eliminar
            </button>
            <span
              className="inventory-selected-count"
              data-selected={selectedGroups > 0 || undefined}
              role="status"
            >
              {selectedGroups}{" "}
              {selectedGroups === 1 ? "seleccionado" : "seleccionados"}
            </span>
          </div>
          <button
            type="button"
            className="inventory-clear-filters"
            onClick={clearFilters}
          >
            <InventoryActionIcon name="filters" />
            Limpiar filtros
          </button>
          <button
            type="button"
            disabled={!selected.length || busy}
            onClick={() => setSelected([])}
          >
            Quitar selección
          </button>
          <InventoryColumnVisibility
            values={parameters}
            onChange={setParameterChoice}
            hiddenColumns={countryCodes.filter(id=>compactCountryHidden(hiddenColumnKeys,id)).map(id=>({key:`country:${id}:compact`,label:sheetLabel(id)}))}
            sheetColumns={knownCountries.map((id) => ({
              id,
              label: sheetLabel(id),
              checked:
                countryCodes.includes(id) &&
                visibleCountryMetrics(id).length > 0,
              partial:false,
            }))}
            onToggleSheet={(id, checked) => {
              if (checked) {
                setParameterChoice((current) =>
                  current.includes("countries")
                    ? current
                    : [...current, "countries"],
                );
                setCountryChoice([...new Set([...countryCodes, id])]);
                setHiddenColumnKeys((current) =>
                  current.filter((key) => !key.startsWith(`country:${id}:`)),
                );
              } else
                setCountryChoice(countryCodes.filter((value) => value !== id));
            }}
            onRestoreColumn={(key) =>
              setHiddenColumnKeys((current) =>
                current.filter((value) => value !== key),
              )
            }
            onRestoreAll={() => {
              setParameterChoice(inventoryParameters.map((p) => p.key));
              setHiddenColumnKeys([]);
              setCountryChoice(null);
            }}
          />
        </div>
        {toolbarActions}
      </div>
      {sheetTabs}
      <div
        className="inventory-catalog-overview"
        aria-label="Resumen del inventario"
      >
        <div className="inventory-catalog-counter" data-counter="inventory">
          <span className="inventory-counter-icon" aria-hidden="true">
            ▦
          </span>
          <span>Inventario total</span>
          <strong data-inventory-total>
            {categories ? available.length : "—"}
          </strong>
        </div>
        <div className="inventory-catalog-counter" data-counter="categories">
          <span className="inventory-counter-icon" aria-hidden="true">
            <InventoryActionIcon name="categories" />
          </span>
          <span>Categorías</span>
          <strong data-category-total>
            {categories ? directoryNames.length : "—"}
          </strong>
        </div>
        <div className="inventory-catalog-category-picker">
          <span>Seleccionar categoría</span>
          <InventoryCategoryFilter
            label="Seleccionar categoría"
            values={activeCategories}
            options={categoryOptions}
            onChange={selectCategories}
            onCreate={async (name) => createHeaderCategory("PRIMARY", name)}
            onError={setMessage}
            disabled={busy || !categories}
          />
          <small>
            {hasCountryColumns
              ? `CAC y estado: gasto de Meta ÷ ventas registradas · ${evaluationRange(evaluationPeriod).since ?? "Desde la activación"} — ${evaluationRange(evaluationPeriod).until ?? limaToday()}. * Datos parciales.`
              : "Incluye categorías principales y secundarias."}
          </small>
          <div
            className="inventory-grouping-controls"
            role="group"
            aria-label="Vista del inventario"
          >
            <button
              type="button"
              aria-pressed={grouping !== "primary"}
              onClick={() => setGrouping("continuous")}
            >
              Lista continua
            </button>
            <button
              type="button"
              aria-pressed={grouping === "primary"}
              onClick={() => setGrouping("primary")}
            >
              Por categoría principal
            </button>
          </div>
        </div>
        {trialDirectory&&<InventoryInlineGroups directory={trialDirectory} groupId={groupFilter} selectedNames={available.filter(g=>g.links.some(a=>selectedSet.has(a.id))).map(g=>g.name)} countries={[...new Map(knownCountries.map(id=>{const code=id.slice(id.lastIndexOf(":")+1);return [code,{code,name:countryName(code)}] as const})).values()]} onGroupSelect={id=>{setGroupFilter(id);setTopPreference("");}} onSelectNames={names=>{const chosen=new Set(names.map(categoryKey));setSelected(available.filter(g=>chosen.has(categoryKey(g.name))).flatMap(g=>g.links.map(a=>a.id)));}} onPatched={async group=>{const byName=new Map(trialDirectory.catalog.map(i=>[categoryKey(i.name),i]));const needsReload=group.members.some(m=>byName.get(categoryKey(m.name))?.id!==m.itemId);setTrialDirectory(current=>current?{...current,groups:current.groups.some(g=>g.id===group.id)?current.groups.map(g=>g.id===group.id?group:g):[...current.groups,group]}:current);setGroupFilter(group.id);setSelected([]);if(needsReload)await reloadGroups();}} categoryFilter={activeCategories.length===1?activeCategories[0]:""} onCategoryFilter={name=>{selectCategories(name?[name]:[]);setGroupFilter("");setTopPreference("");}} replacement={replacementDraft} replacementColumns={countryCodes.map(id=>({id,label:countryCodes.filter(v=>v.split(":")[1]===id.split(":")[1]).length>1?sheetLabel(id):countryName(id.split(":")[1])}))} defaultColumn={topSheet||""} onReplacementChange={setReplacementDraft} onReplacementApplied={async column=>{countryEvaluation.refresh([column]);setSelected([]);await Promise.all([onChanged(),reloadCategories(),reloadSheetDirectory(),reloadGroups()]);}} onReload={reloadGroups} onInspect={name=>{const column=topSheet||countryCodes[0];const point=countryEvaluation.lookup.get(JSON.stringify([categoryKey(name),column]));if(point?.targets[0])setFullDetail({name,aliasId:point.targets[0].aliasId,tableId:column.split(":")[0],country:column.split(":")[1]});else setMessage("Este diplomado no tiene datos en el país seleccionado.");}}/>}
        {usageError&&<small role="status">{usageError} <button type="button" onClick={()=>void reloadUsage()}>Reintentar uso</button></small>}
        {showParameter("countries") && (
          <div className="inventory-country-controls">
            <button
              type="button"
              aria-label="Definir límites del factor"
              disabled={busy || factorLoading || !sheetDirectory}
              onClick={async () => {
                if (sheetDirectory) {
                  setFactorOpen(true);
                  return;
                }
                setFactorLoading(true);
                try {
                  await reloadSheetDirectory();
                  setFactorOpen(true);
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setFactorLoading(false);
                }
              }}
            >
              {factorLoading ? "…" : "Factor"}
            </button>
            <InventoryMultiSelect
              label="Hojas de evaluación visibles"
              placeholder="Hojas de evaluación"
              all={false}
              selectAll
              values={countryCodes}
              options={knownCountries.map((c) => ({
                value: c,
                label: sheetLabel(c),
              }))}
              onChange={setCountryChoice}
            />
            <button
              type="button"
              disabled={busy || !sheetDirectory?.canEdit}
              onClick={() => setSheetAddOpen(true)}
            >
              Agregar hoja
            </button>
            <button
              type="button"
              aria-label="Actualizar evaluación del inventario"
              disabled={countryEvaluation.loading || !countryCodes.length}
              onClick={() => setCountryReload((v) => v + 1)}
            >
              Actualizar evaluación
            </button>
          </div>
        )}
      </div>
      <FinancialTableWindow
        title="Lista de Diplomados · Inventario"
        scrollRef={inventoryScroll}
        mode={inventoryWindowMode}
        onModeChange={setInventoryWindowMode}
        controlsRef={inventoryWindowControls}
        toolbar={
          <div className="financial-table-window-toolbar">
            <strong>Lista de Diplomados · Inventario</strong>
          </div>
        }
      >
        <div
          ref={inventoryScroll}
          className="table-scroll inventory-table-scroll"
          role="region"
          aria-label="Tabla de inventario desplazable"
          tabIndex={0}
        >
          <table
            ref={tableRef}
            hidden={!columns.length}
            className="inventory-catalog-grid inventory-categorized-grid sheet-resizable-table"
            style={{
              width: columns.reduce(
                (n, c) => n + (widths[c.key] ?? c.width),
                0,
              ),
            }}
          >
            <colgroup>
              {columns.map((c) => (
                <col
                  key={c.key}
                  data-column-key={c.key}
                  style={{ width: widths[c.key] ?? c.width }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  rowSpan={1}
                  hidden={!showParameter("inventory")}
                >
                  {columnHandle("inventory", "Inventario")}
                  <div className="inventory-header-title">
                    <InventoryCheck
                      label="Seleccionar todo el inventario visible"
                      checked={
                        !!visibleIds.length &&
                        selectedVisible.length === visibleIds.length
                      }
                      mixed={
                        selectedVisible.length > 0 &&
                        selectedVisible.length < visibleIds.length
                      }
                      disabled={busy || !visibleIds.length}
                      onChange={(checked) => choose(visibleIds, checked)}
                    />
                    <span>Inventario ({visible.length})</span>
                  </div>
                  <div className="inventory-header-category-filter">
                    <InventoryCategoryFilter
                      label="Categorías del inventario"
                      values={activeCategories}
                      options={categoryOptions}
                      onChange={selectCategories}
                      onCreate={async (name) =>
                        createHeaderCategory("PRIMARY", name)
                      }
                      onError={setMessage}
                      disabled={busy || !categories}
                    />
                  </div>
                  <div className="inventory-item-filter">
                    <InventoryMultiSelect
                      label="Inventario del catálogo"
                      placeholder={
                        activeCategories.length === 1 &&
                        activeCategories[0] === noCategory
                          ? "Inventario sin categorías"
                          : activeCategories.length
                            ? "Inventario de las categorías elegidas"
                            : "Todo el inventario"
                      }
                      options={categoryInventory.map((g) => ({
                        value: g.links[0].id,
                        label: g.name,
                      }))}
                      values={filters.items}
                      disabled={busy || !categories}
                      description={
                        activeCategories.length
                          ? "Busca por nombre dentro de las categorías elegidas. Para ver otros inventarios, cambia o quita la categoría de arriba."
                          : "Busca por el nombre del inventario. Para buscar un área, usa el selector de categorías de arriba."
                      }
                      createLabel="Crear inventario"
                      onCreate={async (name) =>
                        saveNewRow(
                          { name, primary: [], secondary: [], sheets: [] },
                          { closeDraft: false, selectItem: true },
                        )
                      }
                      onError={setMessage}
                      onChange={(v) => setFilters({ ...filters, items: v })}
                    />
                    {categories && itemFilterChips.length > 0 && (
                      <div
                        ref={itemFilterTrack}
                        className="inventory-item-filter-chips"
                        role="group"
                        aria-label="Inventarios filtrados"
                        tabIndex={0}
                      >
                        {itemFilterChips.map((chip) => (
                          <span
                            key={chip.key}
                            data-inventory-filter-chip={chip.name}
                          >
                            <span title={chip.name}>{chip.name}</span>
                            <button
                              type="button"
                              aria-label={`Quitar filtro de inventario ${chip.name}`}
                              title={`Quitar ${chip.name}`}
                              disabled={busy}
                              onClick={() =>
                                setFilters({
                                  ...filters,
                                  items: filters.items.filter(
                                    (id) => !chip.ids.includes(id),
                                  ),
                                })
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </th>
                {(["PRIMARY", "SECONDARY"] as const).map((kind) => (
                  <th
                    key={kind}
                    scope="col"
                    rowSpan={1}
                    hidden={
                      !showParameter(
                        kind === "PRIMARY" ? "primary" : "secondary",
                      )
                    }
                  >
                    {columnHandle(
                      kind === "PRIMARY" ? "primary" : "secondary",
                      kind === "PRIMARY"
                        ? "Categoría principal"
                        : "Categorías secundarias",
                    )}
                    <div>
                      {kind === "PRIMARY"
                        ? "Categoría principal"
                        : "Categorías secundarias"}
                    </div>
                    <InventoryMultiSelect
                      label={
                        kind === "PRIMARY"
                          ? "Filtro de categorías principales"
                          : "Filtro de categorías secundarias"
                      }
                      placeholder="Todas"
                      options={directoryNames.map((name) => ({
                        value: name,
                        label: `${name} (${levelCategoryCounts[kind].get(name) ?? 0})`,
                        searchLabel: name,
                      }))}
                      values={
                        kind === "PRIMARY" ? primaryNames : secondaryNames
                      }
                      disabled={busy || !categories}
                      description="Busca una categoría o escribe una nueva para añadirla al catálogo."
                      onCreate={async (name) =>
                        createHeaderCategory(kind, name)
                      }
                      createLabel="Añadir categoría"
                      onError={setMessage}
                      onChange={(v) =>
                        setFilters({
                          ...filters,
                          [kind === "PRIMARY" ? "primary" : "secondary"]: v,
                        })
                      }
                    />
                    <button
                      type="button"
                      className="inventory-header-assign"
                      aria-label={`Asignar o quitar categoría ${kind === "PRIMARY" ? "principal" : "secundaria"} a seleccionados`}
                      disabled={busy || !categories || !selectedGroups}
                      title={
                        selectedGroups
                          ? `Asignar a ${selectedGroups} inventarios seleccionados visibles`
                          : "Marca los inventarios que deseas actualizar"
                      }
                      onClick={() =>
                        setAssignment({
                          kind,
                          ids: [...selectedVisible],
                          names: visible
                            .filter((g) =>
                              g.links.some((a) =>
                                selectedVisible.includes(a.id),
                              ),
                            )
                            .map((g) => g.name),
                        })
                      }
                    >
                      Asignar o quitar
                      {selectedGroups ? ` (${selectedGroups})` : ""}
                    </button>
                  </th>
                ))}
                <th
                  scope="col"
                  rowSpan={1}
                  hidden={!showParameter("sheets")}
                >
                  {columnHandle("sheets", "Hojas")}
                  <div>Hojas</div>
                  <InventoryMultiSelect
                    label="Hojas del inventario"
                    placeholder="Todas las hojas"
                    options={tables.map((t) => ({
                      value: t.id,
                      label: t.name,
                    }))}
                    values={filters.sheets}
                    onChange={(v) => setFilters({ ...filters, sheets: v })}
                  />
                  <InventoryActionMenu
                    label="Asignar o quitar hojas"
                    disabled={busy || !selectedGroups}
                  >
                    <InventoryMultiSelect
                      label="Asignar hojas a inventarios seleccionados"
                      onOpen={() => {
                        sheetAssignment.current = categories
                          ? {
                              revision: categories.revision,
                              items: visible
                                .filter((g) =>
                                  g.links.some((a) =>
                                    selectedVisible.includes(a.id),
                                  ),
                                )
                                .map((g) => ({
                                  inventoryId: g.links.find((a) =>
                                    selectedVisible.includes(a.id),
                                  )!.id,
                                  expectedName: g.name,
                                })),
                            }
                          : null;
                      }}
                      placeholder={
                        "Asignar hojas" +
                        (selectedGroups ? " (" + selectedGroups + ")" : "")
                      }
                      values={[]}
                      all={false}
                      options={tables.map((t) => ({
                        value: t.id,
                        label: t.name,
                      }))}
                      disabled={busy || !categories || !selectedGroups}
                      description={
                        "Añade las hojas elegidas a " +
                        selectedGroups +
                        " inventarios seleccionados visibles. Los vínculos actuales se conservan."
                      }
                      onError={setMessage}
                      onChange={async (tableIds) => {
                        if (!tableIds.length || !categories) return;
                        const snapshot = sheetAssignment.current;
                        if (!snapshot)
                          throw Error(
                            "Vuelve a abrir Asignar hojas para revisar la selección.",
                          );
                        const items = snapshot.items;
                        if (!items.length) return;
                        setBusy(true);
                        let committed = false;
                        try {
                          const result = await api(
                            "meta-ads/inventory/sheets/batch",
                            "POST",
                            {
                              listId,
                              revision: snapshot.revision,
                              tableIds,
                              items,
                            },
                          );
                          committed = true;
                          setSelected([]);
                          await Promise.all([onChanged(), reloadCategories()]);
                          setMessage(
                            result.created
                              ? `Hojas asignadas a ${result.items} inventarios: ${result.created} vínculos nuevos.`
                              : "Los inventarios ya están en las hojas elegidas.",
                          );
                        } catch (e) {
                          if (committed)
                            setMessage(
                              "Las hojas se asignaron. Actualiza para ver los cambios.",
                            );
                          else throw e;
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="inventory-header-assign"
                      disabled={
                        busy ||
                        !trialDirectory?.canEdit ||
                        !visible.some(
                          (g) =>
                            g.links.some((a) =>
                              selectedVisible.includes(a.id),
                            ) && g.links.some((a) => !a.standalone),
                        )
                      }
                      onClick={() =>
                        setSheetRemoval(
                          visible
                            .filter((g) =>
                              g.links.some((a) =>
                                selectedVisible.includes(a.id),
                              ),
                            )
                            .flatMap((g) =>
                              g.links
                                .filter((a) => !a.standalone)
                                .map((a) => a.id),
                            ),
                        )
                      }
                    >
                      Quitar hojas de seleccionados
                      {selectedGroups ? ` (${selectedGroups})` : ""}
                    </button>
                  </InventoryActionMenu>
                </th>
                <th
                  scope="col"
                  rowSpan={1}
                  hidden={!showParameter("group")}
                >
                  {columnHandle("group", "Grupo")}
                  <div className="inventory-group-heading">
                    <span>Grupo</span>
                    <button
                      type="button"
                      aria-label="Ordenar inventario por grupos"
                      aria-pressed={groupOrder === "groups"}
                      onClick={() =>
                        setGroupOrder(groupOrder === "groups" ? "" : "groups")
                      }
                    >
                      {groupOrder === "groups"
                        ? "Ordenado por grupos ✓"
                        : "Ordenar por grupos"}
                    </button>
                  </div>
                  <div className="inventory-group-filter-control">
                    <select
                      title="Filtrar filas; no cambia sus asignaciones"
                      aria-label="Filtrar inventario por grupo"
                      value={groupFilter}
                      onChange={e=>{if(e.target.value==="new"){setGroupFilter("");document.querySelector('[aria-label="Grupos integrados"]')?.scrollIntoView({block:"nearest"});}else setGroupFilter(e.target.value);}}
                    >
                      <option value="">Ver: todos los grupos</option>
                      <option value="none">Ver: sin grupo</option>
                      <option
                        value="new"
                        disabled={!trialDirectory?.canEdit || busy}
                      >
                        + Crear grupo…
                      </option>
                      {trialGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          Ver: {g.name} ({g.members.length})
                        </option>
                      ))}
                    </select>
                    {groupFilter && (
                      <button
                        type="button"
                        aria-label="Quitar filtro de grupo"
                        title="Volver a ver todo el inventario"
                        onClick={() => setGroupFilter("")}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {sheetDirectory?.canCorrectCountry && selectedVisible.length>0 && <button type="button" disabled={busy || !trialDirectory} title="Reúne diplomados duplicados conservando hojas e historial; no elimina grupos" onClick={()=>{const names=visible.filter(entry=>entry.links.some(alias=>selectedVisible.includes(alias.id))).map(entry=>categoryKey(entry.name));const ids=trialDirectory?.catalog.filter(item=>names.includes(categoryKey(item.name))).map(item=>item.id)??[];if(ids.length)setGroupUnification(ids);}}>Unificar duplicados…</button>}
                  <InventoryActionMenu
                    label="Asignar o quitar grupos"
                    disabled={busy || !selectedGroups}
                  >
                    <InventoryGroupSelect
                      groups={trialGroups}
                      value={commonSelectedGroup}
                      placeholder={
                        selectedAssignedGroups.size > 1
                          ? "Varios grupos seleccionados"
                          : "Asignar grupo a seleccionados…"
                      }
                      label="Asignar grupo a inventarios seleccionados"
                      disabled={
                        !trialDirectory?.canEdit ||
                        !selectedVisible.length ||
                        busy
                      }
                      onSelect={(id) =>
                        assignGroupDirectly(
                          id,
                          visible
                            .filter((g) =>
                              g.links.some((a) =>
                                selectedVisible.includes(a.id),
                              ),
                            )
                            .map((g) => g.name),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="inventory-remove-group-bulk"
                      disabled={
                        !trialDirectory?.canEdit || busy || !removalCount
                      }
                      onClick={() => void removeGroupMembers(removalGroups)}
                      title="Quita la asignación solo de los diplomados seleccionados visibles; conserva los grupos y el inventario"
                    >
                      Quitar grupo a seleccionados
                      {removalCount ? ` (${removalCount})` : ""}
                    </button>
                  </InventoryActionMenu>
                </th>
                {countryCodes.map(column=><th key={column} scope="col" hidden={compactCountryHidden(hiddenColumnKeys,column)} className="inventory-country-heading inventory-country-heading-compact" data-country-block={column}>
                  <SheetColumnResizer label={sheetLabel(column)} onResize={value=>resize(`country:${column}:compact`,value)} onReset={()=>resize(`country:${column}:compact`)}/>
                  <div className="inventory-country-title"><span tabIndex={0} role="button" className="inventory-country-drag" aria-label={`Reordenar país ${sheetLabel(column)}`} title="Arrastra para ordenar · Alt + flechas" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();countryPointer.current={id:column,x:e.clientX,y:e.clientY,moving:false};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const drag=countryPointer.current;if(!drag||drag.id!==column)return;if(!drag.moving&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;drag.moving=true;e.preventDefault();const header=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('th.inventory-country-heading[data-country-block]');const target=header?.dataset.countryBlock;if(target&&target!==drag.id&&knownCountries.includes(target))moveCountryBlock(drag.id,target);}} onPointerUp={e=>{countryPointer.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{countryPointer.current=null;}} onLostPointerCapture={()=>{countryPointer.current=null;}} onKeyDown={e=>{if(e.altKey&&["ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();const index=knownCountries.indexOf(column),next=knownCountries[index+(e.key==="ArrowLeft"?-1:1)];if(next)moveCountryBlock(column,next);}}}>⠿ {countryName(column.slice(column.lastIndexOf(":")+1))}</span><button type="button" className="inventory-sheet-top-control" aria-label={`Ver Top de ${sheetLabel(column)}`} aria-pressed={topSheet===column} onClick={()=>{setTopPreference(topSheet===column?"":column);setGroupFilter("");setGroupOrder("groups");}}>Top</button>{hideControl([`country:${column}:compact`],sheetLabel(column))}</div>
                  <div className="inventory-country-filter-row"><select aria-label={`Filtrar campañas de ${sheetLabel(column)}`} value={countryFilters.get(column)||(column===campaignFilterSheet?campaignFilter:"")} onChange={e=>setCountryFilter(column,e.target.value)}><option value="">Todos</option><optgroup label="Campaña"><option value="ACTIVE">Activados</option><option value="INACTIVE">Desactivados</option><option value="CREATE">Por hacer campaña</option><option value="STOP">Por desactivar</option></optgroup><optgroup label="Uso"><option value="USED">Usados</option><option value="NEVER">Sin usar</option><option value="HISTORY">Con historial</option></optgroup><optgroup label="Evaluación"><option value="status:CRITICAL">Crítico</option><option value="status:SEVERE">Grave</option><option value="status:ALERT">Revisar</option><option value="status:WITHIN">Normal</option><option value="status:TESTING">Bajo gasto aún</option><option value="status:PENDING">Datos pendientes</option></optgroup></select><EvaluationOrderControl period={evaluationPeriod} onChange={setEvaluationPeriod} onOrder={criticalFirst=>setCountrySort({country:column,metric:"status",ascending:!criticalFirst})}/></div>
                </th>)}
                <th
                  rowSpan={1}
                  hidden={!columns.some((c) => c.key === "gap")}
                  aria-hidden="true"
                  className="inventory-column-gap"
                />
                <th
                  scope="col"
                  rowSpan={1}
                  hidden={!showParameter("syllabi")}
                >
                  {columnHandle("syllabi", "Temarios")}Temarios
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map(([key, section]) => {
                if(!section.groups.some(group=>mountedInventoryNames.has(group.name)))return null;
                // Sections are built from `visible`: never select the whole category directory.
                const sectionIds = section.groups.flatMap((g) =>
                  g.links.map((a) => a.id),
                );
                const selectedSectionIds = sectionIds.filter((id) =>
                  selected.includes(id),
                );
                const selectedSectionGroups = section.groups.filter((g) =>
                  g.links.some((a) => selectedSet.has(a.id)),
                ).length;
                return (
                  <Fragment key={key}>
                    {section.trialTitle && (
                      <tr
                        className="inventory-trial-group-band"
                        data-inventory-trial-group={section.trialTitle}
                      >
                        <th
                          colSpan={Math.max(1, columns.length)}
                          scope="rowgroup"
                        >
                          <div className="inventory-band-heading">
                            <strong>{section.trialTitle}</strong>
                            <small>{section.trialCount} diplomados</small>
                            {section.trialId && (
                              <>
                                <button
                                  disabled={!trialDirectory?.canEdit}
                                  onClick={() =>
                                    setGroupFilter(section.trialId!)
                                  }
                                >
                                  Editar grupo
                                </button>

                              </>
                            )}
                          </div>
                        </th>
                      </tr>
                    )}
                    <tr
                      hidden={section.hideBand}
                      className={
                        "inventory-group-band" +
                        (section.accent === "blue"
                          ? " inventory-filter-band"
                          : "") +
                        (section.top ? " inventory-top-band" : "")
                      }
                      data-category-group={section.title}
                      data-inventory-top={section.top ? topSheet : undefined}
                    >
                      <th
                        colSpan={Math.max(1, columns.length)}
                        scope="rowgroup"
                      >
                        <div className="inventory-band-heading">
                          <InventoryCheck
                            label={`Seleccionar visibles de ${section.title}`}
                            checked={
                              !!sectionIds.length &&
                              selectedSectionIds.length === sectionIds.length
                            }
                            mixed={
                              selectedSectionIds.length > 0 &&
                              selectedSectionIds.length < sectionIds.length
                            }
                            disabled={busy || !sectionIds.length}
                            onChange={(checked) => choose(sectionIds, checked)}
                          />
                          <span
                            className="inventory-band-title"
                            title={section.title}
                          >
                            {section.title}
                          </span>
                          <small>
                            {section.groups.length}{" "}
                            {section.groups.length === 1 ? "ítem" : "ítems"}
                          </small>
                          {!section.top && bandCategorySelector(section)}
                          {selectedSectionGroups > 0 && (
                            <>
                              <small
                                className="inventory-band-selected"
                                role="status"
                              >
                                {selectedSectionGroups} seleccionado
                                {selectedSectionGroups === 1 ? "" : "s"}
                              </small>
                              {topSheet?.includes(":")&&<button type="button" aria-label={`Evaluar ${selectedSectionGroups} seleccionados en ${sheetLabel(topSheet)}`} onClick={()=>{
                                const chosen=section.groups.filter(g=>g.links.some(a=>selectedSet.has(a.id))),range=evaluationRange(evaluationPeriod),starts=chosen.flatMap(g=>{const point=countryEvaluation.lookup.get(JSON.stringify([categoryKey(g.name),topSheet]));return point?.since?[point.since]:[]}).sort();
                                const since=range.since??starts[0]?.slice(0,10);if(!since){setMessage("Elige un período de evaluación antes de abrir la selección.");return}
                                setSelectionEvaluation({column:topSheet,names:chosen.map(g=>g.name),ids:chosen.flatMap(g=>g.links.filter(a=>!a.standalone&&a.tableId===topSheet.split(":")[0]).map(a=>a.id)),since,until:range.until??limaToday()});
                              }}>Evaluar seleccionados ({selectedSectionGroups})</button>}
                              <button
                                type="button"
                                className="inventory-band-delete"
                                aria-label={`Eliminar seleccionados visibles de ${section.title}`}
                                disabled={busy}
                                onClick={() =>
                                  setBulkIds([...selectedSectionIds])
                                }
                              >
                                Eliminar seleccionados ({selectedSectionGroups})
                              </button>
                            </>
                          )}
                        </div>
                      </th>
                    </tr>
                    {section.groups.filter(group=>mountedInventoryNames.has(group.name)).map((g) => (
                      <InventorySizedRow
                        selection={`${g.links.every(a=>selectedSet.has(a.id))}:${g.links.some(a=>selectedSet.has(a.id))}`}
                        model={cellModel}
                        evaluation={rowEvaluationVersions.get(g.name)??""}
                        label={g.name}
                        height={rowsLayout.heights[g.links[0].id]}
                        onResize={(v) => rowsLayout.resize(g.links[0].id, v)}
                        onReset={() => rowsLayout.resize(g.links[0].id)}
                        key={g.name}
                        data-inventory-name={g.name}
                        data-selected={
                          g.links.some((a) => selectedSet.has(a.id)) ||
                          undefined
                        }
                      >
                        <td
                          hidden={!showParameter("inventory")}
                          data-fill-kind="manual"
                        >
                          <div className="inventory-name-cell">
                            <InventoryCheck
                              label={`Seleccionar inventario ${g.name}`}
                              checked={g.links.every((a) =>
                                selectedSet.has(a.id),
                              )}
                              mixed={
                                g.links.some((a) => selectedSet.has(a.id)) &&
                                !g.links.every((a) => selectedSet.has(a.id))
                              }
                              disabled={busy}
                              onChange={(checked) =>
                                choose(
                                  g.links.map((a) => a.id),
                                  checked,
                                )
                              }
                            />
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
                                await Promise.all([onChanged(), reloadCategories()]);
                              }}
                            />
                          </div>
                        </td>
                        <InventoryStableCells model={cellModel} evaluation={rowEvaluationVersions.get(g.name) ?? ""} render={()=> <>
                        {categoryCell(g, "PRIMARY")}
                        {categoryCell(g, "SECONDARY")}
                        <td
                          hidden={!showParameter("sheets")}
                          data-fill-kind="manual"
                        >
                          <div className="inventory-sheet-toolbar">
                            <div className="inventory-sheet-links">
                              {g.links
                                .filter((a) => !a.standalone)
                                .map((a) => (
                                  <span
                                    key={a.id}
                                    className="inventory-sheet-chip"
                                    data-inventory-id={a.id}
                                  >
                                    <span
                                      className="inventory-sheet-chip-label"
                                      title={a.tableName}
                                    >
                                      {a.tableName}
                                    </span>
                                    <button
                                      type="button"
                                      className="inventory-remove"
                                      aria-label={`Quitar ${g.name} de ${a.tableName}`}
                                      title={`Quitar vínculo de ${a.tableName}; conservar historial`}
                                      disabled={busy}
                                      onClick={() => setSheetRemoval([a.id])}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                            </div>
                            <InventoryMultiSelect
                              label={`Añadir hojas a ${g.name}`}
                              placeholder="+"
                              compact
                              all={false}
                              values={[]}
                              options={tables
                                .filter(
                                  (t) =>
                                    !g.links.some((a) => a.tableId === t.id),
                                )
                                .map((t) => ({ value: t.id, label: t.name }))}
                              disabled={busy || !categories}
                              description={
                                tables.length === 0
                                  ? "Aún no hay hojas creadas."
                                  : tables.every((t) =>
                                        g.links.some((a) => a.tableId === t.id),
                                      )
                                    ? "El diplomado ya está vinculado a todas las hojas disponibles."
                                    : "Busca y marca una o varias hojas. Pulsa Listo para añadir este diplomado; sus vínculos actuales se conservan."
                              }
                              onError={setMessage}
                              onChange={async (tableIds) => {
                                if (!tableIds.length || !categories) return;
                                setBusy(true);
                                let committed = false;
                                try {
                                  const result = await api(
                                    "meta-ads/inventory/sheets",
                                    "POST",
                                    {
                                      listId,
                                      revision: categories.revision,
                                      inventoryId: g.links[0].id,
                                      expectedName: g.name,
                                      tableIds,
                                    },
                                  );
                                  committed = true;
                                  if (
                                    g.links.some((a) => selectedForActions.current.includes(a.id))
                                  )
                                    setSelected((old) => [
                                      ...new Set([...old, ...result.aliasIds]),
                                    ]);
                                  await Promise.all([onChanged(), reloadCategories()]);
                                  setMessage(
                                    result.created
                                      ? `«${g.name}» añadido a ${result.created} hoja${result.created === 1 ? "" : "s"}.`
                                      : "El diplomado ya está vinculado a las hojas elegidas.",
                                  );
                                } catch (e) {
                                  if (committed)
                                    setMessage(
                                      "Las hojas se vincularon. Actualiza para ver todos los cambios.",
                                    );
                                  else throw e;
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            />
                          </div>
                        </td>
                        <td hidden={!showParameter("group")}>
                          {(() => {
                            const assigned = trialGroupByName.get(
                              categoryKey(g.name),
                            );
                            return assigned ? (
                              <div className="inventory-group-cell">
                                <button type="button" className="inventory-row-evaluate" aria-label={`Evaluar ${g.name} en ${assigned.name}`} onClick={()=>setCompactEvaluation({groupId:assigned.id,name:g.name})}>Evaluar ↗</button>
                                <InventoryGroupSelect groups={trialGroups} value={assigned.id} label={`Cambiar grupo de ${g.name}`} disabled={!trialDirectory?.canEdit||busy} onSelect={id=>id!=="new"?changeAssignedGroup(assigned,id,g.name):assignGroupDirectly(id,[g.name])}/>

                                <button
                                  type="button"
                                  className="inventory-remove"
                                  aria-label={`Quitar ${assigned.name} de ${g.name}`}
                                  title={`Quitar ${assigned.name} de este diplomado`}
                                  disabled={!trialDirectory?.canEdit || busy}
                                  onClick={() =>
                                    void removeGroupMembers([
                                      {
                                        groupId: assigned.id,
                                        revision: assigned.revision,
                                        itemIds: assigned.members
                                          .filter(
                                            (m) =>
                                              categoryKey(
                                                trialItemsById.get(m.itemId)
                                                  ?.name ?? m.name,
                                              ) === categoryKey(g.name),
                                          )
                                          .map((m) => m.itemId),
                                      },
                                    ])
                                  }
                                >
                                  ×
                                </button>

                              </div>
                            ) : (
                              <InventoryGroupSelect
                                groups={trialGroups}
                                label={"Asignar grupo a " + g.name}
                                disabled={!trialDirectory?.canEdit || busy}
                                onSelect={(id) =>
                                  assignGroupDirectly(id, [g.name])
                                }
                              />
                            );
                          })()}
                        </td>
                        {hasCountryColumns && (
                          <InventoryCountryCells
                            canEdit={!!sheetDirectory?.canEdit}
                            busy={busy}
                            name={g.name}
                            countries={countryCodes}
                            visibleCountries={viewportCountries}
                            hiddenColumns={hiddenColumnKeys}
                            evaluation={countryEvaluation}
                            onReplace={(column,name)=>{setReplacementDraft(current=>({column,names:current?.column===column?[...new Set([...current.names,name])]:[name]}));document.querySelector('[aria-label="Por reemplazar"]')?.scrollIntoView({block:"nearest"});}}
                            replacementSelection={replacementDraft}
                            renderUsage={(column,point)=>{const code=column.slice(column.lastIndexOf(":")+1),item=trialItemsByName.get(categoryKey(g.name));return <InventoryUsageControl listId={listId} itemId={item?.id} name={g.name} country={code} ready={trialDirectory?.usageReady===true} canEdit={!!trialDirectory?.canEdit&&!busy} cell={trialDirectory?.usage[JSON.stringify([categoryKey(g.name),code])]} onApplied={cell=>setTrialDirectory(current=>current?{...current,usage:{...current.usage,[JSON.stringify([categoryKey(g.name),code])]:cell}}:current)}/>;}}
                            renderSync={(column, point) => {
                              const tableId = column.split(":")[0],
                                country = column.split(":")[1];
                              const saved = sheetDirectory?.synchronization[JSON.stringify([categoryKey(g.name),tableId,country])];
                              const aliasId = saved?.aliasId ?? point?.targets[0]?.aliasId;
                              const source = g.links[0];
                              return (
                                <InventoryMetaSync menu
                                  tableId={tableId}
                                  tableName={
                                    tables.find((t) => t.id === tableId)
                                      ?.name ?? "Hoja"
                                  }
                                  listId={listId}
                                  name={g.name}
                                  country={country}
                                  aliasId={aliasId}
                                  syncState={point ? (point.synchronizationReady ? "ready" : "pending") : sheetDirectory ? (saved?.ready ? "ready" : "pending") : undefined}
                                  catalogId={
                                    source
                                      ? (source.standalone
                                          ? "item:"
                                          : "alias:") + source.id
                                      : undefined
                                  }
                                  disabled={busy || !sheetDirectory?.canEdit}
                                  onSynced={()=>onInventorySynced(column)}
                                />
                              );
                            }}

                            sheetLabel={sheetLabel}
                            onChange={(tableId, name, change) =>
                              void changeSheetActivation(
                                tableId,
                                [name],
                                change,
                              )
                            }
                            onDetail={(column, name, aliasId) =>
                              aliasId
                                ? setFullDetail({
                                    tableId: column.split(":")[0],
                                    country: column.split(":")[1],
                                    name,
                                    aliasId,
                                  })
                                : setActivationHistory({
                                    tableId: column,
                                    name,
                                  })
                            }
                            onHistory={(tableId, name) =>
                              setActivationHistory({ tableId, name })
                            }
                          />
                        )}
                        <td
                          hidden={!columns.some((c) => c.key === "gap")}
                          aria-hidden="true"
                          className="inventory-column-gap"
                        />
                        <td
                          hidden={!showParameter("syllabi")}
                          className="inventory-syllabi-cell"
                        >
                          <InventorySyllabusChips
                            label={g.name}
                            syllabi={syllabiByName.get(g.name) ?? []}
                            disabled={busy || syllabiBusy}
                            onOpen={(id) =>
                              setSyllabiOpen({ name: g.name, id })
                            }
                            onRename={(id, title) =>
                              renameSyllabus(g.name, id, title)
                            }
                            onRemove={(id) => void removeSyllabus(g.name, id)}
                            onAdd={() =>
                              setSyllabiOpen({ name: g.name, id: "__new" })
                            }
                          />
                        </td>
                        </>}/>
                      </InventorySizedRow>
                    ))}
                  </Fragment>
                );
              })}
              {orderedInventoryNames.length>100&&<tr className="inventory-row-window"><td colSpan={Math.max(1,columns.length)}><span role="status">Mostrando {Math.min(inventoryRowLimit,orderedInventoryNames.length)} de {orderedInventoryNames.length} diplomados</span>{inventoryRowLimit<orderedInventoryNames.length&&<button type="button" onClick={()=>setInventoryRowLimit(n=>n+100)}>Mostrar 100 diplomados más</button>}</td></tr>}
            </tbody>
            <tfoot>
              {newRowOpen && (
                <InventoryNewRow
                  visibleParameters={parameters}
                  countryColumnCount={
                    columns.filter((column) =>
                      column.key.startsWith("country:"),
                    ).length
                  }
                  directory={directoryNames}
                  tables={tables}
                  disabled={busy}
                  onSave={saveNewRow}
                  onCancel={() => setNewRowOpen(false)}
                />
              )}
              <tr className="inventory-add-row">
                <td colSpan={Math.max(1, columns.length)}>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !categories ||
                      newRowOpen ||
                      !showParameter("inventory")
                    }
                    onClick={() => setNewRowOpen(true)}
                  >
                    + Agregar fila
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
          {!columns.length && (
            <p className="sheet-help">
              Elige las columnas que quieres mostrar en «Ver parámetros».
            </p>
          )}
          {!visible.length && (
            <p className="sheet-help">
              No hay elementos que coincidan con los filtros.
            </p>
          )}
        </div>
      </FinancialTableWindow>
      {importView && categories && (
        <InventoryImport
          listId={listId}
          revision={categories.revision}
          config={categories}
          inventoryNames={available.map((g) => g.name)}
          upload={importView === "file"}
          onClose={() => {
            setImportView(null);
            if (importView === "file") restoreImportFocus();
          }}
          onSaved={async () => {
            await Promise.all([onChanged(), reloadCategories()]);
            setMessage(
              "Guardado. Las categorías sin ítems se consultan en «Ver categorías».",
            );
            clearFilters();
          }}
        />
      )}
      {categoryManager && categories && (
        <InventoryCategoryManager
          config={categories}
          onView={(names) => {
            clearFilters();
            selectCategories(names);
            setCategoryManager(null);
          }}
          selectedIds={selectedVisible}
          selectedCount={selectedGroups}
          initialView={categoryManager}
          onClose={() => setCategoryManager(null)}
          onSave={saveCategory}
          onRefresh={async () => {
            await reloadCategories();
          }}
        />
      )}
      {sheetRemoval && (
        <InventorySelectionDelete
          listId={listId}
          ids={sheetRemoval}
          sheetsOnly
          onClose={() => setSheetRemoval(null)}
          onRemoved={async () => {
            await Promise.all([onChanged(), reloadCategories()]);
            await reloadGroups();
            setSelected([]);
            setSheetRemoval(null);
            setMessage("Hojas retiradas de los seleccionados.");
          }}
        />
      )}
      {selectionEvaluation&&<SelectedInventoryEvaluation tableId={selectionEvaluation.column.split(":")[0]} selection={selectionEvaluation.ids.map(id=>JSON.stringify([id,selectionEvaluation.column.split(":")[1]]))} scopedSelection={{listId,country:selectionEvaluation.column.split(":")[1],names:selectionEvaluation.names}} inventoryAliases={selectionEvaluation.ids.map(id=>({id,inventorySheetId:listId}))} name={`${selectionEvaluation.names.length} diplomados · ${countryName(selectionEvaluation.column.split(":")[1])}`} initialSince={selectionEvaluation.since} initialUntil={selectionEvaluation.until} onClose={()=>setSelectionEvaluation(null)}/>}
      {compactEvaluation&&trialDirectory?.groups.find(g=>g.id===compactEvaluation.groupId)&&<InventoryCompactEvaluation listId={listId} group={trialDirectory.groups.find(g=>g.id===compactEvaluation.groupId)!} focusName={compactEvaluation.name} onClose={()=>setCompactEvaluation(null)}/>}
      {groupUnification && trialDirectory && <InventoryDiplomaUnification listId={listId} sourceIds={groupUnification} catalog={trialDirectory.catalog} onClose={()=>setGroupUnification(null)} onUnified={async result=>{
        await Promise.all([onChanged(),reloadCategories(),reloadGroups(),reloadSheetDirectory()]);
        setCountryReload(current=>current+1);
        setSelected([]);
        setGroupUnification(null);
        setMessage("Diplomados unificados en «"+result.targetName+"», con sus hojas e historial.");
      }}/>}
      {bulkIds && (
        <InventorySelectionDelete
          listId={listId}
          ids={bulkIds}
          onClose={() => setBulkIds(null)}
          onRemoved={async (ids) => {
            await Promise.all([onChanged(), reloadCategories()]);
            setSelected((old) => old.filter((id) => !bulkIds.includes(id)));
            setBulkIds(null);
            setMessage("Selección eliminada de las hojas confirmadas.");
          }}
        />
      )}
      {duplicateReview.dialog}
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

function InventoryGroupLoading({error,onClose,onRetry}:{error:string;onClose:()=>void;onRetry:()=>void}) { const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();},[]);return <dialog ref={ref} className="trial-dialog inventory-group-editor" aria-label="Grupos" onCancel={e=>{e.preventDefault();onClose();}}><header><h2>Grupos</h2><button type="button" className="ui-close-button" aria-label="Cerrar grupos" onClick={onClose}>×</button></header>{error?<><p role="alert">{error}</p><button type="button" onClick={onRetry}>Volver a cargar grupos</button></>:<p role="status">Cargando inventario y grupos…</p>}</dialog>; }
