"use client";
import "./studio-inventory-slots.css";
import { groupAvailabilityLabels } from "../../lib/meta-ads/inventory-group-availability";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { countryName, isCountryCode } from "../../lib/meta-ads/countries";
import {
  groupReplacementCandidates,
  type ReplacementUsageFilter,
} from "../../lib/meta-ads/inventory-replacement-groups";
import { fillInventorySlots } from "../../lib/creative-studio/inventory-slots";
import { financialRequest } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";

export function StudioInventorySlots({
  listId,
  country,
  existingNames,
  predefined,
  disabled,
  focusRequest,
  loadDirectory,
  onChoose,
  manual = false,
}: {
  manual?: boolean;
  listId: string;
  country: string;
  existingNames: string[];
  predefined: boolean;
  disabled: boolean;
  focusRequest: number;
  loadDirectory: (id: string) => Promise<TrialDirectory>;
  onChoose: (ids: string[]) => Promise<boolean>;
}) {
  const start = predefined || existingNames.length ? "" : "3";
  const [quantity, setQuantity] = useState(start),
    [slots, setSlots] = useState<string[]>(() => (start ? ["", "", ""] : [])),
    [directory, setDirectory] = useState<TrialDirectory | null>(null),
    [loading, setLoading] = useState(false),
    [usageLoading, setUsageLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [group, setGroup] = useState(""),
    [usage, setUsage] = useState<ReplacementUsageFilter>("ALL"),
    [category, setCategory] = useState(""),
    [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    usagePending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const count = Number(quantity),
    valid = Number.isInteger(count) && count >= 1 && count <= 100,
    enabled = valid && !!listId;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    setError("");
    void loadDirectory(listId)
      .then((d) => {
        if (alive) setDirectory(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [listId, enabled, loadDirectory, retry]);
  useLayoutEffect(() => {
    if (!focusRequest) return;
    if (!quantity) {
      setQuantity("3");
      setSlots(["", "", ""]);
    }
    const frame = requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
      input.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);
  const available = useMemo(() => {
    if (!directory) return [];
    const existing = new Set(existingNames.map(categoryKey));
    return directory.catalog.filter((i) => !existing.has(categoryKey(i.name)));
  }, [directory, JSON.stringify(existingNames)]);
  const categories = useMemo(
    () =>
      [
        ...new Set(
          available.flatMap((i) => [
            ...i.primaryNames,
            ...(i.secondaryNames ?? []),
          ]),
        ),
      ].sort((a, b) => a.localeCompare(b, "es")),
    [available],
  );
  const candidates = useMemo(
    () =>
      directory
        ? groupReplacementCandidates(
            available,
            directory,
            country,
            group,
            usage,
          ).filter(
            (i) =>
              !category ||
              [...i.primaryNames, ...(i.secondaryNames ?? [])].some(
                (c) => categoryKey(c) === categoryKey(category),
              ),
          )
        : [],
    [directory, available, country, group, usage, category],
  );
  const selected = slots.filter(Boolean),
    ready =
      valid && selected.length === count && new Set(selected).size === count;
  const unpicked = candidates.filter((i) => !selected.includes(i.id));
  const groupLabels = useMemo(
    () =>
      directory
        ? groupAvailabilityLabels(directory, country)
        : new Map<string, string>(),
    [directory, country],
  );
  useEffect(() => {
    if (directory?.usageReady === false && isCountryCode(country))
      void changeUsage(usage, true);
  }, [directory, listId, country]);
  const blocked =
    disabled || loading || (usageLoading && usage !== "ALL") || saving;
  async function changeUsage(value: ReplacementUsageFilter, forCounts = false) {
    setUsage(value);
    setError("");
    if (
      (value === "ALL" && !forCounts) ||
      !directory ||
      directory.usageReady !== false ||
      usagePending.current
    )
      return;
    usagePending.current = true;
    setUsageLoading(true);
    try {
      const data: TrialDirectory = await financialRequest(
        "meta-ads/inventory/trials?" +
          new URLSearchParams({ listId, mode: "usage" }),
      );
      if (mounted.current)
        setDirectory((d) =>
          d
            ? {
                ...d,
                usage: data.usage,
                countries: data.countries,
                campaignStates: data.campaignStates,
                usageReady: true,
              }
            : d,
        );
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        setUsage("ALL");
      }
    } finally {
      usagePending.current = false;
      if (mounted.current) setUsageLoading(false);
    }
  }
  function randomize(all: boolean) {
    setError("");
    setSlots((current) =>
      fillInventorySlots(
        current,
        candidates.map((i) => i.id),
        all,
      ),
    );
  }
  async function choose() {
    if (!ready || blocked) return;
    setSaving(true);
    setError("");
    try {
      if (await onChoose([...selected])) {
        if (mounted.current) {
          setQuantity("");
          setSlots([]);
        }
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <section
      className="studio-inventory-slots"
      aria-label="Elegir del inventario sin ventana emergente"
      aria-busy={loading || saving}
    >
      {predefined && !quantity ? (
        <button
          type="button"
          className="studio-slot-more"
          disabled={disabled || !listId}
          onClick={() => {
            setQuantity("3");
            setSlots(["", "", ""]);
            requestAnimationFrame(() => input.current?.focus());
          }}
        >
          ＋ Elegir más del inventario
        </button>
      ) : (
        <label className="studio-slot-quantity">
          ¿Cuántos del inventario quieres preparar?
          <input
            ref={input}
            aria-label="Cantidad del inventario"
            type="number"
            min="1"
            max="100"
            step="1"
            onFocus={(e) => e.currentTarget.select()}
            inputMode="numeric"
            placeholder="Ej. 4"
            value={quantity}
            disabled={disabled || saving || !listId}
            aria-invalid={(!!quantity && !valid) || undefined}
            onChange={(e) => {
              const value = e.target.value;
              setQuantity(value);
              setError("");
              const n = Number(value);
              if (Number.isInteger(n) && n >= 1 && n <= 100)
                setSlots((current) =>
                  Array.from({ length: n }, (_, i) => current[i] ?? ""),
                );
              else if (!value) setSlots([]);
            }}
          />
        </label>
      )}
      {quantity && !valid && (
        <small role="alert">Elige una cantidad entre 1 y 100.</small>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
          {!directory && (
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              Reintentar
            </button>
          )}
        </p>
      )}
      {enabled && (
        <>
          <fieldset
            className="studio-slot-scope"
            disabled={blocked || !directory}
          >
            <legend>Por grupo y uso · {countryName(country)}</legend>
            <select
              aria-label="Grupo de la selección"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Todos los grupos</option>
              {directory?.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {groupLabels.get(g.id) ?? g.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Uso de la selección en el país"
              value={usage}
              disabled={blocked || !directory || !isCountryCode(country)}
              onChange={(e) =>
                void changeUsage(e.target.value as ReplacementUsageFilter)
              }
            >
              <option value="ALL">Todos los usos</option>
              <option value="UNUSED">Sin usar en {countryName(country)}</option>
              <option value="USED">Usados en {countryName(country)}</option>
            </select>
          </fieldset>
          <SheetSearchSelect
            label="Categoría de la selección"
            value={category}
            placeholder="Por categoría"
            disabled={blocked || !directory}
            options={[
              { value: "", label: "Todas las categorías" },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
            onSelect={setCategory}
          />
          <div className="studio-slot-random">
            <button
              type="button"
              disabled={blocked || !unpicked.length || ready}
              onClick={() => randomize(false)}
              title="Completa el siguiente espacio vacío respetando grupo, uso y categoría"
            >
              Al azar
            </button>
            <button
              type="button"
              disabled={blocked || !unpicked.length || ready}
              onClick={() => randomize(true)}
              title="Completa todos los espacios vacíos sin cambiar tus elecciones"
            >
              {category ? "Azar por categoría" : "Completar al azar"}
            </button>
          </div>
          <div className="studio-slot-progress" role="status">
            <strong>
              {selected.length} de {count} seleccionados
            </strong>
            <small>
              {loading
                ? "Preparando inventario…"
                : usageLoading
                  ? "Consultando uso…"
                  : `${unpicked.length} disponibles con estos filtros`}
            </small>
          </div>
          <div className="studio-slot-list">
            {slots.map((value, index) => (
              <div className="studio-slot" key={index}>
                <span aria-hidden="true">{index + 1}</span>
                <SheetSearchSelect
                  label={`Nombre del inventario ${index + 1}`}
                  value={value}
                  placeholder="Busca por nombre…"
                  disabled={blocked || !directory}
                  options={(value
                    ? [
                        directory?.catalog.find((i) => i.id === value),
                        ...candidates.filter((i) => i.id !== value),
                      ]
                    : candidates
                  )
                    .filter(
                      (i): i is NonNullable<typeof i> =>
                        !!i &&
                        !slots.some((id, n) => n !== index && id === i.id),
                    )
                    .map((i) => ({ value: i.id, label: i.name }))}
                  onSelect={(id) =>
                    setSlots((current) =>
                      current.map((v, n) => (n === index ? id : v)),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`Limpiar espacio ${index + 1}`}
                  disabled={!value || blocked}
                  onClick={() =>
                    setSlots((current) =>
                      current.map((v, n) => (n === index ? "" : v)),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {!loading &&
            directory &&
            unpicked.length < count - selected.length && (
              <small className="studio-slot-help">
                Si no alcanzan, cambia los filtros o elige otro grupo. Tus
                elecciones se conservan.
              </small>
            )}
          <button
            type="button"
            className="studio-slot-apply"
            disabled={!ready || blocked}
            onClick={() => void choose()}
          >
            {saving
              ? "Añadiendo…"
              : `Usar ${count} ${count === 1 ? "seleccionado" : "seleccionados"}`}
          </button>
          <small className="studio-slot-help">
            {manual
              ? "Elige tus diplomados y sube los recursos en la columna central."
              : "Elegir no genera imágenes. Usa «Generar» cuando estés listo."}
          </small>
        </>
      )}
    </section>
  );
}
