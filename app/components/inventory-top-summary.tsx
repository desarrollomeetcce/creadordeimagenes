"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// A top-layer popover keeps the summary outside the scrolling country column.
// Opening it only reveals the evaluation already loaded by the board.
export function InventoryTopSummary({
  title,
  children,
  onDetail,
  detailDisabled,
}: {
  title: string;
  children: ReactNode;
  onDetail: () => void;
  detailDisabled: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const restoringFocus = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const cancelClose = () => clearTimeout(timer.current);
  const show = () => {
    cancelClose();
    if (!trigger.current || !panel.current) return;
    // Hover must never dismiss a detail, action menu, or modal already open.
    if (
      document.querySelector(
        ":modal, [popover]:popover-open:not(.inventory-top-card-summary)",
      )
    )
      return;
    const bounds = trigger.current.getBoundingClientRect();
    setPosition({ left: bounds.left, top: bounds.bottom + 4 });
    panel.current.showPopover();
  };
  const close = () => {
    cancelClose();
    // Preserve keyboard focus when dismissing from inside the summary.
    restoringFocus.current = true;
    if (panel.current?.contains(document.activeElement))
      trigger.current?.focus({ preventScroll: true });
    panel.current?.hidePopover();
    restoringFocus.current = false;
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      const focused = document.activeElement;
      if (!panel.current?.contains(focused) && focused !== trigger.current)
        panel.current?.hidePopover();
    }, 180);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const bounds = panel.current.getBoundingClientRect();
    const anchor = trigger.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8)),
      top: Math.max(
        8,
        anchor.bottom + bounds.height + 12 <= innerHeight
          ? anchor.bottom + 4
          : Math.min(
              anchor.top - bounds.height - 4,
              innerHeight - bounds.height - 8,
            ),
      ),
    });
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="inventory-top-card-name"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") show();
        }}
        onPointerLeave={scheduleClose}
        onFocus={() => {
          if (!restoringFocus.current) show();
        }}
        onBlur={scheduleClose}
        onClick={show}
      >
        {title}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={"Resumen de " + title}
        className="inventory-top-card-summary"
        style={position}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        onToggle={(e) => setOpen(e.newState === "open")}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        onFocus={cancelClose}
        onBlur={scheduleClose}
      >
        <header>
          <strong>{title}</strong>
          <button type="button" aria-label="Cerrar resumen" onClick={close}>
            ×
          </button>
        </header>
        {children}
        <button
          type="button"
          disabled={detailDisabled}
          onClick={() => {
            close();
            onDetail();
          }}
        >
          Ver detalle ↗
        </button>
      </div>
    </>
  );
}
