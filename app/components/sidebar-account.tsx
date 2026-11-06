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
    name: string;
    role: keyof typeof roleLabels;
  };
  view: string;
  navigate: (view: string) => void;
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
  const settings = [
    ...(user.role === "OWNER"
      ? [
          ["mail", "✉", "Ajustes de correo"],
          ["ai", "⚙", "Ajustes de IA"],
          ["payments", "◇", "Ajustes de pago"],
        ]
      : []),
    ...(ai && history ? [["usage", "↗", "Costos de IA"]] : []),
  ];
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
  const item = (v: string, icon: string, label: string) => (
    <a
      key={v}
      href={"?view=" + encodeURIComponent(v)}
      title={label}
      aria-label={label}
      aria-current={view === v ? "page" : undefined}
      className={"sidebar-account-link" + (view === v ? " active" : "")}
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
          {settings.length > 0 && (
            <details>
              <summary>⚙ Ajustes</summary>
              <nav aria-label="Ajustes">
                {settings.map(([v, icon, label]) => item(v, icon, label))}
              </nav>
            </details>
          )}
          {user.role === "OWNER" && (
            <>
              {item("statistics", "▥", "Estadísticas")}
              {item("website", "◈", "Página y planes")}
            </>
          )}
          {(history || user.role === "OWNER") && (
            <details open={["visual-audit", "history"].includes(view)}>
              <summary>▧ Auditoría</summary>
              <nav aria-label="Auditoría">
                {user.role === "OWNER" && item("visual-audit", "▧", "Visual")}
                {history && item("history", "◷", "Historial")}
              </nav>
            </details>
          )}
          {managesUsers(user.role) && (
            <div className="sidebar-admin-group">
              <small>Equipo y planes</small>
              {item("users", "♙", "Usuarios y accesos")}
              {user.role === "OWNER" && (
                <a
                  className="sidebar-account-link"
                  href="?view=users&tab=plans"
                  aria-label="Planes de IA"
                >
                  <span aria-hidden="true">◇</span>
                  <span>Planes de IA</span>
                </a>
              )}
            </div>
          )}
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
