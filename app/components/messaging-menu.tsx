"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
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

type Placement = "header" | "left" | "right";
const preferenceEvent = "pulpo-menu-position";
const fallback = new Map<string, string>();
const defaultPosition = "header:50";
function subscribe(update: () => void) {
  window.addEventListener(preferenceEvent, update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener(preferenceEvent, update);
    window.removeEventListener("storage", update);
  };
}

export function MessagingMenu({ userId }: { userId: string }) {
  const id = useId();
  const key = "pulpo-menu-position:v1:" + userId;
  const preference = useSyncExternalStore(
    subscribe,
    () => {
      if (fallback.has(key)) return fallback.get(key)!;
      try {
        return localStorage.getItem(key) ?? defaultPosition;
      } catch {
        return defaultPosition;
      }
    },
    () => defaultPosition,
  );
  const [side, percent] = preference.split(":");
  const stored = {
    side: side === "left" || side === "right" ? side : "header",
    y: Number.isFinite(Number(percent))
      ? Math.max(0, Math.min(100, Number(percent)))
      : 50,
  } as const;
  const [drag, setDrag] = useState<{ side: Placement; y: number } | null>(null);
  const placement = drag ?? stored;
  const floating = placement.side !== "header";
  const movement = useRef<{
    pointer: number;
    side: Placement;
    y: number;
  } | null>(null);
  const popover = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  }>({ left: 8, top: 8 });

  function save(side: Placement, y = stored.y) {
    const value = side + ":" + y;
    try {
      localStorage.setItem(key, value);
      fallback.delete(key);
    } catch {
      fallback.set(key, value);
    }
    window.dispatchEvent(new Event(preferenceEvent));
  }

  return (
    <div
      className="messaging-menu"
      data-placement={placement.side}
      style={
        floating
          ? { top: `clamp(54px, ${placement.y}dvh, calc(100dvh - 54px))` }
          : undefined
      }
    >
      <button
        ref={trigger}
        type="button"
        className="messaging-menu-trigger"
        aria-label="Menú de Pulpo Mensajería"
        popoverTarget={id}
        onClick={(event) => {
          const anchor = event.currentTarget.getBoundingClientRect();
          const left = Math.max(8, Math.min(anchor.left, innerWidth - 208));
          setPosition(
            innerHeight - anchor.bottom < 300 && anchor.top > innerHeight / 2
              ? { left, bottom: innerHeight - anchor.top + 5 }
              : { left, top: anchor.bottom + 5 },
          );
        }}
      >
        <PulpoBrand messaging />
        {!floating && <span>Pulpo</span>}
        <span aria-hidden="true">⌄</span>
      </button>
      {floating && (
        <button
          type="button"
          className="messaging-menu-grip"
          aria-label="Mover menú de Pulpo"
          title="Arrastra el menú. También puedes usar las flechas."
          onPointerDown={(event) => {
            if (event.button !== 0 || movement.current) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            movement.current = { pointer: event.pointerId, ...stored };
          }}
          onPointerMove={(event) => {
            if (movement.current?.pointer !== event.pointerId) return;
            const side = event.clientX < innerWidth / 2 ? "left" : "right";
            const y = Math.max(
              0,
              Math.min(100, Math.round((event.clientY / innerHeight) * 100)),
            );
            movement.current = { pointer: event.pointerId, side, y };
            setDrag({ side, y });
          }}
          onPointerUp={(event) => {
            if (movement.current?.pointer !== event.pointerId) return;
            save(movement.current.side, movement.current.y);
            movement.current = null;
            setDrag(null);
          }}
          onLostPointerCapture={() => {
            movement.current = null;
            setDrag(null);
          }}
          onKeyDown={(event) => {
            if (
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key,
              )
            )
              return;
            event.preventDefault();
            if (event.key === "ArrowLeft") save("left");
            else if (event.key === "ArrowRight") save("right");
            else
              save(
                stored.side,
                Math.max(
                  0,
                  Math.min(100, stored.y + (event.key === "ArrowUp" ? -5 : 5)),
                ),
              );
          }}
        >
          ⠿
        </button>
      )}
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
        <div
          className="messaging-menu-positions"
          role="group"
          aria-label="Ubicación del menú"
        >
          {(
            [
              ["header", "Arriba"],
              ["left", "Izquierda"],
              ["right", "Derecha"],
            ] as const
          ).map(([side, label]) => (
            <button
              type="button"
              key={side}
              aria-pressed={stored.side === side}
              onClick={() => {
                save(side);
                popover.current?.hidePopover();
                trigger.current?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
