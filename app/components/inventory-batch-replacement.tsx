"use client";
import { useEffect, useState } from "react";
import { SheetSearchSelect } from "./sheet-search-select";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import { InventoryReplacementGroupFilter } from "./inventory-replacement-group-filter";
import {
  groupReplacementCandidates,
  replacementUsage,
  replacementUsageLabel,
  type ReplacementUsageFilter,
} from "../../lib/meta-ads/inventory-replacement-groups";
type Item = TrialDirectory["catalog"][number];
export type ReplacementPlan = {
  from: string;
  to: string;
  mode: "MANUAL" | "SAME" | "OTHER";
  pauseNow?: boolean;
};
export function InventoryBatchReplacement({
  origins,
  candidates,
  directory,
  country,
  busy,
  onClose,
  onConfirm,
  onInspect,
  onUsageNeeded,
  canConfirm = true,
  metaActions = false,
  onConfirmAndAds,
}: {
  onUsageNeeded?: () => void;
  metaActions?: boolean;
  onConfirmAndAds?: (plan: ReplacementPlan[]) => Promise<void>;
  canConfirm?: boolean;
  directory: TrialDirectory;
  country: string;
  origins: Item[];
  candidates: Item[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (plan: ReplacementPlan[]) => Promise<void>;
  onInspect: (name: string) => void;
}) {
  const [plan, setPlan] = useState<ReplacementPlan[]>(() =>
    origins.map((i) => ({ from: i.name, to: "", mode: "MANUAL" })),
  );
  const originKey = JSON.stringify(origins.map((i) => i.name));
  useEffect(() => {
    setPlan((previous) =>
      origins.map((i) => {
        const old = previous.find(
          (p) => categoryKey(p.from) === categoryKey(i.name),
        );
        return old
          ? {
              ...old,
              to: origins.some(
                (o) => categoryKey(o.name) === categoryKey(old.to),
              )
                ? ""
                : old.to,
            }
          : { from: i.name, to: "", mode: "MANUAL" };
      }),
    );
  }, [originKey]);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const categories = [
    ...new Set(
      candidates.flatMap((i) => [
        ...i.primaryNames,
        ...(i.secondaryNames ?? []),
      ]),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const [groupId, setGroupId] = useState("");
  const [usage, setUsage] = useState<ReplacementUsageFilter>("ALL");
  const filteredCandidates = groupReplacementCandidates(
    candidates.filter(
      (i) =>
        !category ||
        [...i.primaryNames, ...(i.secondaryNames ?? [])].some(
          (c) => categoryKey(c) === categoryKey(category),
        ),
    ),
    directory,
    country,
    groupId,
    usage,
  );
  const remaining = plan.filter((p) => !p.to).length;
  const available = (index: number) =>
    filteredCandidates.filter(
      (i) =>
        !plan.some(
          (p, n) => n !== index && categoryKey(p.to) === categoryKey(i.name),
        ),
    );
  function propose(same: boolean | null) {
    // Work locally: no campaign changes until the entire plan is confirmed.
    const used = new Set<string>();
    const next = origins.map((i) => {
      const pool = filteredCandidates.filter(
        (c) =>
          !used.has(categoryKey(c.name)) &&
          (same === null ||
            (same
              ? c.primaryIds.some((id) => i.primaryIds.includes(id))
              : c.primaryIds.length > 0 &&
                !c.primaryIds.some((id) => i.primaryIds.includes(id)))),
      );
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      if (chosen) used.add(categoryKey(chosen.name));
      return {
        from: i.name,
        pauseNow: plan.find((p) => p.from === i.name)?.pauseNow,
        to: chosen?.name ?? "",
        mode:
          same === null
            ? ("MANUAL" as const)
            : same
              ? ("SAME" as const)
              : ("OTHER" as const),
      };
    });
    setPlan(next);
    setError(
      next.some((p) => !p.to)
        ? "No hay suficientes candidatos para completar este criterio. Completa los espacios manualmente."
        : "",
    );
  }
  return (
    <section
      className="inventory-top-replacement inventory-batch-plan"
      aria-label="Revisar reemplazos seleccionados"
    >
      <header>
        <div>
          <strong>Reemplazar {plan.length} diplomados</strong>
          <span className="inventory-batch-progress" role="status">
            {remaining ? `Te faltan ${remaining}` : "✓ Propuesta completa"}
          </span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Cancelar propuesta de reemplazos"
        >
          ×
        </button>
      </header>
      <div className="inventory-batch-toolbar">
        <InventoryReplacementGroupFilter
          directory={directory}
          onUsageNeeded={onUsageNeeded}
          country={country}
          groupId={groupId}
          usage={usage}
          busy={busy}
          onChange={(id, filter) => {
            setGroupId(id);
            setUsage(filter);
            setPlan((current) =>
              current.map((p) => ({ ...p, to: "", mode: "MANUAL" })),
            );
            setError("");
          }}
        />
        <SheetSearchSelect
          label="Categoría de los reemplazos"
          value={category}
          placeholder="Por categoría"
          options={[
            { value: "", label: "Todas las categorías" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          disabled={busy}
          onSelect={(value) => {
            setCategory(value);
            setPlan((current) =>
              current.map((p) => ({ ...p, to: "", mode: "MANUAL" })),
            );
          }}
        />
        <div className="row">
          <button type="button" disabled={busy} onClick={() => propose(null)}>
            {category ? "Azar por categoría" : "Al azar"}
          </button>
          <button type="button" disabled={busy} onClick={() => propose(true)}>
            Azar · misma categoría
          </button>
          <button type="button" disabled={busy} onClick={() => propose(false)}>
            Azar · otras categorías
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="inventory-batch-column-headings" aria-hidden="true">
        <span title="Pendiente interno: Meta aún no ha confirmado ninguna pausa">
          Sale · pausa pendiente
        </span>
        <span></span>
        <span>Entra · por hacer campaña</span>
        <span></span>
      </div>
      <div className="inventory-batch-list">
        {plan.map((p, index) => (
          <div className="inventory-batch-pair" key={p.from}>
            <span>
              <strong>{p.from}</strong>
              {metaActions && (
                <select
                  aria-label={`Acción de ${p.from}`}
                  disabled={busy}
                  value={p.pauseNow ? "NOW" : "PENDING"}
                  onChange={(e) =>
                    setPlan((current) =>
                      current.map((v, n) =>
                        n === index
                          ? { ...v, pauseNow: e.target.value === "NOW" }
                          : v,
                      ),
                    )
                  }
                >
                  <option value="PENDING">Dejar pendiente (interno)</option>
                  <option value="NOW">Pausar ahora en Meta</option>
                </select>
              )}
            </span>
            <b aria-hidden="true">→</b>
            <label>
              <SheetSearchSelect
                label={`Reemplazo de ${p.from}`}
                value={p.to}
                placeholder="Busca un diplomado…"
                options={available(index).map((i) => ({
                  value: i.name,
                  label:
                    i.name +
                    " · " +
                    (directory.usageReady === false
                      ? "Uso por consultar"
                      : replacementUsageLabel(
                          replacementUsage(directory, i.name, country),
                        )),
                }))}
                disabled={busy}
                onSelect={(to) => {
                  setPlan((current) =>
                    current.map((v, n) =>
                      n === index ? { ...v, to, mode: "MANUAL" } : v,
                    ),
                  );
                  setError("");
                }}
              />
            </label>
            <button
              type="button"
              disabled={!p.to || busy}
              onClick={() => onInspect(p.to)}
            >
              Antecedentes
            </button>
          </div>
        ))}
      </div>
      <footer>
        <small>
          {metaActions && plan.some((p) => p.pauseNow)
            ? "Se solicitará la pausa en Meta de los que marques; los demás quedan pendientes internos."
            : "Pendiente es una tarea interna: no pausa anuncios en Meta."}{" "}
          El nuevo queda por hacer campaña; tus registros se conservan.
        </small>
        <button
          type="button"
          className="primary"
          disabled={busy || !!remaining || !canConfirm}
          onClick={() => void onConfirm(plan)}
        >
          {busy
            ? "Guardando…"
            : metaActions
              ? "Reemplazar"
              : `Confirmar ${plan.length === 1 ? "reemplazo" : plan.length + " reemplazos"}`}
        </button>
        {onConfirmAndAds && (
          <button
            type="button"
            className="primary"
            disabled={busy || !!remaining || !canConfirm}
            onClick={() => void onConfirmAndAds(plan)}
          >
            Reemplazar + anuncios ↗
          </button>
        )}
      </footer>
    </section>
  );
}
