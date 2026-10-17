"use client";
import { useEffect, useId, useRef, useState } from "react";
export const limaToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function shiftDay(day: string, offset: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
export function DateRange({
  from,
  to,
  onChange,
  disabled = false,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [start, setStart] = useState(from),
    [end, setEnd] = useState(to),
    [pickingEnd, setPickingEnd] = useState(false),
    [month, setMonth] = useState((from || limaToday()).slice(0, 7));
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const apply = (a: string, b: string) => {
    onChange(a, b);
    setOpen(false);
    trigger.current?.focus();
  };
  const today = limaToday(),
    first = month + "-01",
    weekday = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7,
    days = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5)),
      0,
    ).getDate();
  const human = (d: string) =>
    new Date(d + "T12:00:00Z").toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return (
    <div
      ref={root}
      className="date-range"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => {
          setStart(from);
          setEnd(to);
          setPickingEnd(false);
          setMonth((from || today).slice(0, 7));
          setOpen(!open);
        }}
      >
        ▦{" "}
        {from || to
          ? `${from ? human(from) : "Inicio"} — ${to ? human(to) : "Hoy"}`
          : "Todas las fechas"}{" "}
        ▾
      </button>
      {open && (
        <section
          id={id}
          className="date-popover stack"
          aria-label="Calendario de fechas"
        >
          <strong>Período · hora de Lima</strong>
          <div className="date-presets">
            {[
              ["Hoy", 0],
              ["Ayer", -1],
              ["Últimos 7 días", 6],
              ["Últimos 30 días", 29],
              ["Este mes", -2],
              ["Todas las fechas", -3],
            ].map(([label, n]) => (
              <button
                type="button"
                key={label}
                onClick={() => {
                  const v = Number(n);
                  apply(
                    v === -3
                      ? ""
                      : v === -2
                        ? today.slice(0, 7) + "-01"
                        : shiftDay(today, v < 0 ? v : -v),
                    v === -3 ? "" : v === -1 ? shiftDay(today, -1) : today,
                  );
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="row calendar-heading">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => setMonth(shiftDay(first, -1).slice(0, 7))}
            >
              ‹
            </button>
            <strong>
              {new Date(first + "T12:00:00Z").toLocaleDateString("es-PE", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </strong>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => setMonth(shiftDay(first, 32).slice(0, 7))}
            >
              ›
            </button>
          </div>
          <p className="hint">
            {pickingEnd
              ? "Elige la fecha final; puede ser el mismo día."
              : "Elige el día inicial y luego el final."}
          </p>
          <div className="calendar-grid">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
            {Array.from({ length: weekday }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = month + "-" + String(i + 1).padStart(2, "0");
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={day}
                  aria-pressed={day === start || day === end}
                  className={
                    start && day >= start && day <= (end || start)
                      ? "in-range"
                      : ""
                  }
                  onClick={() => {
                    if (!pickingEnd) {
                      setStart(day);
                      setEnd(day);
                      setPickingEnd(true);
                    } else {
                      setStart(day < start ? day : start);
                      setEnd(day < start ? start : day);
                      setPickingEnd(false);
                    }
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="fields">
            <label>
              Desde
              <input
                type="date"
                aria-label="Desde"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                aria-label="Hasta"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              disabled={!!start && !!end && start > end}
              onClick={() => apply(start, end)}
            >
              Aplicar fechas
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
