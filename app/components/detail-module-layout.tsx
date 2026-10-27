"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CurrentUserId } from "./role-guide";
import {
  advisorModuleIds,
  defaultAdvisorLayout,
  moveAdvisorModule,
  normalizeAdvisorLayout,
  type AdvisorModuleId,
  type AdvisorModuleLayout,
  type ModulePlacement,
} from "../../lib/meta-ads/advisor-detail-layout";

export function useAdvisorModuleLayout(advisorId: string) {
  const userId = useContext(CurrentUserId);
  const key = `effectiveness-tab:v1:${userId}:advisor-detail:${advisorId}:module-layout`;
  const [saved, setSaved] = useState<{
    key: string;
    rows: AdvisorModuleLayout;
  }>({ key: "", rows: defaultAdvisorLayout });
  const [warning, setWarning] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(key);
        setSaved({
          key,
          rows: raw
            ? normalizeAdvisorLayout(JSON.parse(raw))
            : defaultAdvisorLayout,
        });
        setWarning("");
      } catch {
        setSaved({ key, rows: defaultAdvisorLayout });
        setWarning("No se pudo recuperar la distribución guardada.");
      }
    };
    read();
    const sync = (e: StorageEvent) => {
      if (e.key === key) read();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const rows = saved.key === key ? saved.rows : defaultAdvisorLayout;
  const save = useCallback(
    (rows: AdvisorModuleLayout) => {
      setSaved({ key, rows });
      try {
        localStorage.setItem(key, JSON.stringify(rows.map((r) => r.join("|"))));
        setWarning("");
      } catch {
        setWarning(
          "La distribución cambió, pero este navegador no permitió guardarla.",
        );
      }
    },
    [key],
  );
  const move = useCallback(
    (
      source: AdvisorModuleId,
      target: AdvisorModuleId,
      placement: ModulePlacement,
    ) => save(moveAdvisorModule(rows, source, target, placement)),
    [rows, save],
  );
  return {
    rows,
    move,
    warning,
    reset: () => save(defaultAdvisorLayout),
    custom: JSON.stringify(rows) !== JSON.stringify(defaultAdvisorLayout),
  };
}
type Drop = { id: AdvisorModuleId; placement: ModulePlacement };
type Drag = {
  id: AdvisorModuleId;
  x: number;
  y: number;
  moved: boolean;
  drop: Drop | null;
};
type LayoutContext = {
  rows: AdvisorModuleLayout;
  instructions: string;
  message: string;
  dragging: AdvisorModuleId | null;
  drop: Drop | null;
  start: (
    id: AdvisorModuleId,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  pointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  finish: () => void;
  cancel: () => void;
  move: (
    source: AdvisorModuleId,
    target: AdvisorModuleId,
    placement: ModulePlacement,
  ) => void;
};
const Layout = createContext<LayoutContext | null>(null);
export function DetailModuleLayout({
  scope,
  rows,
  move,
  children,
}: {
  scope: string;
  rows: AdvisorModuleLayout;
  move: LayoutContext["move"];
  children: ReactNode;
}) {
  const instructions = useId(),
    drag = useRef<Drag | null>(null);
  const [visual, setVisual] = useState<{
    dragging: AdvisorModuleId | null;
    drop: Drop | null;
  }>({ dragging: null, drop: null });
  const [message, setMessage] = useState("");
  const cancel = useCallback(() => {
    drag.current = null;
    setVisual({ dragging: null, drop: null });
  }, []);
  useEffect(cancel, [scope, cancel]);
  const moveAndAnnounce = useCallback(
    (
      source: AdvisorModuleId,
      target: AdvisorModuleId,
      placement: ModulePlacement,
    ) => {
      move(source, target, placement);
      setMessage(
        "Distribución actualizada. Los botones superiores siguen el nuevo orden.",
      );
    },
    [move],
  );
  const start = useCallback(
    (id: AdvisorModuleId, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!e.isPrimary || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.focus({ preventScroll: true });
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        id,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        drop: null,
      };
    },
    [],
  );
  const pointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    const element = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-module-id]");
    const id = element?.dataset.moduleId as AdvisorModuleId | undefined;
    let drop: Drop | null = null;
    if (element && id && id !== d.id && advisorModuleIds.includes(id)) {
      const rect = element.getBoundingClientRect();
      drop = {
        id,
        placement:
          e.clientX < rect.left + rect.width * 0.25
            ? "left"
            : e.clientX > rect.right - rect.width * 0.25
              ? "right"
              : e.clientY < rect.top + rect.height / 2
                ? "before"
                : "after",
      };
    }
    d.drop = drop;
    setVisual({ dragging: d.id, drop });
    const dialog = e.currentTarget.closest("dialog"),
      rect = dialog?.getBoundingClientRect();
    if (dialog && rect) {
      if (e.clientY < rect.top + 75) dialog.scrollBy(0, -25);
      else if (e.clientY > rect.bottom - 65) dialog.scrollBy(0, 25);
    }
  }, []);
  const finish = useCallback(() => {
    const d = drag.current;
    if (d?.moved && d.drop) moveAndAnnounce(d.id, d.drop.id, d.drop.placement);
    cancel();
  }, [moveAndAnnounce, cancel]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drag.current) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [cancel]);
  const value = useMemo(
    () => ({
      rows,
      instructions,
      message,
      ...visual,
      start,
      pointerMove,
      finish,
      cancel,
      move: moveAndAnnounce,
    }),
    [
      rows,
      instructions,
      message,
      visual,
      start,
      pointerMove,
      finish,
      cancel,
      moveAndAnnounce,
    ],
  );
  return <Layout.Provider value={value}>{children}</Layout.Provider>;
}
export function DetailLayoutA11y() {
  const layout = useContext(Layout);
  return layout ? (
    <>
      <span id={layout.instructions} className="sr-only">
        Arrastra para mover arriba, abajo o al costado. Con teclado, usa Alt y
        las flechas. Escape cancela el arrastre.
      </span>
      <span className="sr-only" role="status">
        {layout.message}
      </span>
    </>
  ) : null;
}
export function DetailModuleHandle({
  id,
  title,
}: {
  id: string;
  title: ReactNode;
}) {
  const layout = useContext(Layout);
  if (!layout || !advisorModuleIds.includes(id as AdvisorModuleId)) return null;
  const moduleId = id as AdvisorModuleId;
  return (
    <button
      type="button"
      className="detail-module-handle"
      aria-label={`Mover ${typeof title === "string" ? title : "sección"}`}
      aria-describedby={layout.instructions}
      title="Arrastra para cambiar la posición · Alt + flechas"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => layout.start(moduleId, e)}
      onPointerMove={layout.pointerMove}
      onPointerUp={(e) => {
        const button = e.currentTarget;
        layout.finish();
        requestAnimationFrame(() => {
          if (button.isConnected) button.focus({ preventScroll: true });
        });
      }}
      onPointerCancel={layout.cancel}
      onKeyDown={(e) => {
        if (
          !e.altKey ||
          !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const order = layout.rows.flat(),
          index = order.indexOf(moduleId),
          previous = e.key === "ArrowUp" || e.key === "ArrowLeft";
        const target = order[index + (previous ? -1 : 1)];
        if (target) {
          const button = e.currentTarget;
          layout.move(
            moduleId,
            target,
            e.key === "ArrowUp"
              ? "before"
              : e.key === "ArrowDown"
                ? "after"
                : e.key === "ArrowLeft"
                  ? "left"
                  : "right",
          );
          requestAnimationFrame(() => {
            if (button.isConnected) button.focus({ preventScroll: true });
          });
        }
      }}
    >
      ⠿
    </button>
  );
}
export function DetailModuleSlot({
  id,
  children,
}: {
  id: AdvisorModuleId;
  children: ReactNode;
}) {
  const layout = useContext(Layout),
    row = layout?.rows.find((r) => r.includes(id));
  const placement = layout?.drop?.id === id ? layout.drop.placement : undefined;
  return (
    <div
      className="detail-module-slot"
      data-module-id={id}
      data-dragging={layout?.dragging === id || undefined}
      data-drop-placement={placement}
      style={{ gridColumn: row?.length === 1 ? "1 / -1" : undefined }}
    >
      {placement && (
        <span className="detail-module-drop-label" aria-hidden="true">
          {placement === "left"
            ? "Colocar a la izquierda"
            : placement === "right"
              ? "Colocar a la derecha"
              : placement === "before"
                ? "Colocar arriba"
                : "Colocar abajo"}
        </span>
      )}
      {children}
    </div>
  );
}
