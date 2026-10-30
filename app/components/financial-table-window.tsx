"use client";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
export type FinancialTableWindowMode = "inline" | "maximized" | "restored";
type Mode = FinancialTableWindowMode;
const WindowContext = createContext<{
  mode: Mode;
  change: (mode: Mode) => void;
} | null>(null);
/** Keep the same table DOM and input drafts while promoting its frame into the native top layer. */
export function FinancialTableWindow({
  children,
  title,
  scrollRef,
  mode,
  onModeChange,
  toolbar,
}: {
  children: ReactNode;
  title: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  toolbar?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    position = useRef({ left: 0, top: 0 }),
    opener = useRef<HTMLElement | null>(null);
  const change = (next: Mode) => {
    const scroll = scrollRef.current;
    if (scroll)
      position.current = { left: scroll.scrollLeft, top: scroll.scrollTop };
    if (mode === "inline" && next !== "inline")
      opener.current = document.activeElement as HTMLElement;
    onModeChange(next);
  };
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (mode === "inline") {
      if (node.matches(":modal")) node.close();
      if (!node.open) node.show();
    } else if (!node.matches(":modal")) {
      if (node.open) node.close();
      node.showModal();
    }
    const frame = requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      if (scroll) {
        scroll.scrollLeft = position.current.left;
        scroll.scrollTop = position.current.top;
      }
      if (mode === "inline" && opener.current?.isConnected)
        opener.current.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, scrollRef]);
  return (
    <WindowContext.Provider value={{ mode, change }}>
      <dialog
        open
        ref={dialog}
        className="financial-table-window"
        data-table-window-mode={mode}
        data-expanded={mode === "maximized" || undefined}
        role={mode === "inline" ? "presentation" : "dialog"}
        aria-modal={mode !== "inline" || undefined}
        aria-label={mode !== "inline" ? "Tabla completa · " + title : undefined}
        onCancel={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          change("inline");
        }}
      >
        <FinancialTableWindowControls floating />
        {mode !== "inline" && toolbar}
        {children}
      </dialog>
    </WindowContext.Provider>
  );
}
export function FinancialTableWindowControls({
  floating = false,
}: {
  floating?: boolean;
}) {
  const window = useContext(WindowContext);
  if (
    !window ||
    (floating && window.mode === "inline") ||
    (!floating && window.mode !== "inline")
  )
    return null;
  return (
    <div
      data-table-window-handle={floating || undefined}
      className={
        floating
          ? "financial-table-floating-controls"
          : "financial-table-window-actions"
      }
      role="group"
      aria-label="Tamaño de la tabla"
    >
      {window.mode === "inline" ? (
        <button
          type="button"
          aria-label="Maximizar toda la tabla"
          title="Abrir solo la tabla a tamaño completo"
          onClick={() => window.change("maximized")}
        >
          <span aria-hidden="true">⛶</span>
          <span className="financial-table-window-label">Maximizar tabla</span>
        </button>
      ) : (
        <>
          <span className="financial-table-window-grip" aria-hidden="true">
            ⠿
          </span>
          <button
            type="button"
            data-window-size-control
            aria-label="Minimizar tabla y volver a la hoja"
            title="Minimizar y volver a la hoja"
            onClick={() => window.change("inline")}
          >
            −
          </button>
          <button
            type="button"
            data-window-size-control
            aria-label={
              window.mode === "maximized"
                ? "Restaurar tamaño de la tabla"
                : "Maximizar toda la tabla"
            }
            title={
              window.mode === "maximized"
                ? "Restaurar tamaño · permite mover y ajustar desde la esquina"
                : "Maximizar toda la tabla"
            }
            onClick={() =>
              window.change(
                window.mode === "maximized" ? "restored" : "maximized",
              )
            }
          >
            {window.mode === "maximized" ? "▣" : "⛶"}
          </button>
          <button
            type="button"
            data-window-size-control
            aria-label="Cerrar ampliación de tabla"
            title="Cerrar ampliación y volver a la hoja"
            onClick={() => window.change("inline")}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
