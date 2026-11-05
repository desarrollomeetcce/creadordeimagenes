"use client";
import { useMemo, useRef, useState } from "react";
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
import dynamic from "next/dynamic";
const InventoryGroupReplacements = dynamic(() =>
  import("./inventory-group-replacements").then(
    (m) => m.InventoryGroupReplacements,
  ),
);
import { InventoryMultiSelect } from "./inventory-multi-select";
import { InventoryActionMenu } from "./inventory-action-menu";
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
}) {
  const pending = useRef(false),
    requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [draftName, setDraftName] = useState(""),
    [count, setCount] = useState(10),
    [countryChoice, setCountryChoice] = useState<string[] | null>(null),
    [replacing, setReplacing] = useState(false);
  const group = directory.groups.find((g) => g.id === groupId);
  const suggestions = useMemo(
    () => suggestedGroupNames(directory.groups.map((g) => g.name)),
    [directory.groups],
  );
  const name = draftName || suggestions[0];
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
  const selectedGroups = [
    ...new Set(
      selectedNames
        .map((n) => membership.get(categoryKey(n)))
        .filter((g): g is TrialGroup => !!g),
    ),
  ];
  const replaceGroup =
    selectedGroups.length === 1 ? selectedGroups[0] : undefined;
  const replaceIds =
    replaceGroup?.members
      .filter((m) => selectedNames.some((n) => sameGroupName(n, m.name)))
      .map((m) => m.itemId) ?? [];
  const free = useMemo(
    () => directory.catalog.filter((i) => !membership.has(categoryKey(i.name))),
    [directory.catalog, membership],
  );
  const categoryOptions = useMemo(
    () =>
      [
        ...new Set(
          free.flatMap((i) => [...i.primaryNames, ...(i.secondaryNames ?? [])]),
        ),
      ].sort((a, b) => a.localeCompare(b, "es")),
    [free],
  );
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
    if (next.length > 100 || !next.trim()) {
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
      setMessage("Marca los diplomados y pulsa + para crear " + next + ".");
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
      setDraftName("");
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
        ? `${proposed.length} diplomados preparados. Pulsa + para ${group ? "añadirlos" : "crear el grupo"}.`
        : "No hay diplomados libres con ese filtro.",
    );
  }
  return (
    <section className="inventory-inline-groups" aria-label="Grupos integrados">
      <div className="inventory-inline-group-main">
        <strong>Grupos</strong>
        <SheetSearchSelect
          label="Mis grupos"
          value={group?.id ?? (groupId === "none" ? "none" : "new:" + name)}
          placeholder={name}
          options={[
            { value: "", label: "Todo el inventario" },
            { value: "none", label: "Sin grupo" },
            ...directory.groups.map((g) => ({
              value: g.id,
              label: `${g.name} (${g.members.length})`,
              group: "Mis grupos",
            })),
            ...suggestions.map((n) => ({
              value: "new:" + n,
              label: n + " · crear",
              group: "Nuevo grupo",
            })),
            ...(draftName && !suggestions.includes(draftName)
              ? [
                  {
                    value: "new:" + draftName,
                    label: draftName + " · crear",
                    group: "Nuevo grupo",
                  },
                ]
              : []),
          ]}
          disabled={busy}
          onSelect={(id) => {
            setMessage("");
            if (id.startsWith("new:")) {
              setDraftName(id.slice(4));
              onGroupSelect("");
            } else {
              setDraftName("");
              onGroupSelect(id);
            }
          }}
          onCreate={create}
          createLabel="Crear grupo"
          createOnEnter
          onError={setMessage}
        />
        <button
          type="button"
          className="primary inventory-group-plus"
          aria-label={group ? "Añadir seleccionados al grupo" : "Crear " + name}
          title={
            group ? "Añadir seleccionados a " + group.name : "Crear " + name
          }
          disabled={
            busy ||
            !directory.canEdit ||
            !selected.length ||
            (!!group && !additions.length)
          }
          onClick={() => void (group ? add() : create(name))}
        >
          +
        </button>
        <span
          className="inventory-inline-selection"
          title={selectedNames.join(", ")}
        >
          {selected.length} seleccionados
        </span>
        {!group && (
          <InventoryMultiSelect
            label="Países del nuevo grupo"
            placeholder="Países"
            values={countryChoice ?? countries.map((c) => c.code)}
            options={countries.map((c) => ({ value: c.code, label: c.name }))}
            onChange={setCountryChoice}
            disabled={busy}
          />
        )}
      </div>
      <div className="inventory-inline-group-tools">
        <SheetSearchSelect
          label="Añadir diplomado al grupo"
          value=""
          placeholder="Buscar diplomado…"
          options={free.map((i) => ({ value: i.id, label: i.name }))}
          disabled={busy || !directory.canEdit}
          onSelect={(id) => {
            const item = directory.catalog.find((i) => i.id === id);
            if (item)
              onSelectNames([...new Set([...selectedNames, item.name])]);
          }}
        />
        <button
          type="button"
          disabled={busy || !directory.canEdit}
          onClick={() => random()}
        >
          Al azar
        </button>
        <SheetSearchSelect
          label="Al azar por categoría"
          value=""
          placeholder="Al azar por categoría"
          options={categoryOptions.map((c) => ({ value: c, label: c }))}
          disabled={busy || !directory.canEdit}
          onSelect={(category) => random(category)}
        />
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
        {replaceGroup && !!replaceIds.length && (
          <button
            type="button"
            disabled={busy || !directory.canEdit}
            onClick={() => setReplacing(true)}
          >
            Reemplazar en grupo
          </button>
        )}
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
            {selected.length === 1 &&
              directory.groups
                .filter(
                  (g) =>
                    g.id !== membership.get(categoryKey(selected[0].name))?.id,
                )
                .map((target) => (
                  <button
                    type="button"
                    key={target.id}
                    disabled={
                      busy ||
                      !membership.has(categoryKey(selected[0].name)) ||
                      !directory.canEdit
                    }
                    onClick={() => {
                      const source = membership.get(
                        categoryKey(selected[0].name),
                      )!;
                      const member = source.members.find((m) =>
                        sameGroupName(m.name, selected[0].name),
                      )!;
                      void run(
                        {
                          action: "MOVE_MEMBER",
                          groupId: source.id,
                          revision: source.revision,
                          itemId: member.itemId,
                          targetGroupId: target.id,
                          targetRevision: target.revision,
                          since: limaToday(),
                        },
                        true,
                      );
                    }}
                  >
                    Mover a {target.name}
                  </button>
                ))}
          </InventoryActionMenu>
        )}
      </div>
      {message && <small role="status">{message}</small>}
      {replacing && replaceGroup && (
        <InventoryGroupReplacements
          directory={directory}
          group={replaceGroup}
          itemIds={replaceIds}
          onClose={() => setReplacing(false)}
          onInspect={onInspect}
          onApplied={async () => {
            await onReload();
            onSelectNames([]);
            setReplacing(false);
          }}
        />
      )}
    </section>
  );
}
