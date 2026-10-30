"use client";
import { useId, useRef, useState } from "react";
import type { InventoryCampaignTask } from "../../lib/meta-ads/inventory-sheet-activation";
export type InventoryCampaignChange = {
  active?: boolean;
  pinned?: boolean;
  campaignTask?: InventoryCampaignTask;
};
export function InventoryCampaignControl({
  title,
  activation,
  task,
  disabled,
  onChange,
}: {
  title: string;
  activation: string;
  task: string;
  disabled: boolean;
  onChange: (change: InventoryCampaignChange) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 8, top: 8 });
  const active = activation === "ACTIVE",
    mixed = activation === "MIXED",
    label =
      task === "CREATE"
        ? "Por hacer campaña"
        : task === "STOP"
          ? "Por desactivar campaña"
          : task === "MIXED"
            ? "Pendientes de campaña"
            : active
              ? "Activado"
              : mixed
                ? "Mixto"
                : "Desactivado";
  const choose = (change: InventoryCampaignChange) => {
    popover.current?.hidePopover();
    onChange(change);
  };
  return (
    <>
      <button
        type="button"
        className={
          "trial-sheet-activation inventory-campaign-trigger trial-sheet-" +
          (active ? "ACTIVE" : mixed ? "MIXED" : "INACTIVE") +
          (task !== "NONE" ? " campaign-task-" + task : "")
        }
        popoverTarget={id}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Activación de ${title}: ${label}`}
        title={label + " · " + title}
        data-activation={activation}
        data-campaign-task={task}
        disabled={disabled}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 274)),
            top: Math.max(8, Math.min(r.bottom + 3, innerHeight - 248)),
          });
        }}
      >
        <i aria-hidden="true" />
        <span aria-hidden="true">⌄</span>
      </button>
      <div
        ref={popover}
        id={id}
        popover="auto"
        role="menu"
        className="inventory-campaign-popover"
        style={position}
        onToggle={(e) => setOpen(e.newState === "open")}
      >
        {open && (
          <>
            <strong>{title}</strong>
            <small>Registro manual de campaña</small>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => choose({ active: true, campaignTask: "NONE" })}
            >
              <span className="campaign-menu-dot campaign-ready" />
              Activar · campaña lista
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => choose({ active: true, campaignTask: "CREATE" })}
            >
              <span className="campaign-menu-dot campaign-create" />
              Por hacer campaña
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => choose({ campaignTask: "STOP" })}
            >
              <span className="campaign-menu-dot campaign-stop" />
              Por desactivar campaña
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => choose({ active: false, campaignTask: "NONE" })}
            >
              <span className="campaign-menu-dot campaign-off" />
              Desactivar
            </button>
            {task !== "NONE" && (
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => choose({ campaignTask: "NONE" })}
              >
                Quitar pendiente
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
