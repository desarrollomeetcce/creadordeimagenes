"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  type ReactNode,
  type HTMLAttributes,
  type ReactElement,
} from "react";
function RowResizer({
  label,
  onResize,
  onReset,
}: {
  label: string;
  onResize: (value: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ y: number; height: number } | null>(null);
  const measure = (el: HTMLElement) =>
    el.closest("tr")!.getBoundingClientRect().height;
  const resize = (n: number) => onResize(Math.max(24, Math.min(1200, n)));
  return (
    <button
      type="button"
      className="sheet-row-resizer"
      aria-label={`Cambiar altura de ${label}`}
      title="Arrastra para cambiar la altura. ↑ ↓ ajustan; doble clic o Inicio restablecen."
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onReset();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        drag.current = { y: e.clientY, height: measure(e.currentTarget) };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current) {
          e.preventDefault();
          resize(drag.current.height + e.clientY - drag.current.y);
        }
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        resize(drag.current.height + e.clientY - drag.current.y);
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => (drag.current = null)}
      onLostPointerCapture={() => (drag.current = null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          resize(
            measure(e.currentTarget) +
              (e.key === "ArrowDown" ? 1 : -1) * (e.shiftKey ? 20 : 5),
          );
        } else if (e.key === "Home") {
          e.preventDefault();
          onReset();
        }
      }}
    />
  );
}
export function SheetSizedRow({
  label,
  height,
  onResize,
  onReset,
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & {
  label: string;
  height?: number;
  onResize: (height: number) => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const cells = Children.toArray(children);
  const first = cells[0];
  if (isValidElement(first)) {
    const cell = first as ReactElement<HTMLAttributes<HTMLTableCellElement>>;
    cells[0] = cloneElement(
      cell,
      { className: (cell.props.className ?? "") + " sheet-height-cell" },
      cell.props.children,
      <RowResizer label={label} onResize={onResize} onReset={onReset} />,
    );
  }
  return (
    <tr
      {...props}
      style={{ ...props.style, ...(height ? { height } : {}) }}
      data-sized-row
    >
      {cells}
    </tr>
  );
}
