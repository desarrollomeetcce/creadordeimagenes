"use client";
import { useEffect, useRef, useState } from "react";
import type { TrialItem } from "../../lib/meta-ads/inventory-trial-policy";
import { categoryAdditionSections } from "../../lib/meta-ads/inventory-group-addition-policy";
import { matchesSearchWords } from "../../lib/search";
import { SheetSearchSelect } from "./sheet-search-select";
export function InventoryGroupCategoryAdditions({
  items,
  selectedIds,
  initialCategory,
  onToggle,
  onClose,
}: {
  items: TrialItem[];
  selectedIds: string[];
  initialCategory: string;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState(initialCategory),
    [query, setQuery] = useState(""),
    [position, setPosition] = useState({ left: 12, top: 12 });
  useEffect(() => {
    const place = () => {
      const anchor = document
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Añadir categoría"]',
        )
        ?.getBoundingClientRect();
      const width = Math.min(560, innerWidth - 24),
        height = Math.min(
          ref.current?.getBoundingClientRect().height || 420,
          innerHeight - 24,
        );
      setPosition({
        left: Math.max(
          12,
          Math.min(anchor?.left ?? 12, innerWidth - width - 12),
        ),
        top: Math.max(
          12,
          Math.min((anchor?.bottom ?? 8) + 4, innerHeight - height - 12),
        ),
      });
    };
    if (ref.current && !ref.current.matches(":popover-open"))
      ref.current.showPopover();
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);
  const categories = [
    ...new Set(
      items.flatMap((item) => [
        ...item.primaryNames,
        ...(item.secondaryNames ?? []),
      ]),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const sections = categoryAdditionSections(
    items.filter((item) => matchesSearchWords(item.name, query)),
    category,
  );
  const selected = items.filter((item) => selectedIds.includes(item.id));
  return (
    <div
      popover="auto"
      role="region"
      ref={ref}
      className="trial-dialog inventory-group-category-additions inventory-group-category-popover"
      style={position}
      aria-label="Añadir categoría"
      onToggle={(event) => {
        if (event.target === event.currentTarget && event.newState === "closed")
          onClose();
      }}
    >
      <header>
        <h3>Añadir categoría</h3>
        <button
          type="button"
          className="ui-close-button"
          aria-label="Cerrar categorías para añadir"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="inventory-group-category-add-controls">
        <SheetSearchSelect
          label="Categoría para añadir diplomados"
          value={category}
          placeholder="Elegir categoría…"
          options={[
            { value: "", label: "Todas las categorías" },
            ...categories.map((name) => ({ value: name, label: name })),
          ]}
          onSelect={(value) => {
            setCategory(value);
            setQuery("");
          }}
        />
        <input
          type="search"
          aria-label="Buscar diplomados de la categoría"
          placeholder="Buscar diplomado…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {selected.length > 0 && (
        <div className="inventory-group-addition-chips">
          <strong>Añadir: {selected.length}</strong>
          {selected.map((item) => (
            <span className="inventory-group-selection-chip" key={item.id}>
              <span title={item.name}>{item.name}</span>
              <button
                type="button"
                aria-label={`Quitar de añadir ${item.name}`}
                onClick={() => onToggle(item.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="inventory-group-category-add-list">
        {[
          {
            label: category ? "Principales" : "Diplomados disponibles",
            items: sections.primary,
          },
          { label: "Secundarias", items: sections.secondary },
        ].map(
          (section) =>
            (category || section.items.length > 0) && (
              <section key={section.label}>
                <h4>
                  {section.label} <small>{section.items.length}</small>
                </h4>
                {section.items.map((item) => (
                  <label
                    className="inventory-group-category-add-item"
                    key={item.id}
                  >
                    {
                      <input
                        type="checkbox"
                        aria-label={`Preparar para añadir ${item.name}`}
                        checked={selectedIds.includes(item.id)}
                        onChange={() => onToggle(item.id)}
                      />
                    }
                    <span>{item.name}</span>
                  </label>
                ))}
                {!section.items.length && <p>Sin diplomados disponibles.</p>}
              </section>
            ),
        )}
      </div>
      <footer>
        <small>
          Los elegidos se preparan en Añadir, sin modificar el grupo.
        </small>
        <button type="button" onClick={onClose}>
          Listo
        </button>
      </footer>
    </div>
  );
}
