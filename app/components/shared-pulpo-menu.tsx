"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  changeLayout,
  groups,
  initialLayout,
  modules,
  type Group,
  type Layout,
  type Module,
  type Move,
  type Movable,
} from "@/lib/pulpo-menu-model";
import "./shared-pulpo-menu.css";

type Destination = {
  href: string;
  active?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};
type Snapshot = { layout: Layout; modules?: Module[] };

export function SharedPulpoMenu({
  endpoint,
  userId,
  resolve,
  expand,
}: {
  endpoint: string;
  userId: string;
  resolve: (id: Module, peer: Module[]) => Destination | null;
  expand: () => void;
}) {
  const [layout, setLayout] = useState(initialLayout);
  const [peer, setPeer] = useState<Module[]>([]);
  const [server, setServer] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dragged = useRef<Movable | null>(null);
  const storage = "pulpo-shared-menu:" + userId;

  useEffect(() => {
    const controller = new AbortController();
    try {
      const saved = localStorage.getItem(storage);
      if (saved) {
        const previous: Layout = JSON.parse(saved);
        if (
          Array.isArray(previous.collapsed) &&
          groups.every((group) => Array.isArray(previous.order?.[group]))
        )
          setLayout(previous);
      }
    } catch {}
    const load = () =>
      void fetch(endpoint, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw Error();
          const snapshot: Snapshot = await response.json();
          if (controller.signal.aborted) return;
          setLayout(snapshot.layout);
          setPeer(snapshot.modules ?? []);
          setServer(true);
        })
        .catch(() => {
          if (!controller.signal.aborted) setServer(false);
        });
    load();
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted) load();
    };
    window.addEventListener("pageshow", resume);
    return () => {
      window.removeEventListener("pageshow", resume);
      controller.abort();
    };
  }, [endpoint, storage]);

  async function apply(move: Move) {
    if (busy || server === null) return;
    const next = changeLayout(layout, move);
    setLayout(next);
    setError("");
    if (!server) {
      try {
        localStorage.setItem(storage, JSON.stringify(next));
      } catch {}
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(move),
      });
      if (!response.ok) throw Error();
      const snapshot: Snapshot = await response.json();
      setLayout(snapshot.layout);
      if (snapshot.modules) setPeer(snapshot.modules);
    } catch {
      setLayout(layout);
      setError("No se pudo guardar el cambio. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  function link(id: Module, destination: Destination) {
    const [label, path] = modules[id];
    return (
      <a
        href={destination.href}
        onClick={destination.onClick}
        title={label}
        aria-label={label}
        aria-current={destination.active ? "page" : undefined}
        className={`nav-item pulpo-module${destination.active ? " active" : ""}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {id === "performance" ? (
            <>
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </>
          ) : (
            <path d={path} />
          )}
          {id === "contacts" && <circle cx="9" cy="7" r="4" />}
        </svg>
        <span>{label}</span>
      </a>
    );
  }

  function drop(group: Group, before?: Movable) {
    const id = dragged.current;
    dragged.current = null;
    if (id) void apply({ kind: "move", id, group, before });
  }

  const performance = resolve("performance", peer);
  return (
    <nav aria-label="Menú principal" className="pulpo-shared-menu">
      <div className="pulpo-menu-top">
        {editing && (
          <button
            type="button"
            className="pulpo-menu-restore"
            disabled={busy}
            onClick={() => void apply({ kind: "restore-groups" })}
          >
            Restablecer grupos
          </button>
        )}
        <button
          type="button"
          className="pulpo-menu-edit"
          aria-label={editing ? "Listo" : "Ordenar menú"}
          title={editing ? "Listo" : "Ordenar menú"}
          aria-pressed={editing}
          disabled={server === null}
          onClick={() => {
            if (!editing) expand();
            setEditing(!editing);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d={
                editing
                  ? "m5 12 4 4L19 6"
                  : "M8 19V5m-3 3 3-3 3 3m5-3v14m-3-3 3 3 3-3"
              }
            />
          </svg>
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {groups.map((group, index) => {
        const visible = layout.order[group].flatMap((id) => {
          const destination = resolve(id, peer);
          return destination ? [{ id, destination }] : [];
        });
        const collapsed = !editing && layout.collapsed.includes(group);
        const pinned = group === "CRM" ? performance : null;
        if (!visible.length && !pinned && !editing) return null;
        return (
          <section
            key={group}
            data-color={index}
            className="pulpo-menu-group"
            onDragOver={(event) => {
              if (editing && dragged.current) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(group);
            }}
          >
            <button
              type="button"
              className="pulpo-menu-band"
              aria-expanded={!collapsed}
              aria-label={group}
              title={group}
              disabled={busy || editing || server === null}
              onClick={() =>
                void apply({ kind: "toggle", group, collapsed: !collapsed })
              }
            >
              <span className="pulpo-group-name">{group}</span>
              <span aria-hidden="true" className="pulpo-group-chevron">
                {collapsed ? "›" : "⌄"}
              </span>
            </button>
            {!collapsed && pinned && link("performance", pinned)}
            {!collapsed &&
              visible.map(({ id, destination }, itemIndex) => (
                <div
                  key={id}
                  className="pulpo-menu-row"
                  onDragOver={(event) => {
                    if (editing && dragged.current) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    drop(group, id);
                  }}
                >
                  {link(id, destination)}
                  {editing && (
                    <details className="pulpo-menu-handle">
                      <summary
                        aria-label={`Mover ${modules[id][0]}`}
                        title={`Arrastrar ${modules[id][0]}`}
                        draggable={!busy}
                        onDragStart={(event) => {
                          dragged.current = id;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", id);
                        }}
                        onDragEnd={() => {
                          dragged.current = null;
                        }}
                      >
                        <span aria-hidden="true">⠿</span>
                      </summary>
                      <div className="pulpo-menu-move">
                        <button
                          type="button"
                          aria-label={`Subir ${modules[id][0]}`}
                          disabled={busy || !itemIndex}
                          onClick={() =>
                            void apply({
                              kind: "move",
                              id,
                              group,
                              before: visible[itemIndex - 1]?.id,
                            })
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Bajar ${modules[id][0]}`}
                          disabled={busy || itemIndex === visible.length - 1}
                          onClick={() =>
                            void apply({
                              kind: "move",
                              id,
                              group,
                              before: visible[itemIndex + 2]?.id,
                            })
                          }
                        >
                          ↓
                        </button>
                        <select
                          aria-label={`Grupo de ${modules[id][0]}`}
                          value={group}
                          disabled={busy}
                          onChange={(event) =>
                            void apply({
                              kind: "move",
                              id,
                              group: event.target.value as Group,
                            })
                          }
                        >
                          {groups.map((target) => (
                            <option key={target}>{target}</option>
                          ))}
                        </select>
                      </div>
                    </details>
                  )}
                </div>
              ))}
          </section>
        );
      })}
    </nav>
  );
}
