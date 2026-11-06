"use client";
import { useEffect, useRef, useState } from "react";
import { InventorySheetReplacement } from "./inventory-sheet-replacement";
import { countryName } from "../../lib/meta-ads/countries";

export type MetaReplacementScope = {
  listId: string;
  tableId: string;
  country: string;
  name: string;
  names: string[];
  since?: string;
  until?: string;
  sheetName?: string;
};
/** Hiding the native window retains the mounted proposal and every selected pair. */
export function MetaReplacementWindow({
  scope,
  onClose,
  onChanged,
  onCompleted,
}: {
  scope: MetaReplacementScope;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCompleted: (notice: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [minimized, setMinimized] = useState(false),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (minimized) ref.current?.close();
    else if (!ref.current?.open) {
      ref.current?.show();
      ref.current?.focus();
    }
  }, [minimized]);
  useEffect(() => setMinimized(false), [scope]);
  return (
    <>
      <dialog
        ref={ref}
        tabIndex={-1}
        className="meta-replacement-window"
        data-expanded={expanded || undefined}
        aria-label={`Reemplazar diplomados en ${countryName(scope.country)}`}
        onCancel={(e) => {
          e.preventDefault();
          setMinimized(true);
        }}
      >
        <header>
          <strong>Reemplazar · {countryName(scope.country)}</strong>
          <div>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              aria-label="Minimizar reemplazo"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={
                expanded
                  ? "Restaurar tamaño de reemplazo"
                  : "Maximizar reemplazo"
              }
            >
              {expanded ? "❐" : "□"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar reemplazo"
            >
              ×
            </button>
          </div>
        </header>
        <div className="meta-replacement-window-body">
          <InventorySheetReplacement
            {...scope}
            sheetName={scope.sheetName ?? "Selección de campañas"}
            since={scope.since ?? ""}
            until={scope.until ?? ""}
            source="meta"
            onClose={onClose}
            onChanged={onChanged}
            onCompleted={onCompleted}
          />
        </div>
      </dialog>
      {minimized && (
        <button
          type="button"
          className="meta-replacement-dock"
          onClick={() => setMinimized(false)}
        >
          ↗ Reemplazar · {countryName(scope.country)} · {scope.names.length}{" "}
          diplomados
        </button>
      )}
    </>
  );
}
