"use client";
import { useRef, useEffect, useState } from "react";
import type { InventorySyllabus } from "../../lib/meta-ads/inventory-syllabi-policy";
type Metadata = Pick<InventorySyllabus, "id" | "title" | "scope">;
export function InventorySyllabusChips({
  syllabi,
  label,
  disabled = false,
  onOpen,
  onRename,
  onRemove,
  onAdd,
}: {
  syllabi: Metadata[];
  label: string;
  disabled?: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void> | void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(
      null,
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing?.id]);
  async function save() {
    if (!editing || saving) return;
    const title = editing.title.trim();
    if (!title || title.length > 100) {
      setError("Escribe un nombre de hasta 100 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onRename(editing.id, title);
      setEditing(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cambiar el nombre.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="inventory-syllabus-controls">
      <div className="inventory-syllabus-toolbar">
        <div
          className="inventory-syllabi-chips"
          aria-label={`Temarios de ${label}`}
        >
          {syllabi.map((s) => (
            <span className="inventory-syllabus-chip" key={s.id}>
              {editing?.id === s.id ? (
                <>
                  <input
                    ref={input}
                    aria-label={`Nombre del temario ${s.title} de ${label}`}
                    maxLength={100}
                    value={editing.title}
                    disabled={disabled || saving}
                    onChange={(e) =>
                      setEditing({ ...editing, title: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        void save();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!saving) {
                          setEditing(null);
                          setError("");
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Guardar nombre del temario de ${label}`}
                    title="Guardar nombre · Enter"
                    disabled={disabled || saving}
                    onClick={() => void save()}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    aria-label={`Cancelar nombre del temario de ${label}`}
                    title="Cancelar · Escape"
                    disabled={saving}
                    onClick={() => {
                      setEditing(null);
                      setError("");
                    }}
                  >
                    ×
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={disabled || saving || !!editing}
                    onClick={() => onOpen(s.id)}
                    title={`Abrir contenido: ${s.title} · ${s.scope}`}
                  >
                    {s.title}
                  </button>
                  <button
                    type="button"
                    className="inventory-syllabus-pencil"
                    aria-label={`Cambiar nombre de ${s.title} de ${label}`}
                    title="Cambiar nombre"
                    disabled={disabled || saving || !!editing}
                    onClick={() => {
                      setError("");
                      setEditing({ id: s.id, title: s.title });
                    }}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      width="12"
                      height="12"
                      aria-hidden="true"
                    >
                      <path
                        d="m3 10 7-7 3 3-7 7-4 1Z M9 4l3 3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="inventory-remove"
                    aria-label={`Eliminar temario ${s.title} de ${label}`}
                    title="Eliminar este temario"
                    disabled={disabled || saving || !!editing}
                    onClick={() => onRemove(s.id)}
                  >
                    ×
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="inventory-add-syllabus"
          aria-label={`Añadir temario a ${label}`}
          title="Añadir otro temario"
          disabled={disabled || saving || !!editing || syllabi.length >= 50}
          onClick={onAdd}
        >
          +
        </button>
      </div>
      {error && (
        <small role="alert" className="inventory-syllabus-error">
          {error}
        </small>
      )}
    </div>
  );
}
