"use client";
import { useEffect, useRef, useState } from "react";
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
}: {
  directory: TrialDirectory;
  group: TrialGroup;
  itemIds: string[];
  initialMode?: GroupReplacementMode;
  onClose: () => void;
  onApplied: (group: TrialGroup) => Promise<void>;
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
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-group-replacements"
      data-expanded={expanded || undefined}
      aria-label="Revisar reemplazos de grupo"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h3>
          Reemplazar {pairs.length} diplomados · {source.name}
        </h3>
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
                  {group.name} ({group.members.length})
                </option>
              ))}
          </select>
        </label>
        {(
          [
            ["ANY", "Al azar"],
            ["SAME", "Misma categoría"],
            ["OTHER", "Otra categoría"],
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
      <p>
        Revisa ambos lados antes de aprobar. Si el sustituto tiene grupo, se
        intercambian; si no tiene, el saliente queda sin grupo. El uso por país,
        las hojas, ventas y vínculos siguen a cada diplomado.
      </p>
      <div className="inventory-group-replacement-preview">
        <table>
          <thead>
            <tr>
              <th>Sale</th>
              <th>Grupo actual</th>
              <th>Entra</th>
              <th>Grupo actual</th>
              <th>El saliente irá a</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair) => {
              const old = catalog.find((item) => item.id === pair.itemId),
                other = membership(pair.replacementId);
              return (
                <tr key={pair.itemId}>
                  <td>{old?.name ?? "No disponible"}</td>
                  <td>{source.name}</td>
                  <td>
                    <SheetSearchSelect
                      label={`Sustituto de ${old?.name ?? pair.itemId}`}
                      value={pair.replacementId}
                      placeholder="Buscar reemplazo…"
                      disabled={busy || committed}
                      options={candidates
                        .filter(
                          (item) =>
                            item.id === pair.replacementId ||
                            !pairs.some(
                              (other) => other.replacementId === item.id,
                            ),
                        )
                        .map((item) => ({
                          value: item.id,
                          label:
                            item.name +
                            " · " +
                            (membership(item.id)?.name ?? "Sin grupo"),
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
                  </td>
                  <td>{other?.name ?? "Sin grupo"}</td>
                  <td>
                    {pair.replacementId ? (other?.name ?? "Sin grupo") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          {committed ? "Cerrar" : "Cancelar"}
        </button>
        {!committed && (
          <button
            type="button"
            className="primary"
            disabled={busy || !ready}
            onClick={() => void apply()}
          >
            {busy ? "Guardando…" : "Aprobar reemplazos"}
          </button>
        )}
      </footer>
    </dialog>
  );
}
