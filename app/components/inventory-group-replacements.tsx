"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { groupAvailabilityLabels } from "../../lib/meta-ads/inventory-group-availability";
import { financialRequest as api } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";
import type {
  TrialDirectory,
  TrialGroup,
} from "../../lib/meta-ads/inventory-trials";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import {
  proposeGroupReplacements,
  type GroupReplacementMode,
} from "../../lib/meta-ads/inventory-group-replacement-policy";
import { limaToday } from "./date-range";
export function InventoryGroupReplacements({
  directory,
  group,
  itemIds,
  initialMode = "ANY",
  onClose,
  onApplied,
  onInspect,
}: {
  directory: TrialDirectory;
  group: TrialGroup;
  itemIds: string[];
  initialMode?: GroupReplacementMode;
  onClose: () => void;
  onApplied: (group: TrialGroup) => Promise<void>;
  onInspect: (name: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [snapshot] = useState(() => ({ directory, group, itemIds }));
  const [expanded, setExpanded] = useState(false),
    [mode, setMode] = useState<GroupReplacementMode>(initialMode),
    [candidateGroupId, setCandidateGroupId] = useState(""),
    [pairs, setPairs] = useState(() =>
      initialMode === "ANY"
        ? itemIds.map((itemId) => ({ itemId, replacementId: "" }))
        : proposeGroupReplacements(
            directory.catalog.filter((item) => itemIds.includes(item.id)),
            directory.catalog.filter(
              (item) =>
                !group.members.some((member) => member.itemId === item.id),
            ),
            initialMode,
          ),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [committed, setCommitted] = useState(false);
  const groupLabels = useMemo(
    () =>
      groupAvailabilityLabels(
        snapshot.directory,
        snapshot.group.countries.length === 1
          ? snapshot.group.countries[0]
          : "",
      ),
    [snapshot],
  );
  const source = snapshot.group,
    catalog = snapshot.directory.catalog;
  const sources = snapshot.itemIds.flatMap((id) => {
    const item = catalog.find((item) => item.id === id);
    return item ? [item] : [];
  });
  const memberIds = new Set(source.members.map((member) => member.itemId));

  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const groupByItem = new Map(
    snapshot.directory.groups.flatMap((group) =>
      group.members.map((member) => [member.itemId, group] as const),
    ),
  );
  const groupByName = new Map(
    snapshot.directory.groups.flatMap((group) =>
      group.members.map((member) => [categoryKey(member.name), group] as const),
    ),
  );
  const membership = (id: string) =>
    groupByItem.get(id) ??
    groupByName.get(categoryKey(itemById.get(id)?.name ?? ""));
  const candidates = catalog.filter(
    (item) =>
      !memberIds.has(item.id) &&
      (!candidateGroupId || membership(item.id)?.id === candidateGroupId),
  );
  function changeCandidateGroup(id: string) {
    setCandidateGroupId(id);
    setPairs((current) =>
      current.map((pair) => ({
        ...pair,
        replacementId:
          !id || membership(pair.replacementId)?.id === id
            ? pair.replacementId
            : "",
      })),
    );
    setMode("ANY");
    setError("");
  }
  const ready =
    pairs.length > 0 &&
    sources.length === pairs.length &&
    pairs.every((pair) => !!pair.replacementId) &&
    new Set(pairs.map((pair) => pair.replacementId)).size === pairs.length;
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  function propose(next: GroupReplacementMode) {
    setMode(next);
    const proposal = proposeGroupReplacements(sources, candidates, next);
    setPairs(proposal);
    setError(
      proposal.some((pair) => !pair.replacementId)
        ? "No hay suficientes sustitutos con esa condición. Cambia la propuesta o elige los faltantes."
        : "",
    );
  }
  async function apply() {
    if (!ready || pending.current || committed) return;
    pending.current = true;
    setBusy(true);
    setError("");
    let saved = false;
    try {
      const replacements = pairs.map((pair) => ({
        ...pair,
        replacementGroupId: membership(pair.replacementId)?.id ?? null,
      }));
      const ids = new Set([
        source.id,
        ...replacements.flatMap((pair) =>
          pair.replacementGroupId ? [pair.replacementGroupId] : [],
        ),
      ]);
      const result: TrialGroup = await api(
        "meta-ads/inventory/trials",
        "POST",
        {
          action: "REPLACE_MEMBERS",
          listId: snapshot.directory.listId,
          groupId: source.id,
          groups: snapshot.directory.groups
            .filter((group) => ids.has(group.id))
            .map((group) => ({ groupId: group.id, revision: group.revision })),
          pairs: replacements,
          mode,
          since: limaToday(),
        },
      );
      saved = true;
      setCommitted(true);
      await onApplied(result);
    } catch (error) {
      setError(
        (saved ? "Reemplazos guardados. Actualiza la vista. " : "") +
          (error instanceof Error ? error.message : "No se pudo aprobar.") +
          ((error as { status?: number }).status === 409
            ? " Cierra este cuadro y actualiza los grupos antes de revisar otra propuesta."
            : ""),
      );
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  const single = pairs.length === 1;
  const remaining = pairs.filter((pair) => !pair.replacementId).length;
  function picker(pair: (typeof pairs)[number]) {
    const old = itemById.get(pair.itemId);
    return (
      <SheetSearchSelect
        label={`Sustituto de ${old?.name ?? pair.itemId}`}
        value={pair.replacementId}
        placeholder="Busca el reemplazo…"
        disabled={busy || committed}
        options={candidates
          .filter(
            (item) =>
              item.id === pair.replacementId ||
              !pairs.some((other) => other.replacementId === item.id),
          )
          .map((item) => ({
            value: item.id,
            label:
              item.name + " · " + (membership(item.id)?.name ?? "Sin grupo"),
          }))}
        onSelect={(id) => {
          setPairs((current) =>
            current.map((entry) =>
              entry.itemId === pair.itemId
                ? { ...entry, replacementId: id }
                : entry,
            ),
          );
          setMode("ANY");
          setError("");
        }}
      />
    );
  }
  const confirmButton = !committed && (
    <button
      type="button"
      className="primary"
      disabled={busy || !ready}
      onClick={() => void apply()}
    >
      {busy
        ? "Guardando…"
        : single
          ? "Confirmar reemplazo"
          : `Confirmar ${pairs.length} reemplazos`}
    </button>
  );
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-group-replacements"
      data-expanded={expanded || undefined}
      data-single={single || undefined}
      aria-label="Revisar reemplazos de grupo"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div className="inventory-group-replacement-heading">
          <span className="inventory-group-replacement-scope">
            Reemplazo en el grupo · {source.name}
          </span>
          <h3>
            {single
              ? `Reemplazar: ${sources[0]?.name ?? "Diplomado"}`
              : `Reemplazar ${pairs.length} diplomados`}
          </h3>
        </div>
        {!single && (
          <span className="inventory-batch-progress" role="status">
            {remaining ? `Te faltan ${remaining}` : "✓ Propuesta completa"}
          </span>
        )}
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Restaurar" : "Maximizar"}
        </button>
        <button
          type="button"
          className="ui-close-button"
          aria-label="Cerrar reemplazos de grupo"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="inventory-group-replacement-modes">
        <label>
          Diplomados de un grupo
          <select
            aria-label="Grupo de los sustitutos"
            value={candidateGroupId}
            disabled={busy || committed}
            onChange={(event) => changeCandidateGroup(event.target.value)}
          >
            <option value="">Todos los grupos</option>
            {snapshot.directory.groups
              .filter((group) => group.id !== source.id)
              .map((group) => (
                <option key={group.id} value={group.id}>
                  {groupLabels.get(group.id) ?? group.name}
                </option>
              ))}
          </select>
        </label>
        {(
          [
            ["ANY", "Al azar"],
            ["SAME", "Azar · misma categoría"],
            ["OTHER", "Azar · otra categoría"],
            ["DIVERSE", "Uno de cada categoría"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            disabled={busy || committed}
            onClick={() => propose(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {single ? (
        <>
          <div className="inventory-group-single-picker">
            {picker(pairs[0])}
            <button
              type="button"
              disabled={busy || !pairs[0].replacementId}
              onClick={() =>
                onInspect(itemById.get(pairs[0].replacementId)!.name)
              }
            >
              Antecedentes
            </button>
            {confirmButton}
          </div>
          {!!pairs[0].replacementId && (
            <p className="inventory-group-swap-summary" role="status">
              Entra desde{" "}
              <strong>
                {membership(pairs[0].replacementId)?.name ?? "Sin grupo"}
              </strong>{" "}
              a <strong>{source.name}</strong>. El saliente{" "}
              {membership(pairs[0].replacementId) ? (
                <>
                  pasa a{" "}
                  <strong>{membership(pairs[0].replacementId)!.name}</strong>.
                </>
              ) : (
                "queda sin grupo."
              )}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="inventory-group-swap-columns" aria-hidden="true">
            <span>Sale de {source.name}</span>
            <span></span>
            <span>Entra a {source.name} · grupo de origen en el selector</span>
            <span></span>
          </div>
          <div className="inventory-group-swap-list">
            {pairs.map((pair) => {
              const old = itemById.get(pair.itemId),
                other = membership(pair.replacementId);
              return (
                <div className="inventory-group-swap-pair" key={pair.itemId}>
                  <div>
                    <strong>{old?.name ?? "No disponible"}</strong>
                    {pair.replacementId && (
                      <small className="inventory-group-swap-destination">
                        → {other?.name ?? "Sin grupo"}
                      </small>
                    )}
                  </div>
                  <span aria-hidden="true">→</span>
                  {picker(pair)}
                  <button
                    type="button"
                    disabled={!pair.replacementId || busy}
                    onClick={() =>
                      onInspect(itemById.get(pair.replacementId)!.name)
                    }
                  >
                    Antecedentes
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <small>
          Solo cambia la pertenencia al grupo. Uso por país, hojas, ventas y
          campañas se conservan.
        </small>
        <button type="button" disabled={busy} onClick={onClose}>
          {committed ? "Cerrar" : "Cancelar"}
        </button>
        {!single && confirmButton}
      </footer>
    </dialog>
  );
}
