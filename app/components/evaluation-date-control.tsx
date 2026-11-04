"use client";
import { useWorkbookPreference } from "./use-workbook-preference";
import { useId, useRef, useState } from "react";
import { MetaAnalysisPeriod } from "./meta-analysis-period";
import { quickRange, reportToday } from "../../lib/meta-ads/date-range";
export type EvaluationPeriod = { value: string; since: string; until: string };
export const defaultEvaluationPeriod: EvaluationPeriod = {
  value: "14",
  since: "",
  until: "",
};
export function evaluationRange(period: EvaluationPeriod) {
  if (period.value === "lifetime") return { fromActivation: true };
  const [since, until] =
    period.value === "custom"
      ? [period.since, period.until]
      : quickRange(period.value, reportToday());
  return { since, until };
}
export function EvaluationDateControl({
  period,
  onChange,
}: {
  period: EvaluationPeriod;
  onChange: (value: EvaluationPeriod) => void;
}) {
  return (
    <MetaAnalysisPeriod
      label="Evaluar por fecha"
      lifetimeLabel="Desde la activación"
      value={period.value}
      since={period.since}
      until={period.until}
      onPreset={(value, range) =>
        onChange({
          value: ["today", "7", "14", "15", "30", "lifetime"].includes(value)
            ? value
            : "custom",
          since: range?.[0] ?? "",
          until: range?.[1] ?? "",
        })
      }
      onRange={(since, until) => onChange({ value: "custom", since, until })}
    />
  );
}
export function EvaluationOrderControl({
  period,
  onChange,
  onOrder,
}: {
  period: EvaluationPeriod;
  onChange: (value: EvaluationPeriod) => void;
  onOrder: (criticalFirst: boolean) => void;
}) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="evaluation-date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          const element = menu.current;
          if (!element) return;
          const rect = e.currentTarget.getBoundingClientRect();
          element.style.left = `clamp(8px, ${rect.right - 280}px, calc(100vw - 288px))`;
          element.style.top = `clamp(8px, ${rect.bottom + 4}px, calc(100vh - 210px))`;
          element.togglePopover();
        }}
      >
        Evaluar ▾
      </button>
      <div
        id={id}
        ref={menu}
        popover="auto"
        className="evaluation-date-menu"
        role="dialog"
        aria-label="Orden y fechas de evaluación"
        onToggle={(e) => {
          if (e.target === e.currentTarget) setOpen(e.newState === "open");
        }}
      >
        <div className="evaluation-date-directions">
          <button type="button" onClick={() => onOrder(true)}>
            Crítico → Normal
          </button>
          <button type="button" onClick={() => onOrder(false)}>
            Normal → Crítico
          </button>
        </div>
        <EvaluationDateControl period={period} onChange={onChange} />
      </div>
    </>
  );
}

export function useEvaluationPeriod(resourceId: string) {
  const [stored, setStored] = useWorkbookPreference<string[]>(
    resourceId,
    "evaluation-period",
    ["14", "", ""],
  );
  const valid =
    Array.isArray(stored) &&
    ["today", "7", "14", "15", "30", "lifetime", "custom"].includes(stored[0]);
  const period = valid
    ? { value: stored[0], since: stored[1] ?? "", until: stored[2] ?? "" }
    : defaultEvaluationPeriod;
  return [
    period,
    (next: EvaluationPeriod) => setStored([next.value, next.since, next.until]),
  ] as const;
}
