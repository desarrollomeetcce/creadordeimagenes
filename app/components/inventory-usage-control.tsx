"use client";
import { useId, useRef, useState } from "react";
import type {
  GroupUsageCell,
  GroupUsageMode,
} from "../../lib/meta-ads/inventory-group-usage";
import { groupUsageStatus } from "../../lib/meta-ads/inventory-group-usage-policy";
import { financialRequest as api } from "./financial-request";
export function InventoryUsageControl({
  listId,
  itemId,
  name,
  country,
  cell,
  ready,
  canEdit,
  onApplied,
}: {
  listId: string;
  itemId?: string;
  name: string;
  country: string;
  cell?: GroupUsageCell;
  ready: boolean;
  canEdit: boolean;
  onApplied: (cell: GroupUsageCell) => void;
}) {
  const id = useId(),
    pop = useRef<HTMLDivElement>(null),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 8, top: 8 });
  const used = groupUsageStatus(cell) === "USED";
  async function save(mode: GroupUsageMode) {
    if (pending.current || !itemId || !ready) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api("meta-ads/inventory/trials", "POST", {
        action: "USAGE",
        listId,
        itemId,
        country,
        mode,
        expectedRevision: cell?.revision ?? null,
      });
      onApplied(result.usageUpdate.cell);
      pop.current?.hidePopover();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="inventory-compact-usage"
        data-used={used}
        aria-label={`Uso de ${name} en ${country}: ${used ? "Usado" : "Sin usar"}`}
        title={
          ready
            ? `${used ? "Usado" : "Sin usar"} · uso independiente de activación`
            : "Cargando uso por país…"
        }
        disabled={!canEdit || !ready || !itemId || busy}
        popoverTarget={id}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 275)),
            top: Math.max(8, Math.min(r.bottom + 3, innerHeight - 240)),
          });
          setError("");
        }}
      >
        {used ? "✓" : "—"}
      </button>
      <div
        ref={pop}
        id={id}
        popover="auto"
        className="inventory-usage-popover"
        role="menu"
        style={position}
        onToggle={(e) => setOpen(e.newState === "open")}
      >
        {open && (
          <>
            <strong>
              {name} · {country}
            </strong>
            {(
              [
                ["USED", "✓ Marcar usado"],
                ["UNUSED", "— Marcar sin usar"],
                ["AUTO", "Automático · 12 horas"],
              ] as const
            ).map(([mode, label]) => (
              <button
                type="button"
                role="menuitem"
                key={mode}
                disabled={busy}
                onClick={() => void save(mode)}
              >
                {label}
                {(cell?.mode ?? "AUTO") === mode ? " ✓" : ""}
              </button>
            ))}
            {error && <small role="alert">{error}</small>}
          </>
        )}
      </div>
    </>
  );
}
