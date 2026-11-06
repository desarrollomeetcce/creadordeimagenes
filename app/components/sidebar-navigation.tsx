"use client";
import { useEffect, useRef, useState } from "react";
/** Personal presentation order only; permission-filtered items come from the shell. */
export function SidebarNavigation({
  items,
  view,
  userId,
  navigate,
}: {
  items: string[][];
  view: string;
  userId: string;
  navigate: (view: string) => void;
}) {
  const key = `sidebar-order:v1:${userId}`,
    [saved, setSaved] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
    target: string;
    after: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null),
    [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  useEffect(() => {
    setSaved([]);
    try {
      const v = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(v))
        setSaved(
          [
            ...new Set(
              v.filter(
                (id): id is string => typeof id === "string" && id.length < 100,
              ),
            ),
          ].slice(0, 100),
        );
    } catch {}
  }, [key]);
  const byId = new Map(items.map((item) => [item[0], item])),
    ordered = [
      ...saved.filter((id) => byId.has(id)),
      ...items.map((i) => i[0]).filter((id) => !saved.includes(id)),
    ];
  const move = (from: string, to: string, after: boolean) => {
    if (from === to || !byId.has(from) || !byId.has(to)) return;
    const next = ordered.filter((id) => id !== from);
    next.splice(next.indexOf(to) + (after ? 1 : 0), 0, from);
    setSaved(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setNotice("Orden del menú guardado.");
    } catch {
      setNotice("Orden cambiado; el navegador no permite guardarlo.");
    }
  };
  return (
    <nav aria-label="Menú principal" className="sidebar-navigation">
      {ordered.map((id) => {
        const [v, icon, label] = byId.get(id)!;
        return (
          <div
            key={v}
            data-nav-id={v}
            className="sidebar-nav-row"
            data-dragging={dragging === v || undefined}
            data-drop-edge={
              over?.id === v ? (over.after ? "after" : "before") : undefined
            }
          >
            <a
              href={"?view=" + encodeURIComponent(v)}
              title={label}
              aria-label={label}
              aria-current={view === v ? "page" : undefined}
              className={
                view === v || (v === "library" && view === "jobs")
                  ? "active"
                  : ""
              }
              onClick={(e) => {
                if (
                  e.button !== 0 ||
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey
                )
                  return;
                e.preventDefault();
                navigate(v);
              }}
            >
              <span className="sidebar-nav-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="sidebar-nav-label">{label}</span>
            </a>
            <button
              type="button"
              className="sidebar-nav-grip"
              title={`Arrastra para mover ${label}; Alt + flechas para ordenar`}
              aria-label={`Mover ${label}`}
              onKeyDown={(e) => {
                if (
                  !e.altKey ||
                  !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                    e.key,
                  )
                )
                  return;
                e.preventDefault();
                const forward = ["ArrowDown", "ArrowRight"].includes(e.key),
                  target = ordered[ordered.indexOf(v) + (forward ? 1 : -1)];
                if (target) move(v, target, forward);
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  id: v,
                  x: e.clientX,
                  y: e.clientY,
                  moved: false,
                  target: v,
                  after: false,
                };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                if (
                  !d.moved &&
                  Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6
                )
                  return;
                d.moved = true;
                setDragging(d.id);
                const target = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest<HTMLElement>("[data-nav-id]");
                if (!target) return;
                const id = target.dataset.navId!;
                if (!byId.has(id)) return;
                const r = target.getBoundingClientRect(),
                  after =
                    innerWidth <= 620
                      ? e.clientX > r.left + r.width / 2
                      : e.clientY > r.top + r.height / 2;
                d.target = id;
                d.after = after;
                setOver({ id, after });
                target.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
              onPointerUp={() => {
                const d = drag.current;
                if (d?.moved) move(d.id, d.target, d.after);
                drag.current = null;
                setDragging(null);
                setOver(null);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragging(null);
                setOver(null);
              }}
              onLostPointerCapture={() => {
                drag.current = null;
                setDragging(null);
                setOver(null);
              }}
            >
              <span aria-hidden="true">⠿</span>
            </button>
          </div>
        );
      })}
      <span role="status" className="sr-only">
        {notice}
      </span>
    </nav>
  );
}
