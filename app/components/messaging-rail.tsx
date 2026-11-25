"use client";

import { useSyncExternalStore } from "react";
import { PulpoBrand } from "./pulpo-brand";
import "./messaging-rail.css";

const messaging = "https://pulpo.agenciamagneto.org/";
const preferenceEvent = "pulpo-messaging-rail";
const subscribe = (update: () => void) => {
  window.addEventListener(preferenceEvent, update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener(preferenceEvent, update);
    window.removeEventListener("storage", update);
  };
};
const serverSnapshot = () => "default";
const links = [
  { label: "Vista general", section: "Vista general", path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { label: "Conversaciones", section: "Conversaciones", path: "M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-4a8.5 8.5 0 1 1 16.1-5.5Z" },
  { label: "Libros", section: "Libros", path: "M12 6a6 6 0 0 0-5-2H3v15h4a6 6 0 0 1 5 2 6 6 0 0 1 5-2h4V4h-4a6 6 0 0 0-5 2Zm0 0v15" },
  { label: "Llamadas", section: "Llamadas", path: "M22 17v3a2 2 0 0 1-2.2 2C10 21 3 14 2 4.2A2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7l.5 3.2a2 2 0 0 1-.6 2.1L8 10a15 15 0 0 0 6 6l1-1a2 2 0 0 1 2.1-.6l3.2.5A2 2 0 0 1 22 17Z" },
];

const preferences = new Map<string, string>();
export function MessagingRail({ userId, compact }: { userId: string; compact: boolean }) {
  const key = "pulpo-messaging-rail:v1:" + userId;
  const preference = useSyncExternalStore(subscribe, () => {
    if (preferences.has(key)) return preferences.get(key)!;
    try { return localStorage.getItem(key) ?? "default"; } catch { return "default"; }
  }, serverSnapshot);
  const collapsed = preference === "default" ? compact : preference === "1";
  const toggle = collapsed ? "Ampliar menú de Mensajería" : "Minimizar menú de Mensajería";
  return (
    <aside className="messaging-rail" data-collapsed={collapsed} aria-label="Pulpo Mensajería">
      <header>
        <div className="messaging-rail-brand"><PulpoBrand messaging /></div>
        <button type="button" title={toggle} aria-label={toggle} aria-expanded={!collapsed}
          onClick={() => {
            const next = collapsed ? "0" : "1";
            try {
              localStorage.setItem(key, next);
              preferences.delete(key);
            } catch {
              preferences.set(key, next);
            }
            window.dispatchEvent(new Event(preferenceEvent));
          }}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M16 5v14" />
            <path d={collapsed ? "m12 9-3 3 3 3" : "m8 9 3 3-3 3"} />
          </svg>
        </button>
      </header>
      <nav aria-label="Atajos a Pulpo Mensajería">
        {links.map(({ label, section, path }) => (
          <a key={section} href={messaging + "?section=" + encodeURIComponent(section)}
            target="_blank" rel="noopener noreferrer" title={label} aria-label={label}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d={path} />
            </svg>
            <span>{label}</span><span className="messaging-external" aria-hidden="true">↗</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}
