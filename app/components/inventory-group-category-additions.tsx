"use client";
import { useEffect, useRef, useState } from "react";
import type { TrialItem } from "../../lib/meta-ads/inventory-trial-policy";
import { categoryAdditionSections } from "../../lib/meta-ads/inventory-group-addition-policy";
import { matchesSearchWords } from "../../lib/search";
import { SheetSearchSelect } from "./sheet-search-select";
export function InventoryGroupCategoryAdditions({
  items,
  selectedIds,
  mode,
  count,
  onCount,
  onToggle,
  onReview,
  onRandom,
  onClose,
}: {
  items: TrialItem[];
  selectedIds: string[];
  mode: "ADD" | "RANDOM";
  count: number;
  onCount: (count: number) => void;
  onToggle: (id: string) => void;
  onReview: () => void;
  onRandom: (category: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState(""),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
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
    <dialog
      ref={ref}
      className="trial-dialog inventory-group-category-additions"
      data-expanded={expanded || undefined}
      aria-label={
        mode === "ADD" ? "Añadir por categoría" : "Al azar por categoría"
      }
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h3>
          {mode === "ADD" ? "Añadir por categoría" : "Al azar por categoría"}
        </h3>
        <button type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Restaurar" : "Maximizar"}
        </button>
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
        {mode === "RANDOM" && (
          <label>
            Cantidad
            <input
              type="number"
              min={1}
              max={100}
              aria-label="Cantidad al azar por categoría"
              value={count}
              onChange={(event) => onCount(Number(event.target.value))}
            />
          </label>
        )}
      </div>
      {mode === "ADD" && selected.length > 0 && (
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
                    {mode === "ADD" && (
                      <input
                        type="checkbox"
                        aria-label={`Preparar para añadir ${item.name}`}
                        checked={selectedIds.includes(item.id)}
                        onChange={() => onToggle(item.id)}
                      />
                    )}
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
          Se conservan los elegidos al cambiar o limpiar la categoría.
        </small>
        <button type="button" onClick={onClose}>
          Listo
        </button>
        {mode === "ADD" ? (
          <button
            type="button"
            className="primary"
            disabled={!selected.length}
            onClick={onReview}
          >
            Añadir ({selected.length})
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={
              !category || !Number.isInteger(count) || count < 1 || count > 100
            }
            onClick={() => onRandom(category)}
          >
            Ver propuesta
          </button>
        )}
      </footer>
    </dialog>
  );
}
