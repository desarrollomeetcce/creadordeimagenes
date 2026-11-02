"use client";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CurrentUserId } from "./role-guide";
type Widths = { key: string; left: number; right: number };
function readWidths(key: string): Widths {
  const defaults = { key, left: 380, right: 275 };
  if (typeof window === "undefined") return defaults;
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    if (
      v &&
      Number.isFinite(v.left) &&
      v.left >= 260 &&
      v.left <= 620 &&
      Number.isFinite(v.right) &&
      v.right >= 220 &&
      v.right <= 440
    )
      return { key, left: v.left, right: v.right };
  } catch {}
  return defaults;
}
export function CourseStudioColumns({ children }: { children: ReactNode }) {
  const userId = useContext(CurrentUserId),
    key = "course-studio-columns:v1:" + userId;
  const [stored, setStored] = useState(() => readWidths(key)),
    [available, setAvailable] = useState(0),
    [dragging, setDragging] = useState(false);
  const widths = stored.key === key ? stored : readWidths(key),
    root = useRef<HTMLDivElement>(null),
    drag = useRef<{ side: "left" | "right"; x: number; width: number } | null>(
      null,
    );
  useEffect(() => {
    if (stored.key !== key) setStored(readWidths(key));
  }, [key, stored.key]);
  useEffect(() => {
    if (stored.key === key)
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ left: stored.left, right: stored.right }),
        );
      } catch {}
  }, [key, stored]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    setAvailable(node.clientWidth);
    const observer = new ResizeObserver(() => setAvailable(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const room = available ? available - 324 : 1000;
  const left = Math.min(widths.left, Math.max(260, room - 220)),
    right = Math.min(widths.right, Math.max(220, room - left));
  function adjust(side: "left" | "right", value: number) {
    const max =
      side === "left"
        ? Math.min(620, Math.max(260, room - right))
        : Math.min(440, Math.max(220, room - left));
    const next = Math.round(
      Math.min(max, Math.max(side === "left" ? 260 : 220, value)),
    );
    setStored((prev) => ({
      ...(prev.key === key ? prev : readWidths(key)),
      [side]: next,
    }));
  }
  return (
    <div
      ref={root}
      className={"course-studio-columns" + (dragging ? " resizing" : "")}
      style={
        {
          "--course-left-width": left + "px",
          "--course-right-width": right + "px",
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
            side === "left"
              ? "Ajustar ancho de Configuración"
              : "Ajustar ancho de Recursos"
          }
          aria-valuemin={side === "left" ? 260 : 220}
          aria-valuemax={side === "left" ? 620 : 440}
          aria-valuenow={side === "left" ? left : right}
          className={"course-column-resizer " + side}
          title="Arrastra para ajustar. Flechas para cambiar; doble clic para restablecer."
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              side,
              x: e.clientX,
              width: side === "left" ? left : right,
            };
            setDragging(true);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.side !== side) return;
            adjust(
              side,
              d.width + (e.clientX - d.x) * (side === "left" ? 1 : -1),
            );
          }}
          onPointerUp={(e) => {
            drag.current = null;
            setDragging(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onDoubleClick={() => adjust(side, side === "left" ? 380 : 275)}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) return;
            e.preventDefault();
            if (e.key === "Home") adjust(side, side === "left" ? 380 : 275);
            else
              adjust(
                side,
                (side === "left" ? left : right) +
                  (e.key === "ArrowRight" ? 20 : -20) *
                    (side === "left" ? 1 : -1),
              );
          }}
        />
      ))}
    </div>
  );
}
