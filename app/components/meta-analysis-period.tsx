"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  monthDate,
  quickRange,
  reportToday,
  shiftDate,
} from "../../lib/meta-ads/date-range";
const presets = [
  ["today", "Hoy"],
  ["yesterday", "Ayer"],
  ["two", "Hoy y ayer"],
  ["7", "Últimos 7 días"],
  ["14", "Últimos 14 días"],
  ["15", "Últimos 15 días"],
  ["28", "Últimos 28 días"],
  ["30", "Últimos 30 días"],
  ["week", "Esta semana"],
  ["lastweek", "La semana pasada"],
  ["month", "Este mes"],
  ["lastmonth", "El mes pasado"],
  ["lifetime", "Desde el inicio"],
];
const labelDate = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [month, setMonth] = useState("2026-01-01"),
    [preset, setPreset] = useState(""),
    [pickingEnd, setPickingEnd] = useState(false);
  const today = reportToday();
  useEffect(() => {
    if (open) ref.current?.showModal();
    else if (ref.current?.open) {
      ref.current.close();
      trigger.current?.focus();
    }
  }, [open]);
  const edit = () => {
    const range =
      value === "custom" && since && until
        ? [since, until]
        : quickRange(value, today);
    setStart(range[0]);
    setEnd(range[1]);
    setMonth(monthDate(range[0]));
    setPreset(value === "custom" ? "" : value);
    setPickingEnd(false);
    setOpen(true);
  };
  const choose = (key: string) => {
    const [a, b] = quickRange(key, today);
    setStart(a);
    setEnd(b);
    setPreset(key);
    setMonth(monthDate(a));
    setPickingEnd(false);
  };
  const pickDay = (day: string) => {
    setPreset("");
    if (!pickingEnd) {
      setStart(day);
      setEnd(day);
      setPickingEnd(true);
    } else {
      const a = day < start ? day : start,
        b = day < start ? start : day;
      setStart(a);
      setEnd(b);
      setPickingEnd(false);
    }
  };
  const renderMonth = (offset: number) => {
    const first = monthDate(month, offset),
      d = new Date(first + "T12:00:00Z"),
      pad = (d.getUTCDay() + 6) % 7,
      count = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate();
    return (
      <section
        className="meta-range-month"
        key={first}
        aria-label={d.toLocaleDateString("es-PE", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })}
      >
        <div className="meta-range-month-title">
          <select
            aria-label={`Mes del calendario ${offset + 1}`}
            value={d.getUTCMonth()}
            onChange={(e) =>
              setMonth(
                monthDate(
                  `${d.getUTCFullYear()}-${String(Number(e.target.value) + 1).padStart(2, "0")}-01`,
                  -offset,
                ),
              )
            }
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>
                {new Date(Date.UTC(2026, i, 1)).toLocaleDateString("es-PE", {
                  month: "long",
                  timeZone: "UTC",
                })}
              </option>
            ))}
          </select>
          <select
            aria-label={`Año del calendario ${offset + 1}`}
            value={d.getUTCFullYear()}
            onChange={(e) =>
              setMonth(
                monthDate(
                  `${e.target.value}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`,
                  -offset,
                ),
              )
            }
          >
            {Array.from(
              { length: new Date().getUTCFullYear() - 2003 },
              (_, i) => 2004 + i,
            )
              .concat(d.getUTCFullYear())
              .filter((v, i, a) => a.indexOf(v) === i)
              .sort((a, b) => a - b)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
          </select>
        </div>
        <div className="meta-range-grid">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((w) => (
            <span key={w}>{w}</span>
          ))}
          {Array.from({ length: pad }, (_, i) => (
            <span key={"pad" + i} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const day = shiftDate(first, i),
              selected = day >= start && day <= end;
            return (
              <button
                type="button"
                key={day}
                data-day={day}
                aria-label={labelDate(day)}
                aria-pressed={selected}
                disabled={day > today}
                className={
                  (selected ? "in-range " : "") +
                  (day === start || day === end ? "range-edge" : "")
                }
                onClick={() => pickDay(day)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </section>
    );
  };
  return (
    <div className="meta-analysis-period">
      <label id={id + "-label"}>Periodo de análisis</label>
      <button
        type="button"
        ref={trigger}
        className="meta-period-trigger"
        aria-labelledby={id + "-label " + id + "-value"}
        aria-haspopup="dialog"
        onClick={edit}
      >
        <span id={id + "-value"}>
          {value === "custom" && since && until
            ? `${labelDate(since)} – ${labelDate(until)}`
            : (presets.find((p) => p[0] === value)?.[1] ?? "Hoy")}
        </span>
        <span aria-hidden="true"> ▦</span>
      </button>
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
        aria-labelledby={id + "-title"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (["today", "7", "15", "30", "lifetime"].includes(preset))
              onPreset(preset);
            else onRange(start, end);
            setOpen(false);
          }}
        >
          <h3 id={id + "-title"}>Periodo de análisis</h3>
          <div className="meta-range-layout">
            <nav aria-label="Periodos rápidos">
              {presets.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={preset === key}
                  className={preset === key ? "primary" : ""}
                  onClick={() => choose(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="meta-range-main">
              <div className="row spread">
                <button
                  type="button"
                  aria-label="Mes anterior"
                  onClick={() => setMonth(monthDate(month, -1))}
                >
                  ‹
                </button>
                <span>Selecciona el primer y último día</span>
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  disabled={month >= monthDate(today)}
                  onClick={() => setMonth(monthDate(month, 1))}
                >
                  ›
                </button>
              </div>
              <div className="meta-range-months">
                {renderMonth(0)}
                {renderMonth(1)}
              </div>
              <p className="meta-range-value" aria-live="polite">
                {preset === "lifetime"
                  ? "Desde el inicio"
                  : `${labelDate(start || today)} – ${labelDate(end || today)}`}
                {pickingEnd ? " · Selecciona el último día" : ""}
              </p>
              <small>
                Fechas en hora de Lima. El calendario cambia el análisis del
                periodo seleccionado.
              </small>
            </div>
          </div>
          <div className="row meta-range-footer">
            <button type="button" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="primary" disabled={!start || !end}>
              Actualizar
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
