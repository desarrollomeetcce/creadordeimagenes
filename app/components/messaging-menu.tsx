"use client";

import { useId, useRef, useState } from "react";
import { PulpoBrand } from "./pulpo-brand";
import "./messaging-menu.css";

const messaging = "https://pulpo.agenciamagneto.org/";
const links = [
  {
    label: "Vista general",
    section: "Vista general",
    path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  },
  {
    label: "Conversaciones",
    section: "Conversaciones",
    path: "M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-4a8.5 8.5 0 1 1 16.1-5.5Z",
  },
  {
    label: "Libros",
    section: "Libros",
    path: "M12 6a6 6 0 0 0-5-2H3v15h4a6 6 0 0 1 5 2 6 6 0 0 1 5-2h4V4h-4a6 6 0 0 0-5 2Zm0 0v15",
  },
  {
    label: "Llamadas",
    section: "Llamadas",
    path: "M22 17v3a2 2 0 0 1-2.2 2C10 21 3 14 2 4.2A2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7l.5 3.2a2 2 0 0 1-.6 2.1L8 10a15 15 0 0 0 6 6l1-1a2 2 0 0 1 2.1-.6l3.2.5A2 2 0 0 1 22 17Z",
  },
];

export function MessagingMenu() {
  const id = useId();
  const popover = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  return (
    <div className="messaging-menu">
      <button
        type="button"
        className="messaging-menu-trigger"
        aria-label="Menú de Pulpo Mensajería"
        popoverTarget={id}
        onClick={(event) => {
          const anchor = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(anchor.left, innerWidth - 208)),
            top: anchor.bottom + 5,
          });
        }}
      >
        <PulpoBrand messaging />
        <span>Pulpo</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <nav
        id={id}
        ref={popover}
        popover="auto"
        className="messaging-menu-panel"
        style={position}
        aria-label="Atajos a Pulpo Mensajería"
      >
        <strong>Pulpo Mensajería</strong>
        {links.map(({ label, section, path }) => (
          <a
            key={section}
            href={messaging + "?section=" + encodeURIComponent(section)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => popover.current?.hidePopover()}
          >
            <svg
              aria-hidden="true"
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            >
              <path d={path} />
            </svg>
            <span>{label}</span>
            <span className="messaging-external" aria-hidden="true">
              ↗
            </span>
          </a>
        ))}
      </nav>
    </div>
  );
}
