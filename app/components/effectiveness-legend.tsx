"use client";
import { useContext, useEffect, useState } from "react";
import { CurrentUserId } from "./role-guide";
import { SheetTabColorDialog, useSheetTabColors } from "./sheet-tab-colors";
import { SheetDataFillBadge } from "./sheet-data-fill-badge";
/** Shared legend in the workspace header, above the sheet controls. */
export function EffectivenessLegend() {
  const userId = useContext(CurrentUserId),
    palette = useSheetTabColors(userId, "data");
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const keys = ["automatic", "manual", "next-day"];
    for (const key of keys) {
      const color = palette.colors[key];
      if (color) {
        root.style.setProperty(`--fill-${key}`, color);
        root.style.setProperty(
          `--fill-${key}-ink`,
          `color-mix(in srgb,${color} 45%,var(--ink))`,
        );
      }
    }
    return () => {
      for (const key of keys) {
        root.style.removeProperty(`--fill-${key}`);
        root.style.removeProperty(`--fill-${key}-ink`);
      }
    };
  }, [palette.colors]);
  const names: Record<string, string> = {
    automatic: "Automático / recibido",
    manual: "Manual · mismo día",
    "next-day": "Manual · día siguiente (BM y GM)",
  };
  return (
    <>
      <span className="sheet-legend" aria-label="Leyenda de parámetros">
        <span>
          <b>V</b> Ventas
        </span>
        <span>
          <b>P</b> Presupuesto
        </span>
        <span>
          <b>B</b> Base (Meta Ads)
        </span>
        <span>
          <b>G</b> Gasto
        </span>
        <span>
          <b>CF</b> Costos fijos
        </span>
        <span>
          <b>BM</b> Base manual
        </span>
        <span>
          <b>BC</b> Base por contactar
        </span>
        <span>
          <b>GM</b> Gasto manual
        </span>
        <span
          className="sheet-fill-legend"
          role="group"
          aria-label="Guía de colores de los datos"
        >
          <span>
            <button
              type="button"
              className="sheet-fill-edit"
              data-edit-fill="automatic"
              aria-label="Cambiar color de datos automáticos"
              title="Cambiar color"
              onClick={() => setEditing("automatic")}
            >
              <SheetDataFillBadge kind="automatic" />
            </button>{" "}
            Automático / recibido
          </span>
          <span>
            <button
              type="button"
              className="sheet-fill-edit"
              data-edit-fill="manual"
              aria-label="Cambiar color de manuales del mismo día"
              title="Cambiar color"
              onClick={() => setEditing("manual")}
            >
              <SheetDataFillBadge kind="manual" />
            </button>{" "}
            Manual · mismo día (sin color por defecto)
          </span>
          <span>
            <button
              type="button"
              className="sheet-fill-edit"
              data-edit-fill="next-day"
              aria-label="Cambiar color de manuales del día siguiente"
              title="Cambiar color"
              onClick={() => setEditing("next-day")}
            >
              <SheetDataFillBadge kind="next-day" />
            </button>{" "}
            Manual · día siguiente (BM y GM)
          </span>
        </span>
        <span className="sheet-fill-timing-note">
          BC se registra el mismo día. BM y GM se completan al día siguiente,
          para la fecha correspondiente.
        </span>
      </span>
      {palette.warning && (
        <span role="status" className="hint">
          {palette.warning}
        </span>
      )}
      {editing && (
        <SheetTabColorDialog
          key={editing}
          title="Color de los datos"
          resetLabel={editing === "manual" ? "Sin color" : "Restablecer color"}
          name={names[editing]}
          color={palette.colors[editing]}
          description="Se aplica a esta categoría en todas las tablas. Se recuerda en este navegador para tu cuenta; los fondos personalizados de columnas o reglas conservan su prioridad."
          onApply={(color) => palette.setColor(editing, color)}
          onClose={() => {
            const key = editing;
            setEditing(null);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLButtonElement>(
                  `button[data-edit-fill="${key}"]`,
                )
                ?.focus(),
            );
          }}
        />
      )}
    </>
  );
}
