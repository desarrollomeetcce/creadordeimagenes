"use client";
import { useMemo, useRef, useState, useId, useEffect } from "react";
import type {
  TrialDirectory,
  TrialGroup,
} from "../../lib/meta-ads/inventory-trials";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import {
  suggestedGroupNames,
  groupCreationName,
  sameGroupName,
} from "../../lib/meta-ads/inventory-inline-policy";
import {
  randomInventoryAdditions,
  randomCategoryAdditions,
} from "../../lib/meta-ads/inventory-group-addition-policy";
import { financialRequest as api } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { InventoryActionMenu } from "./inventory-action-menu";
import dynamic from "next/dynamic";
const InventorySheetReplacement=dynamic(()=>import("./inventory-sheet-replacement").then(m=>m.InventorySheetReplacement));
import { limaToday } from "./date-range";
export function InventoryInlineGroups({
  directory,
  groupId,
  selectedNames,
  countries,
  onGroupSelect,
  onSelectNames,
  onPatched,
  onReload,
  onInspect,
  onCategoryFilter,
  categoryFilter,
  replacement,
  replacementColumns,
  defaultColumn,
  onReplacementChange,
  onReplacementApplied,
}: {
  directory: TrialDirectory;
  groupId: string;
  selectedNames: string[];
  countries: { code: string; name: string }[];
  onGroupSelect: (id: string) => void;
  onSelectNames: (names: string[]) => void;
  onPatched: (group: TrialGroup) => Promise<void>;
  onReload: () => Promise<void>;
  onInspect: (name: string) => void;
  onCategoryFilter: (name: string) => void;
  categoryFilter:string;
  replacement: { column: string; names: string[] } | null;
  replacementColumns: { id: string; label: string }[];
  defaultColumn: string;
  onReplacementChange: (
    draft: { column: string; names: string[] } | null,
  ) => void;
  onReplacementApplied: (column: string) => Promise<void>;
}) {
  const pending = useRef(false),
    requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [draftName, setDraftName] = useState<string | null>(null),
    [count, setCount] = useState(10),
    [countryChoice, setCountryChoice] = useState<string[] | null>(null);
  const [category,setCategory]=useState("");
  const [creating,setCreating]=useState(false),[query,setQuery]=useState(""),[limit,setLimit]=useState(50);
  const creationDialog=useRef<HTMLDialogElement>(null),replacePanel=useRef<HTMLDivElement>(null),controls=useRef<HTMLDivElement>(null);
  const replacementId=useId();
  function positionReplacement(show=false){const panel=replacePanel.current,rect=controls.current?.getBoundingClientRect();if(!panel)return;const top=Math.max(8,Math.min((rect?.bottom??104)+6,innerHeight-260));panel.style.top=top+"px";panel.style.left=Math.max(8,Math.min(rect?.left??8,innerWidth-740))+"px";panel.style.maxHeight=Math.max(180,innerHeight-top-12)+"px";if(show)panel.showPopover()}
  useEffect(()=>{if(replacement?.names.length)positionReplacement(true)},[replacement]);
  const nameList = useId();
  const group = directory.groups.find((g) => !creating && g.id === groupId);
  const suggestions = useMemo(
    () => suggestedGroupNames(directory.groups.map((g) => g.name)),
    [directory.groups],
  );
  const name = draftName ?? group?.name ?? suggestions[0];
  const membership = useMemo(
    () =>
      new Map(
        directory.groups.flatMap((g) =>
          g.members.map((m) => [categoryKey(m.name), g] as const),
        ),
      ),
    [directory.groups],
  );
  const itemsByName = useMemo(
    () => new Map(directory.catalog.map((i) => [categoryKey(i.name), i])),
    [directory.catalog],
  );
  const selected = selectedNames.flatMap((n) => {
    const item = itemsByName.get(categoryKey(n));
    return item ? [item] : [];
  });
  const free = useMemo(
    () => directory.catalog.filter((i) => !membership.has(categoryKey(i.name))),
    [directory.catalog, membership],
  );
  const categoryOptions = useMemo(
    () =>
      [
        ...new Set(
          directory.catalog.flatMap((i) => [...i.primaryNames, ...(i.secondaryNames ?? [])]),
        ),
      ].sort((a, b) => a.localeCompare(b, "es")),
    [directory.catalog],
  );
  const freeCategoryCounts=useMemo(()=>{const counts=new Map<string,number>();for(const item of free)for(const key of new Set([...item.primaryNames,...(item.secondaryNames??[])].map(categoryKey)))counts.set(key,(counts.get(key)??0)+1);return counts;},[free]);
  async function run(body: Record<string, unknown>, reload = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    let saved = false;
    try {
      const result: TrialGroup = await api(
        "meta-ads/inventory/trials",
        "POST",
        { listId: directory.listId, ...body },
      );
      saved = true;
      if (reload) await onReload();
      else await onPatched(result);
      onSelectNames([]);
      setMessage("Grupo actualizado.");
      if(body.action==="CREATE"){creationDialog.current?.close();setCreating(false);}
      return true;
    } catch (e) {
      setMessage(
        (saved ? "Guardado. Falta actualizar la vista. " : "") +
          (e as Error).message,
      );
      if ((e as { status?: number }).status === 409)
        await onReload().catch(() => {});
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function create(value: string) {
    const next = groupCreationName(value);
    if (next.length > 100 || !value.trim()) {
      setMessage("Usa un nombre de hasta100 caracteres.");
      return;
    }
    if (directory.groups.some((g) => sameGroupName(g.name, next))) {
      setMessage("Ya existe ese grupo.");
      return;
    }
    setDraftName(next);
    onGroupSelect("");
    if (!selected.length) {
      setMessage(
        "Marca los diplomados y pulsa Agregar para crear " + next + ".",
      );
      return;
    }
    const codes = countryChoice ?? countries.map((c) => c.code);
    if (!codes.length) {
      setMessage("Selecciona al menos un país.");
      return;
    }
    requestId.current ??= crypto.randomUUID();
    const created = await run({
      action: "CREATE",
      requestId: requestId.current,
      name: next,
      itemIds: selected.map((i) => i.id),
      countries: codes,
      since: limaToday(),
      reserve: false,
      diverse: false,
      rules: { zero: 25, perSale: 50 },
    });
    if (created) {
      requestId.current = null;
      setDraftName(null);
    }
  }
  const additions = selected.filter(
    (i) => !group?.members.some((m) => sameGroupName(m.name, i.name)),
  );
  async function add() {
    if (!group) return;
    await run({
      action: "ADD_MEMBERS",
      groupId: group.id,
      revision: group.revision,
      itemIds: additions.map((i) => i.id),
      since: limaToday(),
    });
  }
  function random(category?: string) {
    const proposed = category
      ? randomCategoryAdditions(free, category, count)
      : randomInventoryAdditions(free, count);
    onSelectNames(proposed.map((i) => i.name));
    setMessage(
      proposed.length
        ? `${proposed.length} diplomados preparados. Pulsa Agregar para ${group ? "añadirlos" : "crear el grupo"}.`
        : "No hay diplomados libres con ese filtro.",
    );
  }
  const column = replacement?.column || defaultColumn;
  const sources = replacement?.names ?? selectedNames;
  function prepare(names = sources) {
    if (!column) {
      setMessage("Elige primero el país que vas a reemplazar.");
      return;
    }
    if (!names.length) {
      setMessage("Marca diplomados en la lista o búscalos aquí.");
      return;
    }
    onReplacementChange({ column, names: [...new Set(names)] });
  }
  const visibleFree=free.filter(i=>(!category||[...i.primaryNames,...(i.secondaryNames??[])].some(c=>categoryKey(c)===categoryKey(category)))&&categoryKey(i.name).includes(categoryKey(query)));
  return (
    <section
      className="inventory-inline-groups inventory-group-workbench"
      aria-label="Grupos integrados"
    >
      <div ref={controls} className="inventory-group-compact-actions"><button type="button" disabled={!directory.canEdit} onClick={()=>{setCreating(true);setDraftName(suggestions[0]);setCategory("");setQuery("");setLimit(50);setMessage("");onSelectNames(selectedNames.filter(n=>!membership.has(categoryKey(n))));creationDialog.current?.showModal()}}>+ Crear grupo</button><button type="button" popoverTarget={replacementId} onClick={()=>positionReplacement()}>Por reemplazar{replacement?.names.length?` (${replacement.names.length})`:""}</button></div>
      <dialog ref={creationDialog} className="trial-dialog inventory-create-group-dialog" aria-label="Crear grupo con diplomados sin grupo" onCancel={()=>setCreating(false)}><header><h2>Crear grupo</h2><button type="button" aria-label="Cerrar crear grupo" onClick={()=>{creationDialog.current?.close();setCreating(false)}}>×</button></header>
      <div className="inventory-workbench-line" aria-label="Crear grupo">
        <strong>Crear grupo</strong>
        <input
          aria-label="Título del grupo"
          className="inventory-group-name"
          list={nameList}
          value={name}
          maxLength={100}
          onChange={(e) => {
            setDraftName(e.target.value);
            requestId.current = null;
          }}
        />
        <datalist id={nameList}>
          {suggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <SheetSearchSelect
          label="Añadir diplomado al grupo"
          value=""
          placeholder="Buscar diplomado…"
          options={free.filter(i=>!category||[...i.primaryNames,...(i.secondaryNames??[])].some(c=>categoryKey(c)===categoryKey(category))).map((i) => ({ value: i.id, label: i.name }))}
          disabled={busy || !directory.canEdit}
          onSelect={(id) => {
            const item = directory.catalog.find((i) => i.id === id);
            if (item)
              onSelectNames([...new Set([...selectedNames, item.name])]);
          }}
        />
        <SheetSearchSelect
          label="Categoría para crear grupo"
          value={category}
          placeholder="Por categoría"
          options={[
            { value: "", label: `Todas las categorías (${free.length})` },
            ...categoryOptions.map((c) => ({ value: c, label: `${c} (${freeCategoryCounts.get(categoryKey(c))??0})` })),
          ]}
          disabled={busy}
          onSelect={(c) => {
            setCategory(c);
            setLimit(50);
          }}
        />
        <label className="inventory-random-count">
          Cantidad
          <input
            type="number"
            aria-label="Cantidad de diplomados al azar"
            min={1}
            max={100}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
            }
          />
        </label>
        <button
          type="button"
          disabled={busy || !directory.canEdit}
          onClick={() => random()}
        >
          Azar
        </button>
        <button
          type="button"
          disabled={busy || !directory.canEdit || !category}
          onClick={() => random(category)}
        >
          Azar por categoría
        </button>
        <InventoryMultiSelect
          label="Países del nuevo grupo"
          placeholder="Países"
          values={countryChoice ?? countries.map((c) => c.code)}
          options={countries.map((c) => ({ value: c.code, label: c.name }))}
          onChange={setCountryChoice}
          disabled={busy}
        />
        <small>{selected.length} seleccionados</small>
        {!!group && (
          <InventoryActionMenu label="Acciones del grupo">
            <button
              type="button"
              disabled={busy || !selected.length || !directory.canEdit}
              onClick={() =>
                void run({
                  action: "MEMBERS",
                  groupId: group.id,
                  revision: group.revision,
                  itemIds: group.members
                    .filter(
                      (m) =>
                        !selectedNames.some((n) => sameGroupName(n, m.name)),
                    )
                    .map((m) => m.itemId),
                  since: limaToday(),
                })
              }
            >
              Quitar seleccionados del grupo
            </button>
          </InventoryActionMenu>
        )}
      </div>
      {!!selectedNames.length && (
        <div
          className="inventory-workbench-selected"
          aria-label="Diplomados seleccionados para grupo"
        >
          {selectedNames.map((n) => (
            <span key={n}>
              {n}
              <button
                type="button"
                aria-label={"Quitar selección de " + n}
                onClick={() =>
                  onSelectNames(selectedNames.filter((v) => v !== n))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="inventory-free-diplomas"><label>Buscar entre diplomados sin grupo<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(50)}}/></label><small>{visibleFree.length} diplomados sin grupo · {selected.length} seleccionados</small><div className="inventory-free-diploma-list">{visibleFree.slice(0,limit).map(item=><label key={item.id}><input type="checkbox" aria-label={'Incluir sin grupo '+item.name} checked={selectedNames.includes(item.name)} onChange={e=>onSelectNames(e.target.checked?[...new Set([...selectedNames,item.name])]:selectedNames.filter(n=>n!==item.name))}/>{item.name}</label>)}</div>{visibleFree.length>limit&&<button type="button" onClick={()=>setLimit(n=>n+50)}>Mostrar50más</button>}</div>{message&&<p role="status">{message}</p>}<footer><button type="button" className="primary" disabled={busy||!directory.canEdit||!selected.length} onClick={()=>void create(name)}>Crear grupo ({selected.length})</button></footer>
      </dialog>
      <div ref={replacePanel} id={replacementId} popover="auto" className="inventory-replace-compact-popover"><header><strong>Reemplazar en un país</strong><button type="button" aria-label="Cerrar reemplazos" onClick={()=>replacePanel.current?.hidePopover()}>×</button></header>
      <div
        className="inventory-workbench-line inventory-workbench-replace"
        aria-label="Por reemplazar"
      >
        <strong>Por reemplazar</strong>
        <select
          aria-label="País para reemplazar"
          value={column}
          onChange={(e) =>
            onReplacementChange(
              e.target.value
                ? { column: e.target.value, names: sources }
                : null,
            )
          }
        >
          <option value="">Elige país…</option>
          {replacementColumns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <SheetSearchSelect
          label="Diplomado por reemplazar"
          value=""
          placeholder="Buscar diplomado saliente…"
          options={directory.catalog
            .filter((i) => !sources.some((n) => sameGroupName(n, i.name)))
            .map((i) => ({ value: i.id, label: i.name }))}
          disabled={busy || !directory.canEdit}
          onSelect={(id) => {
            const item = directory.catalog.find((i) => i.id === id);
            if (item) prepare([...sources, item.name]);
          }}
        />
        <span className="inventory-inline-selection">
          {sources.length} seleccionados
        </span>
        <button
          type="button"
          className="primary"
          disabled={busy || !directory.canEdit || !column || !sources.length}
          onClick={() =>
            prepare(selectedNames.length ? selectedNames : sources)
          }
        >
          Preparar reemplazos
        </button>
        {replacement && (
          <button type="button" onClick={() => onReplacementChange(null)}>
            Limpiar reemplazos
          </button>
        )}
      </div>
      {message && <small role="status">{message}</small>}
      {replacement && replacement.names.length > 0 && (
        <>
          <div
            className="inventory-workbench-selected"
            aria-label="Diplomados por reemplazar"
          >
            {replacement.names.map((n) => (
              <span key={n}>
                {n}
                <button
                  type="button"
                  aria-label={"Quitar reemplazo de " + n}
                  onClick={() =>
                    onReplacementChange({
                      ...replacement,
                      names: replacement.names.filter((v) => v !== n),
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <InventorySheetReplacement
            key={replacement.column}
            listId={directory.listId}
            tableId={replacement.column.split(":")[0]}
            country={replacement.column.split(":")[1]}
            name={replacement.names[0]}
            names={replacement.names}
            directoryOverride={directory}
            source="meta"
            sheetName={
              replacementColumns.find((c) => c.id === replacement.column)
                ?.label ?? ""
            }
            since=""
            until=""
            onClose={() => {onReplacementChange(null);replacePanel.current?.hidePopover()}}
            onChanged={() => onReplacementApplied(replacement.column)}
          />
        </>
      )}
      </div>
    </section>
  );
}
