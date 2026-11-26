"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  changeLayout,
  crmModules,
  groups,
  initialLayout,
  upgradeLayout,
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
type Snapshot = { layout?: Layout; modules?: Module[]; sync?: boolean; sessionGrant?: string };

async function messagingSession(grant: string, signal: AbortSignal): Promise<Snapshot | null> {
  try {
    const response = await fetch("https://pulpo.agenciamagneto.org/api/workspace-menu", {
      method: "POST", credentials: "include", headers: { Authorization: grant }, redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
    });
    if (!response.ok) return null;
    const { layout, modules } = await response.json();
    return Array.isArray(modules) ? { layout, modules: crmModules.filter((id) => modules.includes(id)) } : null;
  } catch { return null; }
}

export function SharedPulpoMenu({
  endpoint,
  userId,
  resolve,
  expand,
}: {
  endpoint: string;
  userId: string;
  resolve: (id: Module, peer: Module[], fromSession: boolean) => Destination | null;
  expand: () => void;
}) {
  const [layout, setLayout] = useState(initialLayout);
  const [peer, setPeer] = useState<Module[]>([]);
  const [fromSession, setFromSession] = useState(false);
  const [server, setServer] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writing = useRef(false);
  const refreshAccess = useRef<() => void>(() => {});
  const revision = useRef(0);
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
          groups.every(
            (group) =>
              (group === "Etiquetas" && previous.version !== 3) ||
              Array.isArray(previous.order?.[group]),
          )
        )
          setLayout(upgradeLayout(previous));
      }
    } catch {}
    let ready = false;
    let shared = false;
    let peerCheckedAt = 0;
    let loading = false;
    async function load(background: boolean, force = false) {
      if (loading || writing.current || document.visibilityState === "hidden")
        return;
      const elapsed = Date.now() - peerCheckedAt;
      const checkPeer = force || !peerCheckedAt || elapsed >= (background ? 60000 : 3000);
      if (!shared && !checkPeer) return;
      const layoutOnly = !checkPeer;
      if (checkPeer) peerCheckedAt = Date.now();
      const current = revision.current;
      loading = true;
      try {
        const response = await fetch(
          layoutOnly ? endpoint + "?layout=1" : endpoint,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setPeer([]);
            shared = false;
          }
          throw Error();
        }
        const snapshot: Snapshot = await response.json();
        if (controller.signal.aborted || current !== revision.current) return;
        if (snapshot.layout) setLayout(upgradeLayout(snapshot.layout));
        if (!layoutOnly) {
          const session = snapshot.sessionGrant ? await messagingSession(snapshot.sessionGrant, controller.signal) : null;
          if (controller.signal.aborted || current !== revision.current) return;
          ready = true;
          shared = snapshot.sync ?? Boolean(snapshot.modules?.length);
          if (session?.layout) setLayout(upgradeLayout(session.layout));
          setPeer(session?.modules ?? snapshot.modules ?? []);
          setFromSession(session !== null);
          setServer(Boolean(snapshot.layout));
        }
      } catch {
        if (!controller.signal.aborted && !ready) setServer(false);
      } finally {
        loading = false;
      }
    }

    const resume = () => void load(false);
    refreshAccess.current = () => { void load(false, true); window.dispatchEvent(new Event("pulpo-access-refresh")); };
    const interval = window.setInterval(() => void load(true), 8000);
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      controller.abort();
    };
  }, [endpoint, storage]);

  async function apply(move: Move) {
    if (writing.current || server === null) return;
    revision.current++;
    const next = changeLayout(layout, move);
    setLayout(next);
    setError("");
    if (!server) {
      try {
        localStorage.setItem(storage, JSON.stringify(next));
      } catch {}
      return;
    }
    writing.current = true;
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
      if (!snapshot.layout) throw Error();
      setLayout(upgradeLayout(snapshot.layout));
      if (snapshot.modules) setPeer(snapshot.modules);
    } catch {
      setLayout(layout);
      setError("No se pudo guardar el cambio. Inténtalo otra vez.");
    } finally {
      writing.current = false;
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
        className="pulpo-module"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {id === "facebook" ? (
            <path
              fill="currentColor"
              fillRule="evenodd"
              stroke="none"
              d="M12 2C6.3 2 2 6.18 2 11.8c0 2.93 1.17 5.48 3.07 7.23.2.18.32.44.33.71l.05 1.79a.8.8 0 0 0 1.12.71l1.98-.87c.17-.08.36-.09.54-.04.92.26 1.89.39 2.91.39 5.7 0 10-4.18 10-9.8S17.7 2 12 2Z M5.95 14.67 2.94-4.66a1.5 1.5 0 0 1 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.15-2.39c.42-.32.96.18.68.63l-2.94 4.66a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.15 2.39c-.42.32-.96-.18-.68-.63Z"
            />
          ) : id === "performance" ? (
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

  const performance = resolve("performance", peer, fromSession);
  return (
    <nav aria-label="Menú principal" className="pulpo-shared-menu">
      <div className="pulpo-menu-top">
        <button type="button" className="pulpo-menu-edit" title="Actualizar accesos" aria-label="Actualizar accesos"
          disabled={busy} onClick={() => refreshAccess.current()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M4 15l2 3a7 7 0 0 0 12-1" /></svg>
        </button>
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
          disabled={server === null || fromSession}
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
      {groups.map((group) => {
        const visible = layout.order[group].flatMap((id) => {
          const destination = resolve(id, peer, fromSession);
          return destination ? [{ id, destination }] : [];
        });
        const collapsed = !editing && layout.collapsed.includes(group);
        const pinned = group === "CRM" ? performance : null;
        if (!visible.length && !pinned && !editing) return null;
        return (
          <section
            key={group}
            data-color={group}
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
