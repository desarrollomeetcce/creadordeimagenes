"use client";
import { useState } from "react";
export function DetailNavigation({
  items,
  onClose,
  closeLabel = "Cerrar detalle",
  disabled = false,
}: {
  items: { target: string; label: string; tone?: string }[];
  onClose: () => void;
  closeLabel?: string;
  disabled?: boolean;
}) {
  const [active, setActive] = useState("");
  return (
    <nav className="detail-navigation" aria-label="Secciones del detalle">
      <div className="detail-navigation-items">
        {items.map((item) => (
          <button
            key={item.target}
            type="button"
            className={`detail-section-${item.tone ?? "parameters"}`}
            aria-pressed={active === item.target}
            disabled={disabled}
            onClick={() => {
              const target = document.getElementById(item.target);
              if (!target) return;
              setActive(item.target);
              target.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
                block: "start",
              });
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button type="button" className="ui-close-button" onClick={onClose}>
        {closeLabel}
      </button>
    </nav>
  );
}
