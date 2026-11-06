"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CurrentUserId } from "./role-guide";
const StudioMaxContext = createContext<{
  maximized: string;
  setMaximized: (value: string) => void;
}>({ maximized: "", setMaximized: () => {} });
export function StudioMaximize({
  pane,
  label,
}: {
  pane: string;
  label: string;
}) {
  const { maximized, setMaximized } = useContext(StudioMaxContext);
  const active = maximized === pane;
  return (
    <button
      type="button"
      className={"studio-maximize" + (active ? " is-minimize" : "")}
      aria-label={(active ? "Minimizar " : "Maximizar ") + label}
      title={
        active ? "Regresar a la vista de preparación" : "Maximizar " + label
      }
      aria-pressed={active}
      onClick={() => setMaximized(active ? "" : pane)}
    >
      {active ? "−" : "⛶"}
    </button>
  );
}
export function StudioRestore({ pane }: { pane: string }) {
  const { maximized, setMaximized } = useContext(StudioMaxContext);
  if (maximized !== pane) return null;
  return (
    <div className="studio-return-navigation">
      <button type="button" onClick={() => setMaximized("")}>
        <span aria-hidden="true">−</span> Regresar a la vista de preparación
      </button>
    </div>
  );
}
export function StudioColumns({
  children,
  zone,
}: {
  children: ReactNode;
  zone: string;
}) {
  const userId = useContext(CurrentUserId),
    key = "creative-studio-widths:v1:" + userId,
    root = useRef<HTMLDivElement>(null),
    drag = useRef<{ side: "left" | "right"; x: number; width: number } | null>(
      null,
    );
  const [maximized, setMaximized] = useState("");
  useEffect(() => {
    if (!maximized) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]"))
        setMaximized("");
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [maximized]);
  const [widths, setWidths] = useState({ left: 290, right: 310 }),
    [room, setRoom] = useState(1500),
    [ready, setReady] = useState(false),
    [moving, setMoving] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "null");
      if (v && Number.isFinite(v.left) && Number.isFinite(v.right))
        setWidths({
          left: Math.max(240, Math.min(600, v.left)),
          right: Math.max(260, Math.min(600, v.right)),
        });
    } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(key, JSON.stringify(widths));
      } catch {}
  }, [key, widths, ready]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const o = new ResizeObserver(() => setRoom(el.clientWidth));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const left = Math.min(widths.left, Math.max(240, room - 640)),
    right = Math.min(widths.right, Math.max(260, room - left - 360));
  const change = (side: "left" | "right", value: number) =>
    setWidths((p) => ({
      ...p,
      [side]: Math.round(
        Math.max(
          side === "left" ? 240 : 260,
          Math.min(600, room - 360 - (side === "left" ? right : left), value),
        ),
      ),
    }));
  return (
    <StudioMaxContext.Provider value={{ maximized, setMaximized }}>
      <div
        data-compact={room < 920 || undefined}
        data-maximized={maximized || undefined}
        ref={root}
        className={"studio-columns" + (moving ? " studio-resizing" : "")}
        data-zone={zone}
        style={
          {
            "--studio-left": left + "px",
            "--studio-right": right + "px",
          } as CSSProperties
        }
      >
        {children}
        {(["left", "right"] as const).map((side) => (
          <div
            key={side}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={
              "Ajustar ancho de " + (side === "left" ? "proyecto" : "campaña")
            }
            aria-valuemin={side === "left" ? 240 : 260}
            aria-valuemax={600}
            aria-valuenow={side === "left" ? left : right}
            className={"studio-resizer " + side}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                side,
                x: e.clientX,
                width: side === "left" ? left : right,
              };
              setMoving(true);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d && d.side === side)
                change(
                  side,
                  d.width + (e.clientX - d.x) * (side === "left" ? 1 : -1),
                );
            }}
            onPointerUp={(e) => {
              drag.current = null;
              setMoving(false);
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setMoving(false);
            }}
            onDoubleClick={() => change(side, side === "left" ? 290 : 310)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) {
                e.preventDefault();
                change(
                  side,
                  e.key === "Home"
                    ? side === "left"
                      ? 290
                      : 310
                    : (side === "left" ? left : right) +
                        (e.key === "ArrowRight" ? 20 : -20) *
                          (side === "left" ? 1 : -1),
                );
              }
            }}
          />
        ))}
      </div>
    </StudioMaxContext.Provider>
  );
}
