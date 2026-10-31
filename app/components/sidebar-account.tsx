"use client";
import { useEffect, useRef, useState } from "react";
import { roleLabels, managesUsers } from "../../lib/roles";
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
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const options = [
    ...(user.role === "OWNER"
      ? [
          ["mail", "✉", "Ajustes de correo"],
          ["ai", "⚙", "Ajustes de IA"],
        ]
      : []),
    ...((user.aiAccessEnabled !== false || user.role === "OWNER") &&
    !["OBSERVER", "SUPERVISOR", "ADVISOR"].includes(user.role)
      ? [["usage", "↗", "Costos de IA"]]
      : []),
    ...(user.role === "OWNER" ? [["payments", "◇", "Ajustes de pago"]] : []),
  ];
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [view]);
  const item = (id: string, icon: string, label: string) => (
    <a
      href={"?view=" + encodeURIComponent(id)}
      className={
        view === id ? "sidebar-account-link active" : "sidebar-account-link"
      }
      key={id}
      aria-current={view === id ? "page" : undefined}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        setOpen(false);
        navigate(id);
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </a>
  );
  return (
    <footer className="sidebar-account">
      <div className="sidebar-account-user">
        <span className="avatar">{user.name[0].toUpperCase()}</span>
        <div>
          <strong>{user.name}</strong>
          <div className="eyebrow">{roleLabels[user.role]}</div>
        </div>
      </div>
      <div className="sidebar-account-actions">
        {options.length > 0 && (
          <div
            className="sidebar-settings"
            ref={root}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                trigger.current?.focus();
              }
            }}
          >
            <button
              type="button"
              ref={trigger}
              aria-expanded={open}
              aria-controls="sidebar-settings-options"
              className={options.some(([id]) => id === view) ? "active" : ""}
              onClick={() => setOpen(!open)}
            >
              <span aria-hidden="true">⚙</span>
              <span>Ajustes</span>
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <nav
                id="sidebar-settings-options"
                className="sidebar-settings-options"
                aria-label="Ajustes"
              >
                {options.map(([id, icon, label]) => item(id, icon, label))}
              </nav>
            )}
          </div>
        )}
        {managesUsers(user.role) && (
          <div className="sidebar-admin-group">
            <small>Equipo y planes</small>
            {item("users", "♙", "Usuarios y accesos")}
            {user.role === "OWNER" && (
              <a className="sidebar-account-link" href="?view=users&tab=plans">
                <span aria-hidden="true">◇</span>
                <span>Planes de IA</span>
              </a>
            )}
          </div>
        )}
        {item("account", "♙", "Mi cuenta")}
        {user.aiAccessEnabled !== false &&
          !["OBSERVER", "SUPERVISOR", "ADVISOR"].includes(user.role) &&
          item("plans", "◇", "Mi plan IA")}
        <button type="button" className="sidebar-logout" onClick={logout}>
          <span aria-hidden="true">↪</span>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </footer>
  );
}
