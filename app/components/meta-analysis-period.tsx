"use client";
import { useEffect, useId, useRef, useState } from "react";
const periods = [
  ["today", "Hoy"],
  ["7", "7 días"],
  ["15", "15 días"],
  ["30", "30 días"],
  ["lifetime", "Desde el inicio"],
];
export function MetaAnalysisPeriod({
  value,
  since,
  until,
  onPreset,
  onRange,
}: {
  value: string;
  since: string;
  until: string;
  onPreset: (value: string) => void;
  onRange: (since: string, until: string) => void;
}) {
  const id = useId(),
    ref = useRef<HTMLDialogElement>(null),
    [open, setOpen] = useState(false),
    [start, setStart] = useState(since),
    [end, setEnd] = useState(until);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  const edit = () => {
    setStart(since);
    setEnd(until);
    setOpen(true);
  };
  return (
    <div className="meta-analysis-period">
      <label htmlFor={id}>Periodo de análisis</label>
      <div className="meta-period-picker">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            if (e.target.value === "custom") edit();
            else onPreset(e.target.value);
          }}
        >
          {periods.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
          <option value="custom">Calendario…</option>
        </select>
        {value === "custom" && (
          <button
            type="button"
            title={`${since} → ${until}`}
            aria-label="Editar fechas del calendario"
            onClick={edit}
          >
            ▦
          </button>
        )}
      </div>
      <dialog
        ref={ref}
        className="meta-period-dialog"
        onCancel={() => setOpen(false)}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            setOpen(false);
        }}
        aria-labelledby={`${id}-title`}
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            onRange(start, end);
            setOpen(false);
          }}
        >
          <h3 id={`${id}-title`}>Periodo de análisis · Calendario</h3>
          <div className="fields">
            <label>
              Desde
              <input
                type="date"
                required
                value={start}
                max={end || undefined}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                required
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <div className="row">
            <button type="submit" className="primary">
              Aplicar fechas
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
