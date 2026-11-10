"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { groupAvailabilityLabels } from "../../lib/meta-ads/inventory-group-availability";
import { StudioRequestError } from "../../lib/creative-studio/campaign-validation";
import { financialRequest } from "./financial-request";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import { countryOptions } from "../../lib/meta-ads/countries";
import { matchesSearchWords } from "../../lib/search";
import "./studio-workspace.css";
export async function studioRequest(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/creative-studio" + path, {
    method,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000),
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const b = await r.json();
  if (!r.ok)
    throw new StudioRequestError(
      b.error ?? "No se pudo completar la operación.",
      b.fields,
    );
  return b;
}
export function InventoryMetaPicker({
  directory: sourceDirectory,
  initialCountry = "",
  onClose,
  onChoose,
}: {
  directory: TrialDirectory;
  initialCountry?: string;
  onClose: () => void;
  onChoose?: (ids: string[], country: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [selected, setSelected] = useState<string[]>([]),
    [q, setQ] = useState(""),
    [category, setCategory] = useState(""),
    [group, setGroup] = useState(""),
    [country, setCountry] = useState(initialCountry),
    [count, setCount] = useState(10),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selectionId, setSelectionId] = useState(""),
    [expanded, setExpanded] = useState(false),
    [page, setPage] = useState(1);
  const [enriched, setEnriched] = useState<{
    base: TrialDirectory;
    value: TrialDirectory;
  } | null>(null);
  const directory =
    enriched?.base === sourceDirectory ? enriched.value : sourceDirectory;
  const labels = useMemo(
    () => groupAvailabilityLabels(directory, country),
    [directory, country],
  );
  useEffect(() => {
    if (
      !country ||
      sourceDirectory.usageReady !== false ||
      enriched?.base === sourceDirectory
    )
      return;
    let alive = true;
    void financialRequest(
      "meta-ads/inventory/trials?" +
        new URLSearchParams({ listId: sourceDirectory.listId, mode: "usage" }),
    )
      .then((data: TrialDirectory) => {
        if (alive)
          setEnriched({
            base: sourceDirectory,
            value: {
              ...sourceDirectory,
              usage: data.usage,
              countries: data.countries,
              campaignStates: data.campaignStates,
              usageReady: true,
            },
          });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [sourceDirectory, !!country]);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const categories = useMemo(
    () =>
      [...new Set(directory.catalog.flatMap((i) => i.primaryNames))].sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [directory.catalog],
  );
  const rows = useMemo(() => {
    const members = group
      ? new Set(
          directory.groups
            .find((g) => g.id === group)
            ?.members.map((m) => m.itemId),
        )
      : null;
    return directory.catalog.filter(
      (i) =>
        (!members || members.has(i.id)) &&
        (!category || i.primaryNames.includes(category)) &&
        matchesSearchWords(i.name + " " + i.primaryNames.join(" "), q),
    );
  }, [directory, q, category, group]);
  const visible = rows.slice((page - 1) * 50, page * 50),
    chosen = new Set(selected);
  function toggle(id: string) {
    setSelectionId("");
    setSelected((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(0, 100),
    );
  }
  async function save(go: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (onChoose) {
        await onChoose(selected, country);
        return;
      }
      const saved = selectionId
        ? { id: selectionId }
        : await studioRequest("/selections", "POST", {
            listId: directory.listId,
            country,
            itemIds: selected,
          });
      setSelectionId(saved.id);
      if (go)
        window.location.assign(
          "?" + new URLSearchParams({ view: "projects", selection: saved.id }),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={"studio-inventory-dialog" + (expanded ? " fullscreen" : "")}
      data-expanded={expanded}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="studio-eyebrow">INVENTARIO · ANUNCIOS META</span>
          <h2>Elige tus próximos diplomados</h2>
        </div>
        <div className="row">
          <button type="button" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Restaurar" : "Ampliar"}
          </button>
          <button
            type="button"
            className="ui-close-button"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar selección de inventario"
          >
            ×
          </button>
        </div>
      </header>
      <div className="studio-picker-filters">
        <input
          aria-label="Buscar diplomados para anuncios"
          placeholder="Buscar diplomado o categoría…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Categoría del inventario"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Grupo del inventario"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los grupos</option>
          {directory.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {labels.get(g.id) ?? g.name}
            </option>
          ))}
        </select>
        <select
          aria-label="País de los anuncios"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setSelectionId("");
          }}
        >
          <option value="">Selecciona el país</option>
          {countryOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="studio-picker-actions">
        <label>
          Cantidad
          <input
            type="number"
            min="1"
            max="100"
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
            }
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const shuffled = [...rows];
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            setSelected(shuffled.slice(0, count).map((i) => i.id));
            setSelectionId("");
          }}
        >
          ✦ {category ? "Azar por categoría" : "Elegir al azar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected((p) =>
              [...new Set([...p, ...rows.map((r) => r.id)])].slice(0, 100),
            );
            setSelectionId("");
          }}
        >
          Seleccionar resultados
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected([]);
            setSelectionId("");
          }}
        >
          Limpiar selección
        </button>
        <strong>{selected.length} seleccionados</strong>
      </div>
      <div className="studio-picker-table">
        <table>
          <thead>
            <tr>
              <th>Elegir</th>
              <th>Diplomado</th>
              <th>Categorías</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id} data-selected={chosen.has(i.id)}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={"Seleccionar " + i.name}
                    checked={chosen.has(i.id)}
                    onChange={() => toggle(i.id)}
                  />
                </td>
                <td>
                  <strong>{i.name}</strong>
                </td>
                <td>
                  {i.primaryNames.join(" · ")}
                  {i.secondaryNames?.length ? (
                    <small>{i.secondaryNames.join(" · ")}</small>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="studio-empty-small">
            No hay coincidencias con esos filtros.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {selectionId && (
        <p role="status" className="studio-saved">
          ✓ Selección guardada. Puedes abrir el estudio cuando quieras.
        </p>
      )}
      <footer>
        <span>{rows.length} disponibles</span>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil(rows.length / 50))}
        </span>
        <button
          type="button"
          disabled={page * 50 >= rows.length}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </button>
        <div className="studio-footer-spacer" />
        <button
          type="button"
          disabled={busy || !selected.length || !country}
          onClick={() => void save(false)}
        >
          {onChoose ? "Añadir al producto" : "Guardar selección"}
        </button>
        {!onChoose && (
          <button
            type="button"
            className="primary"
            disabled={busy || !selected.length || !country}
            onClick={() => void save(true)}
          >
            Ir a Anuncios Meta IA →
          </button>
        )}
      </footer>
    </dialog>
  );
}
