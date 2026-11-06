"use client";
import { useEffect, useRef, useState } from "react";
import { studioRequest } from "./inventory-meta-picker";
export type CampaignParentOption = {
  id: string;
  name: string;
  objective?: string;
  supported?: boolean;
  campaignId?: string;
  dailyBudget?: string | null;
  lifetimeBudget?: string | null;
  specialCategories?: string[];
  destination?: string;
  optimizationGoal?: string;
  targeting?: Record<string, any>;
  pageId?: string;
  placementSoftOptOut?: Record<string, string[]>;
};
export function StudioCampaignParentPicker({
  kind,
  accountId,
  campaignId,
  selected,
  onSelect,
  onCreate,
  disabled = false,
}: {
  kind: "campaigns" | "adsets";
  accountId: string;
  campaignId?: string;
  selected: CampaignParentOption[];
  onSelect: (rows: CampaignParentOption[]) => void;
  onCreate: () => void;
  disabled?: boolean;
}) {
  const [searchMode, setSearchMode] = useState(selected.length > 0),
    [query, setQuery] = useState(""),
    [rows, setRows] = useState<CampaignParentOption[]>([]),
    [after, setAfter] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    setRows([]);
    setAfter(null);
    setError("");
    setLoading(false);
  }, [accountId, campaignId]);
  useEffect(() => () => controller.current?.abort(), []);
  async function search(more = false) {
    if (loading || !accountId) return;
    const run = ++generation.current;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        kind,
        ...(query.trim() ? { q: query.trim() } : {}),
        ...(kind === "adsets" && campaignId ? { campaignId } : {}),
        ...(more && after ? { after } : {}),
      });
      const result = await studioRequest(
        "/campaign-directory/" + accountId + "?" + params,
        "GET",
        undefined,
        c.signal,
      );
      if (run !== generation.current) return;
      setRows((old) =>
        more
          ? [
              ...old,
              ...result.items.filter(
                (n: any) => !old.some((o) => o.id === n.id),
              ),
            ]
          : result.items,
      );
      setAfter(result.after);
      if (!result.items.length)
        setError(
          "No se encontraron " +
            (kind === "campaigns" ? "campañas" : "conjuntos") +
            " activos en esta búsqueda.",
        );
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "No se pudo consultar Meta.");
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }
  const title = kind === "campaigns" ? "Campaña" : "Conjuntos de anuncios";
  return (
    <section className="studio-parent-picker" aria-label={"Destino · " + title}>
      <div className="studio-choice-switch">
        <button
          type="button"
          aria-pressed={!searchMode}
          disabled={disabled}
          onClick={() => {
            setSearchMode(false);
            onCreate();
          }}
        >
          ＋ Crear {kind === "campaigns" ? "campaña" : "conjuntos"}
        </button>
        <button
          type="button"
          aria-pressed={searchMode}
          disabled={
            disabled || !accountId || (kind === "adsets" && !campaignId)
          }
          onClick={() => setSearchMode(true)}
        >
          ⌕ Buscar {kind === "campaigns" ? "campaña" : "conjuntos"}
        </button>
      </div>
      {searchMode && (
        <div className="studio-parent-search">
          <div className="studio-query-row">
            <input
              aria-label={
                "Buscar " + (kind === "campaigns" ? "campañas" : "conjuntos")
              }
              value={query}
              placeholder="Nombre en Meta…"
              maxLength={80}
              disabled={disabled || loading}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => void search()}
            >
              {loading ? "Buscando…" : "Buscar"}
            </button>
          </div>
          {!!selected.length && (
            <div className="studio-parent-selected">
              {selected.map((v) => (
                <span key={v.id}>✓ {v.name}</span>
              ))}
            </div>
          )}
          {!!rows.length && (
            <div className="studio-parent-results">
              {rows.map((row) => (
                <label key={row.id}>
                  <input
                    type={kind === "campaigns" ? "radio" : "checkbox"}
                    name={"studio-parent-" + kind}
                    checked={selected.some((v) => v.id === row.id)}
                    disabled={
                      disabled ||
                      row.supported === false ||
                      (!selected.some((v) => v.id === row.id) &&
                        selected.length >= 10 &&
                        kind === "adsets")
                    }
                    onChange={(e) =>
                      onSelect(
                        kind === "campaigns"
                          ? [row]
                          : e.target.checked
                            ? [...selected, row]
                            : selected.filter((v) => v.id !== row.id),
                      )
                    }
                  />
                  <span>
                    <strong>{row.name}</strong>
                    <small>
                      {row.id} ·{" "}
                      {row.supported === false
                        ? "Objetivo o destino no compatible"
                        : "Activa"}
                      {row.destination ? " · " + row.destination : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
          {after && (
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => void search(true)}
            >
              Ver más resultados
            </button>
          )}
          {error && <small role="status">{error}</small>}
        </div>
      )}
    </section>
  );
}
