"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
const valid = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
export function useSheetTabColors(userId: string, scope = "tab") {
  const key = `effectiveness-${scope}-colors:v1:${userId}`;
  const [state, setState] = useState<{
    key: string;
    colors: Record<string, string>;
  }>({ key: "", colors: {} });
  const [warning, setWarning] = useState("");
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) || "{}");
      const colors: Record<string, string> = {};
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        for (const [id, c] of Object.entries(raw).slice(0, 1000))
          if (
            id.length <= 100 &&
            (valid(c) || (scope === "data" && c === "none"))
          )
            colors[id] = c;
      setState({ key, colors });
      setWarning("");
    } catch {
      setState({ key, colors: {} });
      setWarning("No se pudieron recuperar los colores de las pestañas.");
    }
  }, [key, scope]);
  const colors = state.key === key ? state.colors : {};
  const setColor = (id: string, color?: string) => {
    if (
      color !== undefined &&
      !valid(color) &&
      !(scope === "data" && color === "none")
    )
      return;
    const next = { ...colors };
    if (color) next[id] = color;
    else delete next[id];
    setState({ key, colors: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setWarning("");
    } catch {
      setWarning(
        "El color cambió solo para esta sesión: el navegador impide guardarlo.",
      );
    }
  };
  const style = (id: string): CSSProperties | undefined => {
    const color = colors[id];
    if (!color) return;
    const rgb = [1, 3, 5].map((i) => {
      const x = parseInt(color.slice(i, i + 2), 16) / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    const l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    return {
      backgroundColor: color,
      color: l > 0.179 ? "#000000" : "#ffffff",
      borderColor: color,
    };
  };
  return { colors, setColor, style, warning };
}
const palette = [
  ["Verde", "#176b59"],
  ["Azul", "#276699"],
  ["Morado", "#594185"],
  ["Ámbar", "#a56a16"],
  ["Rosa", "#a53060"],
  ["Rojo", "#9d2941"],
  ["Turquesa", "#167b84"],
  ["Gris", "#536573"],
] as const;
export function SheetTabColorDialog({
  name,
  color,
  onApply,
  onClose,
  onClear,
  title = "Color de pestaña",
  resetLabel = "Restablecer color",
  description = "Se recuerda en este navegador para tu cuenta. La pestaña abierta conserva una marca de selección.",
}: {
  onClear?: () => void;
  resetLabel?: string;
  title?: string;
  description?: string;
  name: string;
  color?: string;
  onApply: (color?: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [draft, setDraft] = useState(valid(color) ? color : "#276699");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sheet-tab-color-dialog"
      aria-labelledby="sheet-tab-color-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="sheet-tab-color-heading">
        <h2 id="sheet-tab-color-title">{title}</h2>
        <button type="button" className="detail-close" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <p>{name}</p>
      {color === "none" && <p className="hint">Sin color aplicado</p>}
      <div
        className="sheet-tab-color-swatches"
        role="group"
        aria-label="Colores de pestaña"
      >
        {palette.map(([label, value]) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={draft.toLowerCase() === value}
            style={{ backgroundColor: value }}
            onClick={() => setDraft(value)}
          >
            {draft.toLowerCase() === value ? "✓" : ""}
          </button>
        ))}
      </div>
      <label className="sheet-tab-color-custom">
        Personalizado{" "}
        <input
          type="color"
          aria-label="Color personalizado de pestaña"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <input
          aria-label="Código hexadecimal del color"
          maxLength={7}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <p className="hint">{description}</p>
      <div className="sheet-tab-color-actions">
        <button
          type="button"
          className="primary"
          disabled={!valid(draft)}
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          Aplicar color
        </button>
        {onClear && (
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            Sin color
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onApply();
            onClose();
          }}
        >
          {resetLabel}
        </button>
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </dialog>
  );
}
