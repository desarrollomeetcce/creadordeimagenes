"use client";
import { useEffect, useRef, useState } from "react";
import { studioRequest } from "./inventory-meta-picker";
import {
  browseCategories,
  detailedFieldNames,
  audienceSearchDelay,
  audienceSearchCacheMs,
  type BrowseCategory,
} from "../../lib/creative-studio/detailed-targeting";
import type { CampaignConfig } from "../../lib/creative-studio/campaign-policy";
type Audience = CampaignConfig["audiences"][number];
type Kind =
  | "detailed"
  | "interests"
  | "custom_audiences"
  | "cities"
  | "regions"
  | "locales";
const labels: Record<Kind, string> = {
  detailed: "Intereses, comportamientos y datos demográficos",
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
  const [kind, setKind] = useState<Kind>("detailed"),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [after, setAfter] = useState<string | null>(null),
    [searchOpen, setSearchOpen] = useState(false),
    [explore, setExplore] = useState(false),
    [browseCategory, setBrowseCategory] = useState<
      BrowseCategory | undefined
    >(),
    [saved, setSaved] = useState<any[]>([]),
    [localSaved, setLocalSaved] = useState<any[]>([]),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [exclude, setExclude] = useState(false),
    [savedName, setSavedName] = useState("");
  const controller = useRef<AbortController | null>(null),
    request = useRef<{ key: string; id: string } | null>(null),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    activeKey = useRef(""),
    cache = useRef(
      new Map<string, { at: number; items: any[]; after: string | null }>(),
    ),
    runSearch = useRef<() => void>(() => {});
  const special = config.specialCategory !== "NONE";
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    cache.current.clear();
    setAfter(null);
    setResults([]);
    setSaved([]);
    setLocalSaved([]);
    setError("");
    setLoading(false);
  }, [accountId, config.country, categoryId]);
  function invalidateSearch() {
    generation.current++;
    controller.current?.abort();
    activeKey.current = "";
    if (timer.current) clearTimeout(timer.current);
    setResults([]);
    setAfter(null);
    setError("");
    setLoading(false);
  }
  useEffect(
    () => () => {
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (
      !searchOpen ||
      !accountId ||
      special ||
      !["detailed", "interests"].includes(kind) ||
      query.trim().length < 2
    )
      return;
    timer.current = setTimeout(() => runSearch.current(), audienceSearchDelay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, kind, searchOpen, accountId, config.country, special]);
  useEffect(() => {
    if (special && ["detailed", "interests", "custom_audiences"].includes(kind))
      invalidateSearch();
  }, [special, kind]);
  async function search(
    savedOnly = false,
    more = false,
    category?: BrowseCategory,
  ) {
    if (!accountId) return;
    if (timer.current) clearTimeout(timer.current);
    const browse = category ?? browseCategory;
    if (
      !savedOnly &&
      special &&
      ["interests", "detailed", "custom_audiences"].includes(kind)
    )
      return;
    if (
      !savedOnly &&
      kind !== "custom_audiences" &&
      !(kind === "detailed" && browse) &&
      query.trim().length < 2
    )
      return;
    const key = JSON.stringify([
      accountId,
      config.country,
      categoryId,
      savedOnly,
      kind,
      browse ?? "",
      browse ? "" : query.trim(),
      more ? after : "",
    ]);
    if (activeKey.current === key) return;
    if (!savedOnly) {
      const known = cache.current.get(key);
      if (known && Date.now() - known.at < audienceSearchCacheMs) {
        setResults((old) =>
          more
            ? [
                ...old,
                ...known.items.filter(
                  (n) => !old.some((o) => o.id === n.id && o.field === n.field),
                ),
              ]
            : known.items,
        );
        setAfter(known.after);
        setError("");
        return;
      }
    }
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const turn = ++generation.current;
    activeKey.current = key;
    setLoading(true);
    setError("");
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
          ...(browse && kind === "detailed"
            ? { browse }
            : query.trim()
              ? { q: query.trim() }
              : {}),
          ...(more && after ? { after } : {}),
        });
        const r = await studioRequest(
          "/audience-options/" + accountId + "?" + params,
          "GET",
          undefined,
          c.signal,
        );
        if (turn === generation.current) {
          const items = r.items.map((row: any) => ({ ...row, proof: r.proof }));
          cache.current.set(key, { at: Date.now(), items, after: r.after });
          while (cache.current.size > 20)
            cache.current.delete(cache.current.keys().next().value!);
          setResults((old) =>
            more
              ? [
                  ...old,
                  ...items.filter(
                    (n: any) =>
                      !old.some((o) => o.id === n.id && o.field === n.field),
                  ),
                ]
              : items,
          );
          setAfter(r.after);
          if (!items.length)
            setError(
              "Meta no devolvió opciones disponibles para esta búsqueda.",
            );
        }
      }
    } catch (e) {
      if (turn === generation.current && !c.signal.aborted)
        setError(e instanceof Error ? e.message : "No se pudo consultar Meta.");
    } finally {
      if (turn === generation.current) {
        activeKey.current = "";
        setLoading(false);
      }
    }
  }
  runSearch.current = () => {
    void search();
  };
  function add(row: any) {
    const base = {
      ...value,
      selectionProofs: [
        ...new Set([...(value.selectionProofs ?? []), row.proof]),
      ].slice(-30),
      savedAudienceId: undefined,
      platformPresetId: undefined,
    };
    if (kind === "detailed")
      onChange({
        ...base,
        detailedTargeting: [
          ...(value.detailedTargeting ?? []).filter(
            (v) => v.id !== row.id || v.field !== row.field,
          ),
          { id: row.id, name: row.name, field: row.field },
        ],
      });
    else if (kind === "interests")
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
                {(value.detailedTargeting ?? []).map((v) => (
                  <button
                    type="button"
                    key={v.field + v.id}
                    title={detailedFieldNames[v.field] + " · Quitar"}
                    onClick={() =>
                      onChange({
                        ...value,
                        detailedTargeting: value.detailedTargeting?.filter(
                          (i) => i.id !== v.id || i.field !== v.field,
                        ),
                      })
                    }
                  >
                    {v.name} ×
                  </button>
                ))}
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
              <details
                className="studio-targeting-search"
                onToggle={(e) => {
                  const open = e.currentTarget.open;
                  setSearchOpen(open);
                  if (!open) invalidateSearch();
                }}
              >
                <summary>Buscar segmentación en Meta</summary>
                <select
                  aria-label={`Tipo de segmentación ${index + 1}`}
                  value={kind}
                  onChange={(e) => {
                    invalidateSearch();
                    setBrowseCategory(undefined);
                    setExplore(false);
                    setKind(e.target.value as Kind);
                    setQuery("");
                  }}
                >
                  {Object.entries(labels).map(([v, label]) => (
                    <option
                      key={v}
                      value={v}
                      disabled={
                        special &&
                        (v === "interests" ||
                          v === "detailed" ||
                          v === "custom_audiences")
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
                        : "Ej. medio ambiente, tratamiento de aguas…"
                    }
                    onChange={(e) => {
                      invalidateSearch();
                      setBrowseCategory(undefined);
                      setQuery(e.target.value);
                    }}
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
                        !browseCategory &&
                        query.trim().length < 2) ||
                      (special &&
                        (kind === "interests" ||
                          kind === "detailed" ||
                          kind === "custom_audiences"))
                    }
                    onClick={() => void search()}
                  >
                    {loading ? "Buscando…" : "Buscar"}
                  </button>
                </div>
                {kind === "detailed" && (
                  <>
                    <div className="studio-targeting-explore">
                      <small>
                        Resultados al terminar de escribir · solo opciones que
                        Meta devuelve.
                      </small>
                      <button
                        type="button"
                        aria-expanded={explore}
                        disabled={special || !accountId}
                        onClick={() => setExplore((v) => !v)}
                      >
                        Explorar
                      </button>
                    </div>
                    {explore && (
                      <div
                        className="studio-targeting-categories"
                        aria-label="Categorías de segmentación"
                      >
                        {Object.entries(browseCategories).map(([id, label]) => (
                          <button
                            type="button"
                            key={id}
                            aria-pressed={browseCategory === id}
                            disabled={loading || special || !accountId}
                            onClick={() => {
                              invalidateSearch();
                              setQuery("");
                              setBrowseCategory(id as BrowseCategory);
                              void search(false, false, id as BrowseCategory);
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {loading && (
                  <small role="status">Buscando opciones en Meta…</small>
                )}
                <div
                  className="studio-targeting-results"
                  aria-label={`Resultados de segmentación ${index + 1}`}
                  aria-busy={loading}
                >
                  {results.map((row) => {
                    const selected =
                      kind === "detailed"
                        ? (value.detailedTargeting ?? []).some(
                            (v) => v.id === row.id && v.field === row.field,
                          )
                        : kind === "interests"
                          ? (value.interests ?? []).some((v) => v.id === row.id)
                          : false;
                    return (
                      <button
                        type="button"
                        key={(row.field ?? kind) + row.id}
                        disabled={
                          selected ||
                          special ||
                          (kind === "detailed" &&
                            (value.detailedTargeting?.length ?? 0) >= 20)
                        }
                        onClick={() => add(row)}
                      >
                        <span className="studio-targeting-result-copy">
                          {row.path?.length > 0 && (
                            <small className="studio-targeting-path">
                              {row.path.join(" › ")}
                            </small>
                          )}
                          <strong>{row.name}</strong>
                          <small>
                            {row.field
                              ? detailedFieldNames[
                                  row.field as keyof typeof detailedFieldNames
                                ]
                              : labels[kind]}
                            {row.audienceLower !== undefined &&
                            row.audienceUpper !== undefined
                              ? ` · Tamaño global: ${Number(row.audienceLower).toLocaleString("es")}–${Number(row.audienceUpper).toLocaleString("es")}`
                              : ""}
                          </small>
                        </span>
                        <span aria-hidden="true">{selected ? "✓" : "＋"}</span>
                      </button>
                    );
                  })}
                </div>
                {after && (
                  <button
                    type="button"
                    className="studio-targeting-more"
                    disabled={loading}
                    onClick={() => void search(false, true)}
                  >
                    Ver más opciones
                  </button>
                )}
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
