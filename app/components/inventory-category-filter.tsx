"use client";
import { InventoryMultiSelect } from "./inventory-multi-select";
import type { SheetOption } from "./sheet-search-select";
export function InventoryCategoryFilter({
  label,
  options,
  values,
  onChange,
  onCreate,
  onError,
  disabled,
}: {
  label: string;
  options: SheetOption[];
  values: string[];
  onChange: (values: string[]) => void;
  onCreate: (name: string) => Promise<void>;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="inventory-category-filter">
      <InventoryMultiSelect
        label={label}
        placeholder="Todas las categorías"
        options={options}
        values={values}
        onChange={onChange}
        onCreate={onCreate}
        createLabel="Añadir categoría"
        onError={onError}
        disabled={disabled}
        description="Selecciona una o varias categorías. Se muestran los inventarios de cualquiera de ellas, sin duplicados."
      />
      {!!values.length && (
        <div
          className="inventory-category-filter-chips"
          aria-label={`Categorías seleccionadas: ${label}`}
        >
          {values.map((value) => (
            <span key={value}>
              {options.find((o) => o.value === value)?.label ?? value}
              <button
                type="button"
                aria-label={`Quitar categoría ${options.find((o) => o.value === value)?.label ?? value}`}
                disabled={disabled}
                onClick={() => onChange(values.filter((v) => v !== value))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
