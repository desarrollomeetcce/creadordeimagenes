"use client";
import { useEffect, useId, useRef, useState } from "react";
import { roleLabels, managesUsers, hasAiModuleAccess } from "../../lib/roles";
export function SidebarAccount({
  user,
  view,
  navigate,
  logout,
}: {
  user: {
    aiAccessEnabled?: boolean;
    messagingLinked?: boolean;
    name: string;
    role: keyof typeof roleLabels;
  };
  view: string;
  navigate: (view: string, tab?: string) => void;
  logout: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    id = useId();
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({
      left: 12,
      bottom: 12,
      width: 260,
      maxHeight: 500,
    });
  const ai = hasAiModuleAccess(user),
    history = ai && !["OBSERVER", "SUPERVISOR", "ADVISOR"].includes(user.role);
  const close = () => panel.current?.hidePopover();
  useEffect(() => {
    panel.current?.hidePopover();
  }, [view]);
  useEffect(() => {
    if (!open) return;
    const resize = () => panel.current?.hidePopover();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open]);
  const item = (v: string, icon: string, label: string) => {
    const active = view === v ||
      (v === "website" && ["mail", "payments"].includes(view)) ||
      (label === "Auditoría" && ["visual-audit", "campaign-audit", "history"].includes(view));
    return (
      <a
        key={v}
        href={"?" + new URLSearchParams({ view: v })}
        title={label}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={"sidebar-account-link" + (active ? " active" : "")}
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
            return;
          e.preventDefault();
          close();
          navigate(v);
        }}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </a>
    );
  };
  return (
    <footer className="sidebar-account">
      <button
        type="button"
        ref={trigger}
        className="sidebar-account-trigger"
        aria-label={`Menú de ${user.name}`}
        title={`Menú de ${user.name}`}
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        onClick={() => {
          const r = trigger.current?.getBoundingClientRect();
          if (r)
            setPosition({
              left: Math.max(8, Math.min(r.left, innerWidth - 288)),
              bottom: innerHeight - r.top + 8,
              width: Math.min(280, innerWidth - 16),
              maxHeight: Math.max(100, r.top - 20),
            });
        }}
      >
        <span className="avatar">{user.name[0]?.toUpperCase()}</span>
        <span>
          <strong>{user.name}</strong>
          <span className="eyebrow">{roleLabels[user.role]}</span>
        </span>
        <span aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>
      <div
        id={id}
        ref={panel}
        popover="auto"
        className="sidebar-account-popover"
        style={position}
        onToggle={(e) => setOpen(e.newState === "open")}
        aria-label="Opciones de cuenta"
      >
        <div className="sidebar-account-actions">
          {user.role === "OWNER" && item("ai", "⚙", "Ajustes IA")}
          {user.messagingLinked && (
            <a className="sidebar-account-link" href="/api/pulpo/open-crm?module=settings" onClick={close}>
              <span aria-hidden="true">⚙</span><span>Configuración</span>
            </a>
          )}
          {history && item("usage", "↗", "Costos de IA")}
          {user.role === "OWNER" && (
            <>
              {item("statistics", "▥", "Estadísticas")}
              {item("website", "◈", "Páginas")}
            </>
          )}
          {(history || user.role === "OWNER") &&
            item(user.role === "OWNER" ? "visual-audit" : "history", "▧", "Auditoría")}
          {managesUsers(user.role) && item("users", "♙", "Usuarios y accesos")}
          {item("account", "♙", "Mi cuenta")}
          {ai &&
            !["OBSERVER", "SUPERVISOR", "ADVISOR"].includes(user.role) &&
            item("plans", "◇", "Mi plan IA")}
          <button
            type="button"
            className="sidebar-logout"
            onClick={() => {
              close();
              logout();
            }}
          >
            <span aria-hidden="true">↪</span>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
