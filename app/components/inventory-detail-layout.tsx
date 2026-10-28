"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as PE,
} from "react";
import { CurrentUserId } from "./role-guide";
import {
  inventoryDetailOrder,
  normalizeDetailOrder,
  moveDetailModule,
  type InventoryDetailModuleId,
} from "../../lib/meta-ads/inventory-detail-order";
type Drag = {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  target: string;
  after: boolean;
};
type Context = {
  order: string[];
  dragging: string;
  target: string;
  after: boolean;
  start: (id: string, e: PE<HTMLButtonElement>) => void;
  pointer: (e: PE<HTMLButtonElement>) => void;
  finish: () => void;
  cancel: () => void;
  move: (id: string, target: string, after: boolean) => void;
};
const Layout = createContext<Context | null>(null);
export function VerticalDetailLayout<T extends string>({
  children,
  modules,
  scope,
}: {
  modules: readonly T[];
  scope: string;
  children: (layout: {
    order: T[];
    warning: string;
    reset: () => void;
    custom: boolean;
  }) => ReactNode;
}) {
  const user = useContext(CurrentUserId),
    key =
      scope === "inventory"
        ? `effectiveness-inventory-detail-order:v1:${user}`
        : `effectiveness-detail-order:v1:${user}:${scope}`;
  const [order, setOrder] = useState<T[]>([...modules]),
    [warning, setWarning] = useState(""),
    [message, setMessage] = useState(""),
    [visual, setVisual] = useState({ dragging: "", target: "", after: false });
  const drag = useRef<Drag | null>(null),
    handle = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setOrder(
          normalizeDetailOrder(
            JSON.parse(localStorage.getItem(key) || "null"),
            modules,
          ) as T[],
        );
        setWarning("");
      } catch {
        setWarning("No se pudo recuperar el orden guardado.");
      }
    };
    read();
    const sync = (e: StorageEvent) => {
      if (e.key === key) read();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, modules]);
  const save = (next: T[]) => {
    setOrder(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setWarning("");
    } catch {
      setWarning(
        "El orden cambió solo en esta ventana: el navegador impide guardarlo.",
      );
    }
  };
  const cancel = () => {
    drag.current = null;
    setVisual({ dragging: "", target: "", after: false });
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drag.current) {
        e.preventDefault();
        e.stopPropagation();
        drag.current = null;
        setVisual({ dragging: "", target: "", after: false });
      }
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, []);
  const move = (id: string, target: string, after: boolean) => {
    save(moveDetailModule(order, id, target, after, modules) as T[]);
    setMessage(
      "Orden actualizado para esta vista en los demás detalles de esta cuenta.",
    );
  };
  const locate = (d: Drag) => {
    const el = document
        .elementFromPoint(d.x, d.y)
        ?.closest<HTMLElement>("[data-inventory-module]"),
      target = el?.dataset.inventoryModule || "";
    d.target = target !== d.id ? target : "";
    d.after =
      !!el &&
      d.y >
        el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
    setVisual({ dragging: d.id, target: d.target, after: d.after });
  };
  useEffect(() => {
    if (!visual.dragging) return;
    let frame = 0;
    const tick = () => {
      const d = drag.current,
        pop = handle.current?.closest<HTMLElement>(
          ".alias-state-detail,dialog",
        );
      if (d?.moved && pop) {
        const r = pop.getBoundingClientRect(),
          h = pop
            .querySelector(".detail-sticky-header")
            ?.getBoundingClientRect();
        if (d.y < (h?.bottom ?? r.top) + 28) pop.scrollBy(0, -14);
        else if (d.y > r.bottom - 45) pop.scrollBy(0, 14);
        locate(d);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visual.dragging]);
  const context: Context = {
    order,
    ...visual,
    cancel,
    move,
    start: (id, e) => {
      if (!e.isPrimary || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      handle.current = e.currentTarget;
      e.currentTarget.focus({ preventScroll: true });
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        target: "",
        after: false,
      };
    },
    pointer: (e) => {
      const d = drag.current;
      if (!d) return;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved ||= Math.hypot(d.x - d.startX, d.y - d.startY) > 6;
      if (d.moved) locate(d);
    },
    finish: () => {
      const d = drag.current;
      if (d?.moved && d.target) move(d.id, d.target, d.after);
      cancel();
    },
  };
  return (
    <Layout.Provider value={context}>
      <span className="sr-only" role="status">
        {message}
      </span>
      {children({
        order,
        warning,
        reset: () => save([...modules]),
        custom: order.some((id, i) => id !== modules[i]),
      })}
    </Layout.Provider>
  );
}
export function InventoryDetailSlot({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const c = useContext(Layout);
  return (
    <div
      className="inventory-detail-slot"
      data-inventory-module={id}
      data-dragging={c?.dragging === id || undefined}
      data-drop-edge={
        c?.target === id ? (c.after ? "after" : "before") : undefined
      }
    >
      {children}
    </div>
  );
}
export function InventoryDetailHandle({
  id,
  title,
}: {
  id: string;
  title: ReactNode;
}) {
  const c = useContext(Layout);
  const moduleId =
    id === "period-products" || id === "daily-products"
      ? "products"
      : id === "daily-advisors"
        ? "advisors"
        : id;
  if (!c || !c.order.includes(moduleId)) return null;
  return (
    <button
      type="button"
      className="detail-module-handle"
      aria-label={`Mover ${typeof title === "string" ? title : "sección"}`}
      title="Arrastra arriba o abajo · Alt + ↑ / ↓ · Escape cancela"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => c.start(moduleId, e)}
      onPointerMove={c.pointer}
      onPointerUp={(e) => {
        const b = e.currentTarget;
        c.finish();
        requestAnimationFrame(
          () => b.isConnected && b.focus({ preventScroll: true }),
        );
      }}
      onPointerCancel={c.cancel}
      onKeyDown={(e) => {
        if (
          !e.altKey ||
          !["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const i = c.order.indexOf(moduleId),
          up = e.key === "ArrowUp" || e.key === "Home",
          target =
            e.key === "Home"
              ? c.order[0]
              : e.key === "End"
                ? c.order.at(-1)
                : c.order[i + (up ? -1 : 1)];
        if (target) c.move(moduleId, target, !up);
        const b = e.currentTarget;
        requestAnimationFrame(
          () => b.isConnected && b.focus({ preventScroll: true }),
        );
      }}
    >
      ⠿
    </button>
  );
}

export function InventoryDetailLayout({
  children,
}: {
  children: (layout: {
    order: InventoryDetailModuleId[];
    warning: string;
    reset: () => void;
    custom: boolean;
  }) => ReactNode;
}) {
  return (
    <VerticalDetailLayout modules={inventoryDetailOrder} scope="inventory">
      {children}
    </VerticalDetailLayout>
  );
}
