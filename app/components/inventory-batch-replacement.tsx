"use client";
import { useState } from "react";
import { SheetSearchSelect } from "./sheet-search-select";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
type Item = TrialDirectory["catalog"][number];
export type ReplacementPlan = {
  from: string;
  to: string;
  mode: "MANUAL" | "SAME" | "OTHER";
};
export function InventoryBatchReplacement({
  origins,
  candidates,
  busy,
  onClose,
  onConfirm,
  onInspect,
}: {
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
  const [error, setError] = useState("");
  const remaining = plan.filter((p) => !p.to).length;
  const available = (index: number) =>
    candidates.filter(
      (i) =>
        !plan.some(
          (p, n) => n !== index && categoryKey(p.to) === categoryKey(i.name),
        ),
    );
  function propose(same: boolean) {
    // Work locally: no campaign changes until the entire plan is confirmed.
    const used = new Set<string>();
    const next = origins.map((i) => {
      const pool = candidates.filter(
        (c) =>
          !used.has(categoryKey(c.name)) &&
          (same
            ? c.primaryIds.some((id) => i.primaryIds.includes(id))
            : c.primaryIds.length > 0 &&
              !c.primaryIds.some((id) => i.primaryIds.includes(id))),
      );
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      if (chosen) used.add(categoryKey(chosen.name));
      return {
        from: i.name,
        to: chosen?.name ?? "",
        mode: same ? ("SAME" as const) : ("OTHER" as const),
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
      <div className="row">
        <button type="button" disabled={busy} onClick={() => propose(true)}>
          Azar · misma categoría
        </button>
        <button type="button" disabled={busy} onClick={() => propose(false)}>
          Azar · otras categorías
        </button>
        <small>Revisa o cambia cualquier propuesta antes de confirmar.</small>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="inventory-batch-list">
        {plan.map((p, index) => (
          <div className="inventory-batch-pair" key={p.from}>
            <span>
              <small>Por desactivar</small>
              <strong>{p.from}</strong>
            </span>
            <b aria-hidden="true">→</b>
            <label>
              <span>Nuevo · por hacer campaña</span>
              <SheetSearchSelect
                label={`Reemplazo de ${p.from}`}
                value={p.to}
                placeholder="Busca un diplomado…"
                options={available(index).map((i) => ({
                  value: i.name,
                  label: i.name,
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
              Ver antecedentes ↗
            </button>
          </div>
        ))}
      </div>
      <footer>
        <small>
          El anterior quedará por desactivar; el nuevo, por hacer campaña. Los
          datos se conservan.
        </small>
        <button
          type="button"
          className="primary"
          disabled={busy || !!remaining}
          onClick={() => void onConfirm(plan)}
        >
          {busy
            ? "Guardando…"
            : `Confirmar ${plan.length === 1 ? "reemplazo" : plan.length + " reemplazos"}`}
        </button>
      </footer>
    </section>
  );
}
