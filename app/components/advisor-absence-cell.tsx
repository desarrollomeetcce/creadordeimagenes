"use client";
import { useId, useRef, useState } from "react";
import { absenceClockSummary } from "../../lib/meta-ads/advisor-absence";
import type {
  AbsenceInput,
  AbsenceInterval,
} from "../../lib/meta-ads/advisor-absence";
import type { AbsenceView } from "./advisor-types";
const hours = (v: number) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 6 }).format(v);
export function AdvisorAbsenceCell({
  advisorId,
  name,
  day,
  value,
  disabled,
  onSave,
  onError,
}: {
  advisorId: string;
  name: string;
  day: string;
  value: AbsenceView;
  disabled: boolean;
  onSave: (v: AbsenceInput) => Promise<void>;
  onError: (v: string) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null),
    action = useRef(onSave),
    revision = useRef(value.revision),
    pending = useRef(false);
  const [mode, setMode] = useState<"MANUAL" | "CLOCK">(value.mode),
    [manual, setManual] = useState(""),
    [intervals, setIntervals] = useState<AbsenceInterval[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [position, setPosition] = useState({ left: 8, top: 8 });
  const patch = (id: string, data: Partial<AbsenceInterval>) =>
    setIntervals((old) =>
      old.map((i) => (i.id === id ? { ...i, ...data } : i)),
    );
  const save = async () => {
    if (pending.current) return;
    const numeric =
      manual.trim() === "" ? null : Number(manual.trim().replace(",", "."));
    if (
      mode === "MANUAL" &&
      numeric !== null &&
      (!Number.isFinite(numeric) ||
        numeric < 0 ||
        numeric > 24 ||
        !/^\d{1,2}(?:[.,]\d{1,6})?$/.test(manual.trim()))
    ) {
      setError(
        "Escribe entre 0 y 24 horas, con hasta 6 decimales. 0,5 equivale a 30 minutos.",
      );
      return;
    }
    if (mode === "CLOCK" && intervals.some((i) => !i.start)) {
      setError("Completa la hora de salida o retira esa fila.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action.current(
        mode === "MANUAL"
          ? { advisorId, day, revision: revision.current, mode, hours: numeric }
          : { advisorId, day, revision: revision.current, mode, intervals },
      );
      popover.current?.hidePopover();
    } catch (e) {
      const text = (e as Error).message;
      setError(text);
      onError(text);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  let preview: ReturnType<typeof absenceClockSummary> | null = null;
  if (mode === "CLOCK") {
    try {
      preview = absenceClockSummary(intervals);
    } catch {}
  }
  return (
    <>
      <button
        type="button"
        className="advisor-absence-trigger"
        popoverTarget={id}
        disabled={disabled || busy}
        aria-label={`Horas ausentes ${name} ${day}`}
        title={`${value.hours === null ? "Sin horas confirmadas" : hours(value.hours) + " horas confirmadas"}${value.pending ? " · Ausencia abierta: falta el regreso" : ""}. 1 hora = 60 minutos.`}
        onClick={(e) => {
          action.current = onSave;
          revision.current = value.revision;
          const fresh = value.manualHours === null && !value.intervals.length;
          setMode(fresh ? "CLOCK" : value.mode);
          setManual(
            value.manualHours === null ? "" : String(value.manualHours),
          );
          setIntervals(
            fresh
              ? [
                  {
                    id: crypto.randomUUID(),
                    start: "",
                    end: null,
                    nextDay: false,
                  },
                ]
              : value.intervals.map((i) => ({ ...i })),
          );
          setError("");
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 400)),
            top: Math.max(8, Math.min(r.bottom + 4, innerHeight - 360)),
          });
        }}
      >
        {value.hours === null ? "—" : hours(value.hours)}
        {value.pending ? (
          <span
            className="advisor-absence-pending"
            aria-label="Regreso pendiente"
          >
            {" "}
            +
          </span>
        ) : null}
      </button>
      <div
        ref={popover}
        id={id}
        popover="auto"
        className="advisor-absence-popover"
        style={position}
      >
        <strong>
          H · {name} · {day}
        </strong>
        <div className="row">
          <button
            type="button"
            aria-pressed={mode === "MANUAL"}
            disabled={busy}
            onClick={() => setMode("MANUAL")}
          >
            Horas decimales
          </button>
          <button
            type="button"
            aria-pressed={mode === "CLOCK"}
            disabled={busy}
            onClick={() => {
              setMode("CLOCK");
              if (!intervals.length)
                setIntervals([
                  {
                    id: crypto.randomUUID(),
                    start: "",
                    end: null,
                    nextDay: false,
                  },
                ]);
            }}
          >
            Salida y regreso
          </button>
        </div>
        <p>
          Hora de Lima. 1 hora = 60 minutos; 0,5 = 30 minutos; 0,25 = 15
          minutos. El modo elegido reemplaza el registro de H de este día.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy}>
            {mode === "MANUAL" ? (
              <label>
                Horas ausentes
                <input
                  aria-label={`Horas decimales ${name} ${day}`}
                  inputMode="decimal"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="0,5"
                  maxLength={12}
                />
                <small>Vacío retira las horas registradas.</small>
              </label>
            ) : (
              <>
                <p>
                  Guarda la salida ahora y completa el regreso después. Los
                  horarios abiertos no suman horas hasta indicar el regreso.
                </p>
                {intervals.map((i, index) => (
                  <div className="advisor-absence-interval" key={i.id}>
                    <label>
                      Salida
                      <input
                        type="time"
                        step="60"
                        aria-label={`Salida ${index + 1} ${name} ${day}`}
                        value={i.start}
                        onChange={(e) => patch(i.id, { start: e.target.value })}
                      />
                    </label>
                    <label>
                      Regreso
                      <input
                        type="time"
                        step="60"
                        aria-label={`Regreso ${index + 1} ${name} ${day}`}
                        value={i.end ?? ""}
                        onChange={(e) =>
                          patch(i.id, {
                            end: e.target.value || null,
                            ...(!e.target.value ? { nextDay: false } : {}),
                          })
                        }
                      />
                    </label>
                    <label className="row">
                      <input
                        type="checkbox"
                        checked={i.nextDay}
                        disabled={!i.end}
                        aria-label={`Regreso al día siguiente ${index + 1}`}
                        onChange={(e) =>
                          patch(i.id, { nextDay: e.target.checked })
                        }
                      />
                      Día siguiente
                    </label>
                    <button
                      type="button"
                      aria-label={`Retirar ausencia ${index + 1}`}
                      onClick={() =>
                        setIntervals((old) => old.filter((x) => x.id !== i.id))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={intervals.length >= 20}
                  onClick={() =>
                    setIntervals((old) => [
                      ...old,
                      {
                        id: crypto.randomUUID(),
                        start: "",
                        end: null,
                        nextDay: false,
                      },
                    ])
                  }
                >
                  + Ausencia
                </button>
              </>
            )}
          </fieldset>
          {error && (
            <p className="sheet-message" role="alert">
              {error}
            </p>
          )}
          {mode === "CLOCK" && preview && (
            <p role="status">
              Total confirmado:{" "}
              <strong>
                {preview.hours === null ? "—" : hours(preview.hours)} h
              </strong>
              {preview.pending ? " · Falta registrar el regreso" : ""}
            </p>
          )}
          <div className="row">
            <button type="submit" disabled={busy}>
              Guardar horas
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => popover.current?.hidePopover()}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
