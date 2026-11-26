"use client";
import { useId, useState, type ReactNode } from "react";

export function InventoryTopSummary({
  title,
  children,
  action,
  metric,
  onDetail,
  detailDisabled,
}: {
  title: string;
  children: ReactNode;
  action: ReactNode;
  metric?: ReactNode;
  onDetail: () => void;
  detailDisabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="inventory-top-card-title">
        <button
          type="button"
          className="inventory-top-card-name"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((previous) => !previous)}
        >
          {title}
        </button>
        {metric}
        {action}
      </div>
      <div id={id} hidden={!open} className="inventory-top-card-summary">
        {open && (
          <>
            {children}
            <button type="button" disabled={detailDisabled} onClick={onDetail}>
              Ver detalle ↗
            </button>
          </>
        )}
      </div>
    </>
  );
}
