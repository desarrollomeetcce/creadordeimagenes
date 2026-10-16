"use client";
import { useEffect, useState } from "react";
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
}: {
  value: HierarchyValue;
  onChange: (v: HierarchyValue) => void;
  disabled?: boolean;
  onAllDates?: () => void;
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
      "/api/hierarchy/options?" +
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
  }, [value.project, value.product, value.subproduct]);
  return (
    <div className="stack hierarchy-filters">
      <div className="fields">
        <label>
          Proyecto
          <select
            aria-label="Proyecto"
            value={value.project}
            disabled={disabled || loading}
            onChange={(e) =>
              onChange({
                ...value,
                project: e.target.value,
                product: "",
                subproduct: "",
              })
            }
          >
            <option value="">Todos los proyectos disponibles</option>
            {options.canSeeTests && (
              <option value="none">Sin proyecto · pruebas de IA</option>
            )}
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Producto
          <select
            aria-label="Producto"
            value={value.product}
            disabled={
              disabled || loading || !value.project || value.project === "none"
            }
            onChange={(e) =>
              onChange({ ...value, product: e.target.value, subproduct: "" })
            }
          >
            <option value="">Todos los productos disponibles</option>
            {options.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subproducto
          <select
            aria-label="Subproducto"
            value={value.subproduct}
            disabled={disabled || loading || !value.product}
            onChange={(e) => onChange({ ...value, subproduct: e.target.value })}
          >
            <option value="">Todos los subproductos disponibles</option>
            {options.subproducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fields">
        <label>
          Desde · Lima
          <input
            type="date"
            aria-label="Desde"
            value={value.from}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
        </label>
        <label>
          Hasta · Lima
          <input
            type="date"
            aria-label="Hasta"
            value={value.to}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const parts = new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Lima",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).formatToParts(new Date()),
              get = (type: string) => parts.find((p) => p.type === type)!.value,
              today = `${get("year")}-${get("month")}-${get("day")}`;
            onChange({ ...value, from: today, to: today });
          }}
        >
          Hoy
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onAllDates?.();
            onChange({ ...value, from: "", to: "" });
          }}
        >
          Todas las fechas
        </button>
      </div>
      <p className="hint">
        Los días completos usan la hora de Lima. «Todos» incluye únicamente
        recursos que puedes consultar. Para limitar por producto, selecciona
        antes un proyecto.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
