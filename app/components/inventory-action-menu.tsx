"use client";
import { useId, useState, type ReactNode } from "react";
export function InventoryActionMenu({
  label,
  disabled = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId(),
    [position, setPosition] = useState({ left: 8, top: 8 });
  return (
    <>
      <button
        type="button"
        className="inventory-header-assign"
        disabled={disabled}
        popoverTarget={id}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 304)),
            top: Math.max(8, Math.min(r.bottom + 4, innerHeight - 260)),
          });
        }}
      >
        {label} ⌄
      </button>
      <div
        id={id}
        popover="auto"
        className="inventory-action-popover"
        style={position}
      >
        <strong>{label}</strong>
        {children}
      </div>
    </>
  );
}
