"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import {
  moveTotalColumn,
  orderedTotalColumns,
} from "../../lib/meta-ads/totals-column-layout";
import {
  totalDataFill,
  sheetDataFillLabels,
} from "../../lib/meta-ads/sheet-data-fill";
import type { TotalColumn } from "../../lib/meta-ads/totals-detail";
type Gesture = {
  key: string;
  x: number;
  y: number;
  pointer: number;
  button: HTMLButtonElement;
  active: boolean;
  target: string;
  after: boolean;
  keys: string[];
};
export function useTotalsColumnTools(
  listId: string,
  mode: "manual" | "automatic",
  available: readonly TotalColumn[],
) {
  const [manual, setManual] = useWorkbookPreference<string[]>(
      listId,
      "total-columns-manual",
      [],
    ),
    [automatic, setAutomatic] = useWorkbookPreference<string[]>(
      listId,
      "total-columns-automatic",
      [],
    ),
    [colorValue, setColorValue] = useWorkbookPreference<string>(
      listId,
      "total-column-colors",
      "{}",
    );
  const columns = orderedTotalColumns(
      available,
      mode === "manual" ? manual : automatic,
    ),
    keys: string[] = columns.map((c) => c.key);
  const gesture = useRef<Gesture | null>(null),
    [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null),
    [message, setMessage] = useState("");
  let colors: Record<string, string> = {};
  try {
    const raw = JSON.parse(colorValue);
    if (raw && typeof raw === "object" && !Array.isArray(raw))
      colors = Object.fromEntries(
        Object.entries(raw).filter(
          ([k, v]) =>
            available.some((c) => c.key === k) &&
            typeof v === "string" &&
            /^#[0-9a-f]{6}$/i.test(v),
        ),
      ) as Record<string, string>;
  } catch {}
  const cancel = () => {
    const g = gesture.current;
    gesture.current = null;
    setDrop(null);
    if (g?.button.hasPointerCapture(g.pointer))
      g.button.releasePointerCapture(g.pointer);
  };
  useEffect(() => {
    cancel();
  }, [listId, mode]);
  const save = (next: string[]) => {
    if (mode === "manual") setManual(next);
    else setAutomatic(next);
  };
  const begin = (e: PointerEvent<HTMLButtonElement>, key: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    gesture.current = {
      key,
      x: e.clientX,
      y: e.clientY,
      pointer: e.pointerId,
      button: e.currentTarget,
      active: false,
      target: key,
      after: false,
      keys,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (!g.active && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6) return;
    g.active = true;
    const th = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLTableCellElement>("th[data-total-column]");
    if (!th) {
      g.target = g.key;
      setDrop(null);
      return;
    }
    const key = th.dataset.totalColumn!;
    if (!keys.includes(key)) return;
    const after =
      e.clientX >
      th.getBoundingClientRect().left + th.getBoundingClientRect().width / 2;
    g.target = key;
    g.after = after;
    setDrop((old) =>
      old?.key === key && old.after === after ? old : { key, after },
    );
    const scroller = th.closest<HTMLElement>(".table-scroll");
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (e.clientX > r.right - 28) scroller.scrollLeft += 18;
      else if (e.clientX < r.left + 28) scroller.scrollLeft -= 18;
    }
  };
  const finish = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    cancel();
    if (g.active && g.target !== g.key) {
      save(moveTotalColumn(g.keys, g.key, g.target, g.after));
      setMessage("Orden de columnas guardado.");
      requestAnimationFrame(() => g.button.focus({ preventScroll: true }));
    }
  };
  const kind = (key: string) =>
    totalDataFill(available.find((c) => c.key === key)!);
  const green = (key: string) => kind(key) === "automatic";
  const style = (key: string, header = false): CSSProperties => ({
    backgroundColor: `color-mix(in srgb,${colors[key] ?? `var(--fill-${kind(key)})`} ${header ? 20 : 8}%,var(--surface))`,
  });
  const handle = (column: TotalColumn, block: string) => (
    <button
      type="button"
      className="totals-column-handle"
      aria-label={`Mover columna ${column.label} en ${block}`}
      title="Arrastra para mover el parámetro. Alt + flecha izquierda/derecha. Escape cancela."
      onPointerDown={(e) => begin(e, column.key)}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={() => {
        if (gesture.current) cancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else if (
          e.altKey &&
          (e.key === "ArrowLeft" || e.key === "ArrowRight")
        ) {
          e.preventDefault();
          e.stopPropagation();
          const index = keys.indexOf(column.key),
            target = keys[index + (e.key === "ArrowRight" ? 1 : -1)];
          if (target) {
            save(
              moveTotalColumn(keys, column.key, target, e.key === "ArrowRight"),
            );
            setMessage("Orden de columnas guardado.");
          }
        }
      }}
    >
      ⠿
    </button>
  );
  return {
    columns,
    drop,
    message,
    style,
    handle,
    colors,
    green,
    kind,
    setColor: (key: string, value: string) => {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      let old: Record<string, string> = {};
      try {
        old = JSON.parse(colorValue);
      } catch {}
      setColorValue(JSON.stringify({ ...old, [key]: value }));
    },
    resetColors: () => setColorValue("{}"),
    resetOrder: () => {
      save(available.map((c) => c.key));
      setMessage("Orden original restablecido.");
    },
  };
}
export function TotalsColumnPalette({
  tools,
}: {
  tools: ReturnType<typeof useTotalsColumnTools>;
}) {
  const id = useId();
  return (
    <>
      <button type="button" popoverTarget={id}>
        Colores de columnas
      </button>
      <div
        id={id}
        popover="auto"
        className="totals-column-palette"
        aria-label="Colores de columnas de Totales"
      >
        <strong>Colores de columnas</strong>
        <p className="hint">
          Los colores personalizados reemplazan el fondo de la guía. Las
          etiquetas Auto, Hoy y D+1 conservan el significado.
        </p>
        {tools.columns.map((c) => (
          <label key={c.key}>
            <span>
              {c.label} · {c.name}
              <small className="sheet-fill-palette-hint">
                {sheetDataFillLabels[tools.kind(c.key)]}
                {tools.colors[c.key] ? " · color personalizado" : ""}
              </small>
            </span>
            <input
              type="color"
              aria-label={`Color de ${c.label} en Totales`}
              value={
                tools.colors[c.key] ??
                (tools.kind(c.key) === "automatic"
                  ? "#176b59"
                  : tools.kind(c.key) === "next-day"
                    ? "#ad7720"
                    : "#326fb4")
              }
              onChange={(e) => tools.setColor(c.key, e.target.value)}
            />
          </label>
        ))}
        <button type="button" onClick={tools.resetColors}>
          Restablecer colores
        </button>
      </div>
      <button type="button" onClick={tools.resetOrder}>
        Restablecer columnas
      </button>
    </>
  );
}
