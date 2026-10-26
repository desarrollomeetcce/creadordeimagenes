"use client";
import { useId, useRef, useState } from "react";
import type { SheetMetric } from "../../lib/meta-ads/period-summary";
export function SheetActiveFill({
  metric,
  name,
  day,
  disabled,
  onApply,
  onError,
}: {
  metric: SheetMetric;
  name: string;
  day: string;
  disabled: boolean;
  onApply: (value: number | "NA") => Promise<void>;
  onError: (message: string) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    action = useRef(onApply),
    pending = useRef(false);
  const [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [position, setPosition] = useState({ left: 8, top: 8 });
  const apply = async (text: string) => {
    if (pending.current) return;
    const na = /^n\.?a\.?$/i.test(text.trim()),
      v = Number(text),
      count = metric === "sales" || metric === "base";
    if (
      !na &&
      (!text.trim() ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > (count ? 1e8 : 1e9) ||
        (count && !Number.isInteger(v)))
    ) {
      onError(
        count
          ? "Escribe una cantidad entera no negativa o N.A."
          : "Escribe un importe no negativo o N.A.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await action.current(na ? "NA" : v);
      popover.current?.hidePopover();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="sheet-active-fill-trigger"
        disabled={disabled || busy}
        aria-label={`Completar ${name} ${day}`}
        popoverTarget={id}
        title={`Escribe un valor para todos los alias activos de ${day}; incluye los ocultos por filtros.`}
        onClick={(e) => {
          action.current = onApply;
          setDraft("");
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 300)),
            top: Math.max(8, Math.min(r.bottom + 4, innerHeight - 290)),
          });
        }}
      >
        Activos ⌄
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        className="sheet-active-fill-popover"
        style={position}
        onToggle={(e) => {
          if (e.newState === "open") input.current?.focus();
        }}
      >
        <strong>
          {name} · {day}
        </strong>
        <p>
          Se aplica a todos los alias activos de esta hoja, incluidos los
          ocultos por filtros o búsqueda. Los desactivados conservan sus datos.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void apply(draft);
          }}
        >
          <label>
            Valor para activos
            <input
              ref={input}
              aria-label={`Valor de ${name} ${day} para activos`}
              inputMode="decimal"
              value={draft}
              maxLength={30}
              disabled={busy}
              placeholder="Escribe un número o N.A."
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <small>
            Escribe y pulsa Enter. Los importes usan la moneda de cada fila.
          </small>
          <div className="row">
            <button type="submit" disabled={busy || !draft.trim()}>
              Aplicar a todos los activos
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
        <div className="row">
          <button type="button" disabled={busy} onClick={() => void apply("0")}>
            0
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply("NA")}
          >
            N.A.
          </button>
        </div>
      </div>
    </>
  );
}
