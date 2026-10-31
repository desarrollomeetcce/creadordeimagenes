"use client";
import { financialRequest } from "./financial-request";
import { useEffect, useId, useRef, useState } from "react";
import {
  calendarPresets,
  presetRange,
  shiftCalendarDay,
} from "../../lib/meta-ads/calendar-presets";
import { limaToday } from "./date-range";
const names = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2026, i, 1)).toLocaleDateString("es-PE", {
    month: "short",
    timeZone: "UTC",
  }),
);
const previousMonth = (m: string) =>
  shiftCalendarDay(m + "-01", -1).slice(0, 7);
const nextMonth = (m: string) => shiftCalendarDay(m + "-01", 32).slice(0, 7);
export function MetaDateRange({
  from,
  to,
  onChange,
  maxDays = 31,
  triggerLabel,
  triggerAriaLabel,
  applyLabel = "Actualizar",
  activeSince: suppliedActiveSince,
  activityTableId,
  activityTableIds,
}: {
  activityTableId?: string;
  activityTableIds?: string[];
  activeSince?: string | null;
  from: string;
  to: string;
  onChange: (a: string, b: string, preset?: string) => void;
  triggerLabel?: string;
  triggerAriaLabel?: string;
  applyLabel?: string;
  maxDays?: number;
}) {
  const today = limaToday(),
    id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [start, setStart] = useState(from),
    [end, setEnd] = useState(to),
    [pickingEnd, setPickingEnd] = useState(false),
    [hover, setHover] = useState(""),
    [chosen, setChosen] = useState("custom"),
    [recent, setRecent] = useState<string[]>([]),
    [left, setLeft] = useState(previousMonth(to.slice(0, 7))),
    [right, setRight] = useState(to.slice(0, 7)),
    [position, setPosition] = useState({ left: 8, top: 8 });
  const align = (a: string, b: string) => {
    setLeft(
      a.slice(0, 7) === b.slice(0, 7)
        ? previousMonth(b.slice(0, 7))
        : a.slice(0, 7),
    );
    setRight(b.slice(0, 7));
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const [activityStart, setActivityStart] = useState<{
    tableId: string;
    since: string | null;
  } | null>(null);
  const activityKey = JSON.stringify(
    [
      ...new Set(
        activityTableIds ?? (activityTableId ? [activityTableId] : []),
      ),
    ].sort(),
  );
  const activeSince =
    suppliedActiveSince ??
    (activityStart?.tableId === activityKey ? activityStart?.since : null);
  useEffect(() => {
    const tableIds = JSON.parse(activityKey) as string[];
    if (!open || !tableIds.length || suppliedActiveSince) return;
    let active = true;
    void Promise.all(
      tableIds.map((tableId) =>
        financialRequest(
          "meta-ads/effectiveness/activity-start?" +
            new URLSearchParams({ tableId }),
        ),
      ),
    )
      .then((results) => {
        if (active)
          setActivityStart({
            tableId: activityKey,
            since:
              results
                .map((r) => r.since)
                .filter((d): d is string => typeof d === "string")
                .sort()[0] ?? null,
          });
      })
      .catch(() => {
        if (active) setActivityStart({ tableId: activityKey, since: null });
      });
    return () => {
      active = false;
    };
  }, [open, activityKey, suppliedActiveSince]);
  const presets = activeSince
    ? [...calendarPresets, ["active", "Desde que se activó"] as const]
    : calendarPresets;
  const selectPreset = (key: string) => {
    const range =
      key === "active" && activeSince
        ? ([activeSince, today] as [string, string])
        : presetRange(key, today);
    setChosen(key);
    setPickingEnd(false);
    setHover("");
    if (range) {
      setStart(range[0]);
      setEnd(range[1]);
      align(...range);
    }
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const valid =
    !!start &&
    !!end &&
    Number.isFinite(Date.parse(start)) &&
    Number.isFinite(Date.parse(end)) &&
    start <= end &&
    end <= today &&
    (Date.parse(end) - Date.parse(start)) / 86400000 < maxDays;
  const human = (day: string) =>
    new Date(day + "T12:00:00Z").toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const activeFrom =
      pickingEnd && hover ? (hover < start ? hover : start) : start,
    activeTo = pickingEnd && hover ? (hover < start ? start : hover) : end;
  const years = Array.from(
    { length: Number(today.slice(0, 4)) - 2000 + 2 },
    (_, i) => String(2000 + i),
  );
  const calendar = (
    month: string,
    change: (m: string) => void,
    index: number,
  ) => {
    const first = month + "-01",
      offset = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7,
      days = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
      ).getUTCDate();
    return (
      <section
        className="meta-range-month"
        aria-label={`Mes ${index === 0 ? "izquierdo" : "derecho"}`}
      >
        <header>
          <select
            aria-label={`Mes ${index + 1}`}
            value={month.slice(5)}
            onChange={(e) => change(month.slice(0, 4) + "-" + e.target.value)}
          >
            {names.map((n, i) => (
              <option key={i} value={String(i + 1).padStart(2, "0")}>
                {n}
              </option>
            ))}
          </select>
          <select
            aria-label={`Año ${index + 1}`}
            value={month.slice(0, 4)}
            onChange={(e) => change(e.target.value + month.slice(4))}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </header>
        <div className="meta-range-days">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <span key={d}>{d}</span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={"blank" + i} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = month + "-" + String(i + 1).padStart(2, "0");
            return (
              <button
                type="button"
                key={day}
                aria-label={day}
                aria-pressed={day === start || day === end}
                disabled={day > today}
                className={
                  day === start || day === end
                    ? "meta-range-edge"
                    : day >= activeFrom && day <= activeTo
                      ? "meta-range-inside"
                      : ""
                }
                onMouseEnter={() => {
                  if (pickingEnd) setHover(day);
                }}
                onClick={() => {
                  setChosen("custom");
                  setHover("");
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
      </section>
    );
  };
  return (
    <div
      className="date-range meta-range"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        aria-label={triggerAriaLabel}
        aria-controls={id}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          const r = trigger.current!.getBoundingClientRect(),
            width = Math.min(700, window.innerWidth - 16);
          setPosition({
            left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
            top: Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 550)),
          });
          setStart(from);
          setEnd(to);
          setPickingEnd(false);
          setHover("");
          setChosen(
            presets.find(([k]) => {
              const v =
                k === "active" && activeSince
                  ? [activeSince, today]
                  : presetRange(k, today);
              return v?.[0] === from && v?.[1] === to;
            })?.[0] ?? "custom",
          );
          align(from, to);
          setOpen(true);
        }}
      >
        {triggerLabel ?? `▦ ${human(from)} — ${human(to)} ▾`}
      </button>
      {open && (
        <section
          id={id}
          className="meta-range-panel"
          aria-label="Calendario de fechas"
          style={{
            ...position,
            maxHeight: `calc(100dvh - ${position.top + 8}px)`,
          }}
        >
          <aside className="meta-range-presets">
            {recent.length > 0 && (
              <>
                <strong>Usados recientemente</strong>
                {recent.map((k) => {
                  const item = presets.find((p) => p[0] === k);
                  if (!item) return null;
                  return (
                    <label key={"recent" + k}>
                      <input
                        type="radio"
                        name={id + "-recent"}
                        checked={chosen === k}
                        onChange={() => selectPreset(k)}
                      />
                      {item[1]}
                    </label>
                  );
                })}
              </>
            )}
            <strong>Períodos</strong>
            {presets.map(([k, label]) => (
              <label key={k}>
                <input
                  type="radio"
                  name={id + "-period"}
                  checked={chosen === k}
                  onChange={() => selectPreset(k)}
                />
                {label}
              </label>
            ))}
            <label>
              <input
                type="radio"
                name={id + "-period"}
                checked={chosen === "custom"}
                onChange={() => setChosen("custom")}
              />
              Personalizado
            </label>
          </aside>
          <div className="meta-range-main">
            <div className="meta-range-navigation">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => {
                  setLeft(previousMonth(left));
                  setRight(previousMonth(right));
                }}
              >
                ‹
              </button>
              <span>
                {pickingEnd
                  ? "Elige la fecha final"
                  : "Elige el inicio y el final del rango"}
              </span>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => {
                  setLeft(nextMonth(left));
                  setRight(nextMonth(right));
                }}
              >
                ›
              </button>
            </div>
            <div className="meta-range-months">
              {calendar(left, setLeft, 0)}
              {calendar(right, setRight, 1)}
            </div>
            <div className="meta-range-values">
              <select
                aria-label="Período predefinido"
                value={chosen}
                onChange={(e) => selectPreset(e.target.value)}
              >
                <option value="custom">Personalizado</option>
                {presets.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                aria-label="Desde"
                value={start}
                max={today}
                onChange={(e) => {
                  setStart(e.target.value);
                  setChosen("custom");
                }}
              />
              <span>–</span>
              <input
                type="date"
                aria-label="Hasta"
                value={end}
                max={today}
                min={start}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setChosen("custom");
                }}
              />
            </div>
            <footer>
              <small>
                {valid
                  ? "Las fechas se muestran en la hora de Lima"
                  : `Elige hasta ${maxDays} días, sin fechas futuras`}
              </small>
              <button type="button" onClick={close}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                disabled={!valid}
                onClick={() => {
                  onChange(start, end, chosen);
                  if (chosen !== "custom")
                    setRecent((v) =>
                      [chosen, ...v.filter((k) => k !== chosen)].slice(0, 3),
                    );
                  close();
                }}
              >
                {applyLabel}
              </button>
            </footer>
          </div>
        </section>
      )}
    </div>
  );
}
