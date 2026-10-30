"use client";
import { useEffect, useRef, useState } from "react";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { splitCategoryNames } from "../../lib/meta-ads/category-paste";
export type InventoryNewRowValue = {
  name: string;
  primary: string[];
  secondary: string[];
  sheets: string[];
};
export function InventoryNewRow({
  directory,
  tables,
  disabled,
  onSave,
  onCancel,
  visibleParameters = [
    "inventory",
    "primary",
    "secondary",
    "sheets",
    "syllabi",
  ],
}: {
  visibleParameters?: string[];
  directory: string[];
  tables: { id: string; name: string }[];
  disabled: boolean;
  onSave: (value: InventoryNewRowValue) => Promise<void>;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    pending = useRef(false),
    [value, setValue] = useState<InventoryNewRowValue>({
      name: "",
      primary: [],
      secondary: [],
      sheets: [],
    }),
    [error, setError] = useState("");
  useEffect(() => {
    input.current?.scrollIntoView({ block: "nearest" });
    input.current?.focus({ preventScroll: true });
  }, []);
  const save = async () => {
    if (disabled || pending.current) return;
    pending.current = true;
    setError("");
    try {
      await onSave(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
    }
  };
  const options = [
    ...new Set([...directory, ...value.primary, ...value.secondary]),
  ].sort((a, b) => a.localeCompare(b, "es"));
  return (
    <tr className="inventory-new-row" data-inventory-draft>
      <td hidden={!visibleParameters.includes("inventory")}>
        <input
          ref={input}
          aria-label="Inventario de la nueva fila"
          placeholder="Escribe el inventario…"
          value={value.name}
          maxLength={150}
          disabled={disabled}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape" && !disabled) {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <div className="inventory-draft-actions">
          <button
            type="button"
            className="primary"
            disabled={
              disabled ||
              (!value.name.trim() &&
                !value.primary.length &&
                !value.secondary.length)
            }
            onClick={() => void save()}
          >
            Guardar fila
          </button>
          <button
            type="button"
            aria-label="Cancelar nueva fila de inventario"
            title="Cancelar sin guardar"
            disabled={disabled}
            onClick={onCancel}
          >
            ×
          </button>
        </div>
        {error && <small role="alert">{error}</small>}
      </td>
      {(["primary", "secondary"] as const).map((kind) => (
        <td
          key={kind}
          hidden={
            !visibleParameters.includes(
              kind === "primary" ? "primary" : "secondary",
            )
          }
        >
          <InventoryMultiSelect
            label={
              kind === "primary"
                ? "Categorías principales de la nueva fila"
                : "Categorías secundarias de la nueva fila"
            }
            placeholder={kind === "primary" ? "+ Principal" : "+ Secundaria"}
            all={false}
            disabled={disabled}
            values={value[kind]}
            options={options.map((name) => ({ value: name, label: name }))}
            onChange={(names) => setValue((old) => ({ ...old, [kind]: names }))}
            onCreate={async (name, selected) =>
              setValue((old) => ({
                ...old,
                [kind]: [
                  ...new Set([
                    ...selected,
                    ...splitCategoryNames(
                      name,
                      kind === "secondary" ? 100 : 20,
                    ),
                  ]),
                ],
              }))
            }
            onError={setError}
          />
        </td>
      ))}
      <td hidden={!visibleParameters.includes("sheets")}>
        <InventoryMultiSelect
          label="Hojas de la nueva fila"
          placeholder="Sin hojas"
          all={false}
          disabled={disabled}
          values={value.sheets}
          options={tables.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(sheets) => setValue((old) => ({ ...old, sheets }))}
        />
      </td>
      <td
        hidden={
          !visibleParameters.includes("syllabi") || visibleParameters.length < 2
        }
        aria-hidden="true"
        className="inventory-column-gap"
      />
      <td hidden={!visibleParameters.includes("syllabi")} className="hint">
        Temarios disponibles al guardar
      </td>
    </tr>
  );
}
