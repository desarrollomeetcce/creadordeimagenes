"use client";
import { matchesSearchWords } from "../../lib/search";
import { useReusableConfiguration } from "./reusable-configuration";
import { SearchSelect } from "./search-select";
import { CurrentRole, useCanEdit } from "./role-guide";
import { Fragment, useContext, useEffect, useRef, useState } from "react";
import { effectiveSettings, validateDistribution } from "../../lib/inheritance";
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "No se pudo completar la operación.");
  return b;
}
function useAction() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const run = async (
    fn: () => Promise<unknown>,
    success = "Cambios guardados",
  ) => {
    setBusy(true);
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    run,
    notice: message ? (
      <div role="status" className="notice">
        {message}
      </div>
    ) : null,
  };
}
export { LibraryWorkspace as Library } from "./library-workspace";
export function PresetTools(props: {
  category: {
    id: string;
    name: string;
    prompt: string;
    settings?: unknown;
    instructionPolicy?: Record<string, unknown>;
    applyPromptToAll?: boolean;
    applySettingsToAll?: boolean;
  };
  scope?: "project" | "category" | "subproduct" | "brand";
  saveCurrent?: () => Promise<any>;
}) {
  const tools = useReusableConfiguration({
    scope: props.scope ?? "category",
    current: props.category,
    saveCurrent: props.saveCurrent,
    onApplied: async () => {
      window.location.reload();
    },
  });
  return (
    <>
      {tools.picker}
      {tools.saver}
    </>
  );
}
function PresetSharing({ id }: { id: string }) {
  const [shares, setShares] = useState<
    { id: string; name: string; email: string; role: string }[]
  >([]);
  const t = useAction();
  const refresh = async () => setShares(await api(`presets/${id}/shares`));
  useEffect(() => {
    void t.run(refresh, "");
  }, [id]);
  return (
    <details>
      <summary>Compartir configuración por correo</summary>
      <div className="inside stack">
        <p className="hint">
          OWNER y Administrador ven todas las configuraciones. Un Usuario solo
          ve las propias, las oficiales y las compartidas expresamente con él.
          El rol Observador no puede aplicarlas ni modificarlas.
        </p>
        <form
          className="fields"
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void t.run(async () => {
              await api(`presets/${id}/shares`, "POST", data);
              await refresh();
            });
          }}
        >
          <label>
            Correo de la cuenta aprobada
            <input type="email" name="email" required />
          </label>
          <button disabled={t.busy}>Compartir configuración</button>
        </form>
        {shares.map((s) => (
          <div className="row" key={s.id}>
            <span>
              {s.name} · {s.email}
            </span>
            <button
              disabled={t.busy}
              onClick={() =>
                void t.run(async () => {
                  await api(`presets/${id}/shares/${s.id}`, "DELETE");
                  await refresh();
                })
              }
            >
              Retirar acceso
            </button>
          </div>
        ))}
        {t.notice}
      </div>
    </details>
  );
}
type SavedPreset = {
  id: string;
  name: string;
  prompt: string;
  settings: Record<string, unknown>;
  visibility: string;
  attachmentCount: number;
  canEdit: boolean;
  applyPromptToAll: boolean;
  applySettingsToAll: boolean;
  updatedAt: string;
};
const visibilityLabels: Record<string, string> = {
  PERSONAL: "Personal",
  SHARED: "Compartida",
  OFFICIAL: "Oficial",
};
function PresetDetails({
  preset,
  edit,
  refresh,
  close,
  run,
  busy,
}: {
  preset: SavedPreset;
  edit: boolean;
  refresh: () => Promise<void>;
  close: () => void;
  run: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
  busy: boolean;
}) {
  const role = useContext(CurrentRole);
  const [files, setFiles] = useState<
    { id: string; name: string; size: number; purpose: string }[]
  >([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState("");
  const [settings, setSettings] = useState(() =>
    effectiveSettings(preset.settings, {}),
  );
  const [applyPrompt, setApplyPrompt] = useState(preset.applyPromptToAll);
  const [applySettings, setApplySettings] = useState(preset.applySettingsToAll);
  useEffect(() => {
    let active = true;
    api(`attachments?scope=preset&id=${encodeURIComponent(preset.id)}`)
      .then((data) => {
        if (active) setFiles(data);
      })
      .catch((error) => {
        if (active)
          setFilesError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar los adjuntos.",
          );
      })
      .finally(() => {
        if (active) setFilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preset.id]);
  return (
    <section
      className="stack preset-details"
      aria-label={(edit ? "Editar " : "Detalles de ") + preset.name}
    >
      <h3>{edit ? "Editar configuración" : "Detalles de la configuración"}</h3>
      {edit && preset.canEdit ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void run(async () => {
              validateDistribution(settings);
              await api("presets/" + preset.id, "PATCH", {
                name: data.name,
                prompt: data.prompt,
                visibility: data.visibility,
                settings: { ...preset.settings, ...settings },
                applyPromptToAll: applyPrompt,
                applySettingsToAll: applySettings,
              });
              await refresh();
            }, "Configuración actualizada");
          }}
        >
          <div className="fields">
            <label>
              Nombre de la configuración
              <input
                autoFocus
                name="name"
                defaultValue={preset.name}
                required
                maxLength={150}
              />
            </label>
            <label>
              Visibilidad
              <select name="visibility" defaultValue={preset.visibility}>
                <option value="PERSONAL">Personal</option>
                <option value="SHARED">Compartida</option>
                {role === "OWNER" && <option value="OFFICIAL">Oficial</option>}
              </select>
            </label>
          </div>
          <label>
            Instrucciones guardadas
            <textarea
              name="prompt"
              defaultValue={preset.prompt}
              maxLength={30000}
              rows={6}
            />
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={applyPrompt}
              onChange={(e) => setApplyPrompt(e.target.checked)}
            />
            Aplicar instrucciones generales a todos los subproductos
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={applySettings}
              onChange={(e) => setApplySettings(e.target.checked)}
            />
            Aplicar parámetros comunes a todos los subproductos
          </label>
          <p className="hint">
            Los parámetros se guardan para reutilizarlos. Si desactivas su
            aplicación común, cada subproducto define su configuración.
          </p>
          <div className="fields">
            {(
              [
                ["count", "Variaciones", 1],
                ["textCount", "Texto", 0],
                ["imageTextCount", "Imagen + Texto", 0],
                ["imageCount", "Imagen", 0],
              ] as const
            ).map(([key, label, min]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={min}
                  max={12}
                  required
                  value={settings[key]}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
            <label>
              Formato
              <select
                value={settings.format}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, format: e.target.value }))
                }
              >
                {["1:1", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16"].map(
                  (f) => (
                    <option key={f}>{f}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Estilo
              <input
                value={settings.style}
                maxLength={150}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, style: e.target.value }))
                }
              />
            </label>
          </div>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.editable}
              onChange={(e) =>
                setSettings((s) => ({ ...s, editable: e.target.checked }))
              }
            />
            Conservar títulos, textos y logos como elementos editables
          </label>
          <p className="hint">
            Editar esta configuración no cambia los productos o subproductos
            donde ya se aplicó. Para cambiar sus adjuntos, guarda una nueva
            configuración desde el espacio de origen.
          </p>
          <div className="row">
            <button className="primary" disabled={busy}>
              Guardar cambios
            </button>
            <button
              className="ui-close-button"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Cerrar edición
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="preset-prompt">
            {preset.prompt || "Sin instrucciones guardadas."}
          </p>
          <p>
            Instrucciones generales:{" "}
            {preset.applyPromptToAll
              ? "se aplican a todos los subproductos"
              : "no se aplican de forma común"}
            . Parámetros comunes:{" "}
            {preset.applySettingsToAll ? "activados" : "desactivados"}.
          </p>
          <p>
            {settings.count} variaciones · Texto: {settings.textCount} · Imagen
            + Texto: {settings.imageTextCount} · Imagen: {settings.imageCount} ·{" "}
            {settings.format} · {settings.style} ·{" "}
            {settings.editable ? "Elementos editables" : "Imagen aplanada"}
          </p>
        </>
      )}
      <h4>Adjuntos reutilizables · {preset.attachmentCount ?? 0}</h4>
      {filesLoading ? (
        <p role="status">Cargando adjuntos…</p>
      ) : filesError ? (
        <p role="alert">{filesError}</p>
      ) : files.length ? (
        files.map((f) => (
          <a
            key={f.id}
            href={"/api/attachments/" + f.id}
            target="_blank"
            rel="noreferrer"
          >
            {f.name} · {f.purpose} · {Math.ceil(f.size / 1024)} KB
          </a>
        ))
      ) : (
        <p className="hint">Sin adjuntos reutilizables.</p>
      )}
      {preset.canEdit && <PresetSharing id={preset.id} />}
    </section>
  );
}
function PresetRow({
  preset,
  refresh,
  busy,
  run,
}: {
  preset: SavedPreset;
  refresh: () => Promise<void>;
  busy: boolean;
  run: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const canWrite = useCanEdit();
  const [mode, setMode] = useState<"view" | "edit" | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const detailId = "preset-details-" + preset.id;
  const s = effectiveSettings(preset.settings, {});
  return (
    <Fragment>
      <tr className="preset-row" data-preset-id={preset.id}>
        <th scope="row">
          <strong>{preset.name}</strong>
          <p className="hint">
            {preset.prompt.slice(0, 110) || "Sin instrucciones"}
            {preset.prompt.length > 110 ? "…" : ""}
          </p>
        </th>
        <td data-label="Visibilidad">
          <span className="badge">
            {visibilityLabels[preset.visibility] ?? preset.visibility}
          </span>
        </td>
        <td data-label="Parámetros">
          {s.count} variaciones · {s.format}
          <br />
          <span className="hint">
            {s.style} · {preset.attachmentCount ?? 0} adjuntos
          </span>
        </td>
        <td data-label="Actualizada · Lima">
          <time dateTime={preset.updatedAt}>
            {new Date(preset.updatedAt).toLocaleString("es-PE", {
              timeZone: "America/Lima",
              dateStyle: "short",
              timeStyle: "short",
            })}
          </time>
        </td>
        <td data-label="Acciones">
          <div className="preset-actions">
            <button
              type="button"
              disabled={busy}
              className={mode === "view" ? "ui-close-button" : undefined}
              aria-expanded={mode === "view"}
              aria-controls={detailId}
              onClick={() => setMode(mode === "view" ? null : "view")}
            >
              {mode === "view" ? "Cerrar detalles" : "Ver detalles"}
            </button>
            {preset.canEdit && (
              <button
                ref={editButton}
                type="button"
                disabled={busy}
                aria-expanded={mode === "edit"}
                aria-controls={detailId}
                onClick={() => setMode(mode === "edit" ? null : "edit")}
              >
                Editar
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(
                      "presets/" + preset.id + "/duplicate",
                      "POST",
                      {},
                    );
                    await refresh();
                  }, "Copia personal creada")
                }
              >
                Duplicar
              </button>
            )}
            {preset.canEdit && (
              <button
                type="button"
                disabled={busy}
                className="danger"
                onClick={() => {
                  if (
                    confirm(
                      `¿Eliminar «${preset.name}» y sus adjuntos? Las copias aplicadas a productos y subproductos se conservan.`,
                    )
                  )
                    void run(async () => {
                      await api("presets/" + preset.id, "DELETE");
                      await refresh();
                    }, "Configuración eliminada");
                }}
              >
                Eliminar
              </button>
            )}
          </div>
          {!preset.canEdit && (
            <small className="hint">
              Solo el autor o el OWNER pueden editar y eliminar.
            </small>
          )}
        </td>
      </tr>
      {mode && (
        <tr id={detailId} className="preset-detail-row">
          <td colSpan={5}>
            <PresetDetails
              key={preset.id + mode}
              preset={preset}
              edit={mode === "edit"}
              run={run}
              busy={busy}
              refresh={refresh}
              close={() => {
                setMode(null);
                editButton.current?.focus();
              }}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
export function Presets() {
  const [items, setItems] = useState<SavedPreset[]>([]);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("");
  const [order, setOrder] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const t = useAction();
  const refresh = async () => setItems(await api("presets"));
  useEffect(() => {
    let active = true;
    api("presets")
      .then((data) => {
        if (active) {
          setItems(data);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las configuraciones.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const filtered = items
    .filter(
      (i) =>
        (!visibility || i.visibility === visibility) &&
        matchesSearchWords(
          i.name +
            " " +
            i.prompt +
            " " +
            (visibilityLabels[i.visibility] ?? i.visibility),
          query,
        ),
    )
    .sort((a, b) =>
      order === "name"
        ? a.name.localeCompare(b.name, "es", {
            numeric: true,
            sensitivity: "base",
          })
        : order === "old"
          ? Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
          : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  return (
    <section
      className="preset-list stack"
      aria-label="Configuraciones guardadas"
    >
      <h1>Configuraciones guardadas</h1>
      <p className="muted">
        Consulta, edita y elimina tus configuraciones reutilizables. Guarda
        nuevas configuraciones desde un producto o subproducto.
      </p>
      <div className="fields">
        <label>
          Buscar configuraciones
          <input
            type="search"
            placeholder="Nombre o instrucciones…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Filtrar por visibilidad
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <option value="">Todas</option>
            {Object.entries(visibilityLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ordenar por
          <select value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="recent">Actualizadas recientemente</option>
            <option value="old">Actualizadas hace más tiempo</option>
            <option value="name">Nombre · A–Z</option>
          </select>
        </label>
        <button
          type="button"
          disabled={loading || t.busy}
          onClick={() =>
            void t.run(async () => {
              await refresh();
              setLoadError("");
            }, "Listado actualizado")
          }
        >
          Actualizar listado
        </button>
      </div>
      {(query || visibility) && (
        <button
          type="button"
          className="preset-clear"
          onClick={() => {
            setQuery("");
            setVisibility("");
          }}
        >
          Limpiar filtros
        </button>
      )}
      {t.notice}
      {loadError && (
        <p role="alert" className="notice error">
          {loadError}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando configuraciones…</p>
      ) : (
        !loadError && (
          <>
            <p role="status" className="hint">
              {filtered.length} de {items.length} configuraciones
            </p>
            {filtered.length ? (
              <div
                className="table-wrap preset-table-wrap"
                role="region"
                aria-label="Listado de configuraciones"
                tabIndex={0}
              >
                <table className="preset-table">
                  <caption className="sr-only">
                    Configuraciones guardadas disponibles para tu cuenta. Fechas
                    en hora de Lima.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Nombre e instrucciones</th>
                      <th scope="col">Visibilidad</th>
                      <th scope="col">Parámetros</th>
                      <th scope="col">Actualizada · Lima</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((i) => (
                      <PresetRow
                        key={i.id}
                        preset={i}
                        refresh={refresh}
                        busy={t.busy}
                        run={t.run}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                {items.length
                  ? "No hay configuraciones que coincidan con estos filtros."
                  : "Todavía no hay configuraciones disponibles para tu cuenta. Guarda una desde un producto o subproducto para verla aquí."}
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
export function BudgetSettings() {
  const [limits, setLimits] = useState<any[]>([]),
    [users, setUsers] = useState<any[]>([]),
    [projects, setProjects] = useState<any[]>([]),
    [scope, setScope] = useState("USER"),
    [target, setTarget] = useState(""),
    [monthly, setMonthly] = useState("0"),
    [daily, setDaily] = useState("0"),
    [max, setMax] = useState(100);
  const t = useAction();
  const refresh = async () => {
    setLimits(await api("budgets"));
    setUsers(await api("users"));
    setProjects(await api("projects"));
  };
  useEffect(() => {
    void t.run(refresh, "");
  }, []);
  return (
    <section className="panel stack">
      <h2>Límites particulares opcionales</h2>
      <p className="hint">
        Solo el OWNER administra esta sección; no significa que todos los
        límites se apliquen al OWNER. Cada fila afecta únicamente al
        destinatario indicado. Si no necesitas una restricción adicional, no
        crees una fila o elimina la existente. Si existe un límite particular se
        aplica además del global. Cero bloquea nuevas reservas. Los importes son
        reservas en USD y no garantizan la factura final del proveedor.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void t.run(async () => {
            await api("budgets", "PUT", {
              scope,
              targetId:
                (scope === "USER" ? users : projects).find(
                  (x) => x.name + (x.email ? " · " + x.email : "") === target,
                )?.id ?? "",
              monthlyMicros: String(Math.round(Number(monthly) * 1000000)),
              dailyMicros: String(Math.round(Number(daily) * 1000000)),
              maxJobsPerDay: max,
            });
            await refresh();
          });
        }}
      >
        <div className="fields">
          <label>
            Aplicar a
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setTarget("");
              }}
            >
              <option value="USER">Usuario</option>
              <option value="PROJECT">Proyecto</option>
            </select>
          </label>
          <label>
            Buscar destinatario
            <input
              required
              list="budget-targets"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <datalist id="budget-targets">
              {(scope === "USER" ? users : projects).map((t) => (
                <option
                  value={t.name + (t.email ? " · " + t.email : "")}
                  key={t.id}
                >
                  {t.name} {t.email ?? ""}
                </option>
              ))}
            </datalist>
            <span className="hint">
              Busca y selecciona una cuenta o proyecto existente. Incluye al
              OWNER solo si quieres limitar también esa cuenta.
            </span>
          </label>
          <label>
            Máximo mensual · USD
            <input
              type="number"
              min={0}
              step="0.000001"
              required
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
            />
            <span className="hint">
              Máximo adicional de reservas mensuales para este destinatario, en
              USD. Cero bloquea.
            </span>
          </label>
          <label>
            Máximo diario · USD
            <input
              type="number"
              min={0}
              step="0.000001"
              required
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
            <span className="hint">
              Máximo adicional diario en USD. Debe alcanzar la reserva por
              afiche para permitir al menos uno.
            </span>
          </label>
          <label>
            Máximo diario de afiches
            <input
              type="number"
              min={0}
              max={100000}
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
            <span className="hint">
              Número máximo de trabajos nuevos al día. Cero bloquea nuevas
              reservas.
            </span>
          </label>
        </div>
        <button className="primary" disabled={t.busy}>
          Guardar límite particular
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ámbito</th>
              <th>Destinatario</th>
              <th>Mes USD</th>
              <th>Día USD</th>
              <th>Afiches/día</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {limits.map((l) => (
              <tr key={l.id}>
                <td>{l.scope === "USER" ? "Usuario" : "Proyecto"}</td>
                <td>
                  {(l.scope === "USER" ? users : projects).find(
                    (x) => x.id === l.targetId,
                  )?.name ?? l.targetId}
                </td>
                <td>{Number(l.monthlyMicros) / 1000000}</td>
                <td>{Number(l.dailyMicros) / 1000000}</td>
                <td>{l.maxJobsPerDay}</td>
                <td>
                  <div className="row">
                    <button
                      type="button"
                      disabled={t.busy}
                      onClick={() => {
                        const entity = (
                          l.scope === "USER" ? users : projects
                        ).find((x) => x.id === l.targetId);
                        setScope(l.scope);
                        setTarget(
                          entity
                            ? entity.name +
                                (entity.email ? " · " + entity.email : "")
                            : "",
                        );
                        setMonthly(String(Number(l.monthlyMicros) / 1000000));
                        setDaily(String(Number(l.dailyMicros) / 1000000));
                        setMax(l.maxJobsPerDay);
                      }}
                    >
                      Editar límite
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={t.busy}
                      onClick={() => {
                        if (
                          !confirm(
                            "¿Eliminar este límite particular? Se aplicarán los límites globales y los demás límites que correspondan. El consumo anterior se conserva.",
                          )
                        )
                          return;
                        void t.run(async () => {
                          await api("budgets", "DELETE", { id: l.id });
                          await refresh();
                        }, "Límite particular eliminado. Los límites globales continúan vigentes.");
                      }}
                    >
                      Eliminar límite
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.notice}
    </section>
  );
}
