"use client";
import { useEffect, useRef, useState } from "react";
import { studioRequest } from "./inventory-meta-picker";
import type { CampaignConfig } from "../../lib/creative-studio/campaign-policy";
type Audience = CampaignConfig["audiences"][number];
type Kind = "interests" | "custom_audiences" | "cities" | "regions" | "locales";
const labels: Record<Kind, string> = {
  interests: "Intereses",
  custom_audiences: "Públicos personalizados y similares",
  cities: "Ciudades",
  regions: "Regiones",
  locales: "Idiomas",
};
export function StudioCampaignAudience({
  index,
  value,
  onChange,
  accountId,
  categoryId,
  config,
  existing = false,
}: {
  index: number;
  value: Audience;
  onChange: (v: Audience) => void;
  accountId: string;
  categoryId: string;
  config: CampaignConfig;
  existing?: boolean;
}) {
  const [kind, setKind] = useState<Kind>("interests"),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [proof, setProof] = useState(""),
    [saved, setSaved] = useState<any[]>([]),
    [localSaved, setLocalSaved] = useState<any[]>([]),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [exclude, setExclude] = useState(false),
    [savedName, setSavedName] = useState("");
  const controller = useRef<AbortController | null>(null),
    request = useRef<{ key: string; id: string } | null>(null),
    generation = useRef(0);
  const special = config.specialCategory !== "NONE";
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    setResults([]);
    setSaved([]);
    setLocalSaved([]);
    setError("");
    setLoading(false);
  }, [accountId, config.country, categoryId]);
  useEffect(() => () => controller.current?.abort(), []);
  async function search(savedOnly = false) {
    if (loading || !accountId) return;
    setLoading(true);
    setError("");
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const turn = ++generation.current;
    try {
      if (savedOnly) {
        const responses = await Promise.allSettled([
          studioRequest(
            "/account-resources/" + accountId + "?part=audiences",
            "GET",
            undefined,
            c.signal,
          ),
          studioRequest(
            "/audience-presets/" +
              categoryId +
              "?" +
              new URLSearchParams({ accountId, country: config.country }),
            "GET",
            undefined,
            c.signal,
          ),
        ]);
        if (turn === generation.current) {
          const [native, local] = responses;
          if (native.status === "fulfilled")
            setSaved(native.value.audiences ?? []);
          if (local.status === "fulfilled")
            setLocalSaved(local.value.items ?? []);
          const failed = responses.find((r) => r.status === "rejected");
          if (failed?.status === "rejected")
            setError(
              failed.reason instanceof Error
                ? failed.reason.message
                : "No se pudieron consultar todos los públicos guardados.",
            );
        }
      } else {
        const params = new URLSearchParams({
          kind,
          country: config.country,
          ...(query.trim() ? { q: query.trim() } : {}),
        });
        const r = await studioRequest(
          "/audience-options/" + accountId + "?" + params,
          "GET",
          undefined,
          c.signal,
        );
        if (turn === generation.current) {
          setResults(r.items);
          setProof(r.proof);
          if (!r.items.length)
            setError("Meta no devolvió resultados para esta búsqueda.");
        }
      }
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "No se pudo consultar Meta.");
    } finally {
      if (turn === generation.current) setLoading(false);
    }
  }
  function add(row: any) {
    const base = {
      ...value,
      selectionProofs: [
        ...new Set([...(value.selectionProofs ?? []), proof]),
      ].slice(-10),
      savedAudienceId: undefined,
      platformPresetId: undefined,
    };
    if (kind === "interests")
      onChange({
        ...base,
        interestSource: "MANUAL",
        interests: [
          ...(value.interestSource === "MANUAL"
            ? (value.interests ?? [])
            : []
          ).filter((v) => v.id !== row.id),
          { id: row.id, name: row.name },
        ],
      });
    else if (kind === "custom_audiences") {
      const field = exclude ? "excludedCustomAudiences" : "customAudiences";
      onChange({
        ...base,
        [field]: [
          ...(value[field] ?? []).filter((v) => v.id !== row.id),
          { id: row.id, name: row.name },
        ],
      });
    } else if (kind === "locales")
      onChange({
        ...base,
        locales: [...new Set([...(value.locales ?? []), Number(row.id)])],
      });
    else
      onChange({
        ...base,
        locations: [
          ...(value.locations ?? []).filter((v) => v.id !== row.id),
          { id: row.id, name: row.name, country: row.country, kind },
        ],
      });
  }
  async function saveAudience() {
    if (saving || !savedName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        categoryId,
        name: savedName.trim(),
        country: config.country,
        platforms: config.platforms,
        specialCategory: config.specialCategory,
        aiSuggestionJobId: config.aiSuggestionJobId,
        audience: value,
      };
      const key = JSON.stringify(payload);
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      const r = await studioRequest("/audience-save/" + accountId, "POST", {
        ...payload,
        requestId: request.current.id,
      });
      setLocalSaved((old) => [...old.filter((v) => v.id !== r.id), r]);
      onChange({ ...r.audience, name: value.name, platformPresetId: r.id });
      setError("Público guardado: " + r.name);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se confirmó el guardado del público.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="studio-audience-card">
      <header>
        <span className="studio-stage-number">{index + 1}</span>
        <strong>
          {existing ? "Conjunto existente" : `Público ${index + 1}`}
        </strong>
        {(value.savedAudienceId || value.platformPresetId) && (
          <small>Guardado</small>
        )}
      </header>
      <label>
        Nombre del conjunto
        <input
          aria-label={`Nombre del conjunto ${index + 1}`}
          value={value.name}
          disabled={existing}
          maxLength={100}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      {existing ? (
        <p className="hint">
          Los anuncios se añadirán a este conjunto. Se conserva su público y
          presupuesto.
        </p>
      ) : (
        <>
          <div className="studio-saved-audience-row">
            <select
              aria-label={`Público guardado ${index + 1}`}
              value={
                value.platformPresetId
                  ? "app:" + value.platformPresetId
                  : (value.savedAudienceId ?? "")
              }
              disabled={special}
              onChange={(e) => {
                if (e.target.value.startsWith("app:")) {
                  const selected = localSaved.find(
                    (a) => a.id === e.target.value.slice(4),
                  );
                  if (selected)
                    onChange({
                      ...selected.audience,
                      name: value.name,
                      platformPresetId: selected.id,
                    });
                  return;
                }
                onChange({
                  name: value.name,
                  ageMin: 18,
                  ageMax: 65,
                  gender: "ALL",
                  strictAge: false,
                  ...(e.target.value
                    ? { savedAudienceId: e.target.value }
                    : {}),
                });
              }}
            >
              <option value="">Configurar público manual</option>
              {value.savedAudienceId &&
                !saved.some((a) => a.id === value.savedAudienceId) && (
                  <option value={value.savedAudienceId}>
                    Público seleccionado · {value.savedAudienceId}
                  </option>
                )}
              {value.platformPresetId &&
                !localSaved.some((a) => a.id === value.platformPresetId) && (
                  <option value={"app:" + value.platformPresetId}>
                    Público guardado seleccionado
                  </option>
                )}
              <optgroup label="Esta plataforma">
                {localSaved.map((a) => (
                  <option key={a.id} value={"app:" + a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Meta">
                {saved.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              type="button"
              disabled={loading || special || !accountId}
              onClick={() => void search(true)}
            >
              {loading ? "…" : "Buscar guardados"}
            </button>
          </div>
          {value.savedAudienceId || value.platformPresetId ? (
            <small>
              Se usarán las edades y la segmentación del público seleccionado.
            </small>
          ) : (
            <>
              <div className="studio-audience-demographics">
                <label>
                  Desde
                  <input
                    aria-label={`Edad mínima del público ${index + 1}`}
                    type="number"
                    min={18}
                    max={65}
                    disabled={special}
                    value={value.ageMin}
                    onChange={(e) =>
                      onChange({ ...value, ageMin: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Hasta
                  <input
                    aria-label={`Edad máxima del público ${index + 1}`}
                    type="number"
                    min={18}
                    max={65}
                    disabled={special}
                    value={value.ageMax}
                    onChange={(e) =>
                      onChange({ ...value, ageMax: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Género
                  <select
                    aria-label={`Género del público ${index + 1}`}
                    disabled={special}
                    value={value.gender}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        gender: e.target.value as Audience["gender"],
                      })
                    }
                  >
                    <option value="ALL">Todos</option>
                    <option value="WOMEN">Mujeres</option>
                    <option value="MEN">Hombres</option>
                  </select>
                </label>
              </div>
              <label className="studio-check">
                <input
                  type="checkbox"
                  disabled={special}
                  checked={value.advantageAudience ?? !value.strictAge}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      advantageAudience: e.target.checked,
                      strictAge: !e.target.checked,
                    })
                  }
                />
                Público Advantage+
              </label>
              <div className="studio-audience-tags">
                {(value.interests ?? []).map((v) => (
                  <button
                    type="button"
                    key={"i" + v.id}
                    title="Quitar interés"
                    onClick={() =>
                      onChange({
                        ...value,
                        interests: value.interests?.filter(
                          (i) => i.id !== v.id,
                        ),
                      })
                    }
                  >
                    {v.name} ×
                  </button>
                ))}
                {(value.customAudiences ?? []).map((v) => (
                  <button
                    type="button"
                    key={"c" + v.id}
                    title="Quitar público"
                    onClick={() =>
                      onChange({
                        ...value,
                        customAudiences: value.customAudiences?.filter(
                          (i) => i.id !== v.id,
                        ),
                      })
                    }
                  >
                    {v.name} ×
                  </button>
                ))}
                {(value.excludedCustomAudiences ?? []).map((v) => (
                  <button
                    type="button"
                    key={"e" + v.id}
                    title="Quitar exclusión"
                    onClick={() =>
                      onChange({
                        ...value,
                        excludedCustomAudiences:
                          value.excludedCustomAudiences?.filter(
                            (i) => i.id !== v.id,
                          ),
                      })
                    }
                  >
                    Excluir: {v.name} ×
                  </button>
                ))}
                {(value.locations ?? []).map((v) => (
                  <button
                    type="button"
                    key={"l" + v.id}
                    onClick={() =>
                      onChange({
                        ...value,
                        locations: value.locations?.filter(
                          (i) => i.id !== v.id,
                        ),
                      })
                    }
                  >
                    {v.name} ×
                  </button>
                ))}
                {(value.locales ?? []).map((v) => (
                  <button
                    type="button"
                    key={"lang" + v}
                    onClick={() =>
                      onChange({
                        ...value,
                        locales: value.locales?.filter((i) => i !== v),
                      })
                    }
                  >
                    Idioma {v} ×
                  </button>
                ))}
              </div>
              <details className="studio-targeting-search">
                <summary>Buscar segmentación en Meta</summary>
                <select
                  aria-label={`Tipo de segmentación ${index + 1}`}
                  value={kind}
                  disabled={loading}
                  onChange={(e) => {
                    setKind(e.target.value as Kind);
                    setResults([]);
                    setQuery("");
                  }}
                >
                  {Object.entries(labels).map(([v, label]) => (
                    <option
                      key={v}
                      value={v}
                      disabled={
                        special &&
                        (v === "interests" || v === "custom_audiences")
                      }
                    >
                      {label}
                    </option>
                  ))}
                </select>
                {kind === "custom_audiences" && (
                  <label className="studio-check">
                    <input
                      type="checkbox"
                      checked={exclude}
                      onChange={(e) => setExclude(e.target.checked)}
                    />
                    Excluir estos públicos
                  </label>
                )}
                <div className="studio-query-row">
                  <input
                    aria-label={`Buscar segmentación ${index + 1}`}
                    value={query}
                    maxLength={80}
                    placeholder={
                      kind === "cities" || kind === "regions"
                        ? "Nombre dentro del país elegido…"
                        : "Nombre en Meta…"
                    }
                    disabled={loading}
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
                    disabled={
                      loading ||
                      !accountId ||
                      (kind !== "custom_audiences" &&
                        query.trim().length < 2) ||
                      (special &&
                        (kind === "interests" || kind === "custom_audiences"))
                    }
                    onClick={() => void search()}
                  >
                    {loading ? "Buscando…" : "Buscar"}
                  </button>
                </div>
                <div className="studio-targeting-results">
                  {results.map((row) => (
                    <button type="button" key={row.id} onClick={() => add(row)}>
                      <span>{row.name}</span>
                      <span>＋</span>
                    </button>
                  ))}
                </div>
              </details>
            </>
          )}
          {!special && (
            <details className="studio-save-audience">
              <summary>Guardar público en la plataforma</summary>
              <label>
                Nombre del público
                <input
                  aria-label={`Guardar público ${index + 1}`}
                  value={savedName}
                  maxLength={100}
                  onChange={(e) => setSavedName(e.target.value)}
                  placeholder="Ej. Profesionales · Colombia"
                />
              </label>
              <button
                type="button"
                disabled={saving || !savedName.trim() || !accountId}
                onClick={() => void saveAudience()}
              >
                {saving ? "Guardando…" : "Guardar público"}
              </button>
            </details>
          )}
        </>
      )}
      {error && <small role="status">{error}</small>}
    </article>
  );
}
