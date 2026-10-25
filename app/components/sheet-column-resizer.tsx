"use client";
import { useRef } from "react";
export function SheetColumnResizer({
  label,
  onResize,
  onReset,
}: {
  label: string;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const width = (element: HTMLElement) =>
    element.closest("th")!.getBoundingClientRect().width;
  const resize = (value: number) =>
    onResize(Math.max(24, Math.min(2000, value)));
  return (
    <button
      type="button"
      className="sheet-column-resizer"
      aria-label={`Cambiar ancho de ${label}`}
      title="Arrastra para cambiar el ancho. ← → ajustan; doble clic o Inicio restablecen."
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.preventDefault();
        onReset();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        drag.current = { x: e.clientX, width: width(e.currentTarget) };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current) e.preventDefault();
        if (drag.current)
          resize(drag.current.width + e.clientX - drag.current.x);
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        resize(drag.current.width + e.clientX - drag.current.x);
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          resize(
            width(e.currentTarget) +
              (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 20 : 5),
          );
        } else if (e.key === "Home") {
          e.preventDefault();
          onReset();
        }
      }}
    />
  );
}
