"use client";
import { useEffect, useState, type ReactNode } from "react";
import { SearchSelect } from "./search-select";
import { DateRange } from "./date-range";
export type HierarchyValue = {
  project: string;
  product: string;
  subproduct: string;
  from: string;
  to: string;
};
export const emptyHierarchy: HierarchyValue = {
  project: "",
  product: "",
  subproduct: "",
  from: "",
  to: "",
};
export function hierarchyFromLocation(): HierarchyValue {
  if (typeof window === "undefined") return { ...emptyHierarchy };
  const p = new URLSearchParams(window.location.search);
  return Object.fromEntries(
    Object.keys(emptyHierarchy).map((k) => [k, p.get(k) ?? ""]),
  ) as HierarchyValue;
}
export function costLink(value: Partial<HierarchyValue>) {
  return "?" + new URLSearchParams({ view: "usage", ...value });
}
export function HierarchyFilters({
  value,
  onChange,
  disabled = false,
  onAllDates,
  dateSummary, library=false,
}: {
  value: HierarchyValue;
  onChange: (v: HierarchyValue) => void;
  disabled?: boolean;
  onAllDates?: () => void;
  dateSummary?: ReactNode;
  library?:boolean;
}) {
  const [options, setOptions] = useState<{
    projects: { id: string; name: string }[];
    products: { id: string; name: string }[];
    subproducts: { id: string; name: string }[];
    canSeeTests: boolean;
  }>({ projects: [], products: [], subproducts: [], canSeeTests: false });
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    void fetch(
      (library?"/api/library/hierarchy?":"/api/hierarchy/options?") +
        new URLSearchParams({
          project: value.project,
          product: value.product,
          subproduct: value.subproduct,
        }),
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error ?? "No se pudo consultar la jerarquía.");
        if (active) {
          setOptions(b);
          setError("");
        }
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [value.project, value.product, value.subproduct,library]);
  return (
    <div className="stack hierarchy-filters">
      <div className="fields">
        <HierarchyPicker
          label="Proyecto"
          selected={value.project}
          options={[
            { id: "", name: "Todos los proyectos" },
            ...(options.canSeeTests ? [{ id: "none", name: "Pruebas" }] : []),
            ...options.projects,
          ]}
          disabled={disabled || loading}
          onSelect={(id) =>
            onChange({ ...value, project: id, product: "", subproduct: "" })
          }
        />
        <HierarchyPicker
          label="Producto"
          selected={value.product}
          options={[
            { id: "", name: "Todos los productos" },
            ...options.products,
          ]}
          disabled={
            disabled || loading || !value.project || value.project === "none"
          }
          onSelect={(id) => onChange({ ...value, product: id, subproduct: "" })}
        />
        <HierarchyPicker
          label="Subproducto"
          selected={value.subproduct}
          options={[
            { id: "", name: "Todos los subproductos" },
            ...options.subproducts,
          ]}
          disabled={disabled || loading || !value.product}
          onSelect={(id) => onChange({ ...value, subproduct: id })}
        />
      </div>
      <div className="date-with-summary">
      <DateRange
        from={value.from}
        to={value.to}
        disabled={disabled}
        onChange={(from, to) => {
          onChange({ ...value, from, to });
          if (!from && !to) onAllDates?.();
        }}
      />
      {dateSummary}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function HierarchyPicker({
  label,
  selected,
  options,
  disabled,
  onSelect,
}: {
  label: string;
  selected: string;
  options: { id: string; name: string }[];
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const name = options.find((o) => o.id === selected)?.name ?? "";
  const [query, setQuery] = useState(name);
  useEffect(() => setQuery(name), [selected, name]);
  return (
    <SearchSelect
      label={label}
      value={query}
      onChange={setQuery}
      onSelect={(o) => {
        setQuery(o.label);
        onSelect(o.id);
      }}
      browseOnToggle
      disabled={disabled}
      options={options.map((o) => ({ id: o.id, label: o.name }))}
    />
  );
}
