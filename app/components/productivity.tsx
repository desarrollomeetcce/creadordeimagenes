"use client";
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
export function Library() {
  const [items, setItems] = useState<any[]>([]),
    [folders, setFolders] = useState<any[]>([]),
    [folder, setFolder] = useState(""),
    [query, setQuery] = useState(""),
    [name, setName] = useState("");
  const t = useAction();
  const refresh = async () => {
    setFolders(await api("library/folders"));
    setItems(await api("library" + (folder ? "?folder=" + folder : "")));
  };
  useEffect(() => {
    void t.run(refresh, "");
  }, [folder]);
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">Tu colección</div>
          <h1>Biblioteca</h1>
          <p className="muted">
            Solo los afiches que decides conservar. Sus versiones se guardan
            juntas.
          </p>
        </div>
      </div>
      <section className="panel stack">
        <div className="fields">
          <label>
            Carpeta
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">Toda mi biblioteca</option>
              <option value="root">Sin carpeta</option>
              {folders.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.parentId ? "↳ " : ""}
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Buscar
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre del subproducto…"
            />
          </label>
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void t.run(async () => {
              await api("library/folders", "POST", {
                name,
                parentId: folder && folder !== "root" ? folder : null,
              });
              setName("");
              await refresh();
            }, "Carpeta creada");
          }}
        >
          <input
            style={{ maxWidth: 280 }}
            aria-label="Nombre de carpeta"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nueva carpeta"
            maxLength={100}
            required
          />
          <button disabled={t.busy}>
            Crear {folder && folder !== "root" ? "subcarpeta" : "carpeta"}
          </button>
          {folder && folder !== "root" && (
            <>
              <button
                type="button"
                onClick={() => {
                  const n = prompt("Nuevo nombre de la carpeta");
                  if (n)
                    void t.run(async () => {
                      await api("library/folders/" + folder, "PATCH", {
                        name: n,
                      });
                      await refresh();
                    });
                }}
              >
                Renombrar
              </button>
              <button
                type="button"
                className="danger"
                onClick={() =>
                  void t.run(async () => {
                    await api("library/folders/" + folder, "DELETE");
                    setFolder("");
                    await refresh();
                  })
                }
              >
                Eliminar carpeta vacía
              </button>
            </>
          )}
        </form>
      </section>
      <div className="grid">
        {items
          .filter((i) =>
            (i.variation.subproduct?.name ?? "Afiche")
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((i) => (
            <article className="card gallery" key={i.id}>
              <img
                src={"/api/variations/" + i.variationId}
                alt={i.variation.subproduct?.name ?? "Afiche guardado"}
              />
              <h3>{i.variation.subproduct?.name ?? "Afiche"}</h3>
              <label>
                Ubicación
                <select
                  value={i.folderId ?? ""}
                  onChange={(e) =>
                    void t.run(async () => {
                      await api("library/items/" + i.variationId, "POST", {
                        permanent: true,
                        folderId: e.target.value || null,
                      });
                      await refresh();
                    })
                  }
                >
                  <option value="">Sin carpeta</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row">
                <a href={"/api/variations/" + i.variationId + "?download"}>
                  Descargar
                </a>
                <button
                  onClick={() =>
                    void t.run(async () => {
                      await api("library/items/" + i.variationId, "POST", {
                        permanent: false,
                      });
                      await refresh();
                    }, "Retirado de tu biblioteca. Se conserva si otro usuario lo guardó.")
                  }
                >
                  Retirar de mi biblioteca
                </button>
              </div>
            </article>
          ))}
      </div>
      {!items.length && (
        <div className="empty">
          Guarda afiches desde la galería para verlos aquí.
        </div>
      )}
      {t.notice}
    </>
  );
}
export function PresetTools({
  category,
  scope = "category",
  saveCurrent,
}: {
  category: {
    id: string;
    name: string;
    prompt: string;
    settings?: unknown;
    applyPromptToAll?: boolean;
    applySettingsToAll?: boolean;
  };
  scope?: "category" | "subproduct";
  saveCurrent?: () => Promise<{
    id: string;
    name: string;
    prompt: string;
    settings?: unknown;
    applyPromptToAll?: boolean;
    applySettingsToAll?: boolean;
  }>;
}) {
  const [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [name, setName] = useState("CONFIGURACION " + category.name),
    [visibility, setVisibility] = useState("PERSONAL"),
    [includeAttachments, setIncludeAttachments] = useState(false),
    [applyAttachments, setApplyAttachments] = useState(true);
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const t = useAction();
  useEffect(() => {
    if (!opened) return;
    void t.run(async () => setItems(await api("presets")), "");
  }, [opened]);
  return (
    <details onToggle={(e) => setOpened(e.currentTarget.open)}>
      <summary>Guardar configuración ▾</summary>
      <div className="inside stack">
        <p className="hint">
          Se guardan las instrucciones y los parámetros actuales de este
          formulario. Puedes incluir copias de sus adjuntos directos; los
          archivos heredados de otros niveles no se copian automáticamente. Una
          configuración compartida permite descargar sus adjuntos solo a las
          cuentas con las que la compartas. Las oficiales están disponibles para
          todas las cuentas aprobadas.
        </p>
        <div className="stack">
          <h3>Guardar esta configuración con un nombre</h3>
          <div className="stack">
            <div className="fields">
              <label>
                Nombre de la configuración
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={150}
                />
              </label>
              <label>
                Visibilidad
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  <option value="PERSONAL">Personal</option>
                  <option value="SHARED">Compartida</option>
                  <option value="OFFICIAL">Oficial · solo OWNER</option>
                </select>
              </label>
            </div>
            <label className="row">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
              />
              Incluir los adjuntos directos de este espacio
            </label>
            <button
              type="button"
              disabled={
                !name.replace(/^configuraci[oó]n\s*/i, "").trim() || t.busy
              }
              onClick={() =>
                void t.run(async () => {
                  const current = saveCurrent ? await saveCurrent() : category;
                  await api("presets", "POST", {
                    name,
                    prompt: current.prompt,
                    settings: current.settings ?? {},
                    applyPromptToAll: current.applyPromptToAll ?? true,
                    applySettingsToAll: current.applySettingsToAll ?? true,
                    visibility,
                    ...(scope === "category"
                      ? { sourceCategoryId: category.id }
                      : { sourceSubproductId: category.id }),
                    includeAttachments,
                  });
                  setItems(await api("presets"));
                }, "Configuración guardada")
              }
            >
              Guardar configuración actual
            </button>
          </div>
        </div>
        <SearchSelect
          label="Buscar o seleccionar una configuración guardada"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setSelected("");
          }}
          onSelect={(option) => {
            setSelected(option.id);
            setQuery(option.label);
          }}
          disabled={t.busy}
          options={items.map((i) => ({
            id: i.id,
            label: i.name,
            detail: `${i.visibility === "PERSONAL" ? "Personal" : i.visibility === "OFFICIAL" ? "Oficial" : "Compartida"} · ${i.attachmentCount ?? 0} adjuntos`,
          }))}
        />
        <label className="row">
          <input
            type="checkbox"
            checked={applyAttachments}
            onChange={(e) => setApplyAttachments(e.target.checked)}
          />
          Copiar también los adjuntos de la configuración
        </label>
        <p className="hint">
          Al aplicar se sustituyen instrucciones y parámetros. Los adjuntos se
          añaden como copias; no se eliminan los existentes. Aplicar nuevamente
          con adjuntos añade otra copia y consume espacio.
        </p>
        <button
          type="button"
          disabled={!selected || t.busy}
          onClick={() => {
            if (
              confirm(
                "¿Aplicar las instrucciones y parámetros guardados a este espacio y añadir sus adjuntos seleccionados? Las versiones anteriores quedarán en el historial.",
              )
            )
              void t.run(async () => {
                const preset = items.find(
                  (i) => i.id === selected || i.name === selected,
                );
                if (!preset)
                  throw new Error("Selecciona una configuración existente.");
                await api("presets/" + preset.id + "/apply", "POST", {
                  ...(scope === "category"
                    ? { categoryId: category.id }
                    : { subproductId: category.id }),
                  includeAttachments: applyAttachments,
                });
                window.location.reload();
              });
          }}
        >
          Aplicar configuración
        </button>
      </div>
      {t.notice}
    </details>
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
const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
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
            <button type="button" disabled={busy} onClick={close}>
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
  const search = normalizeSearch(query.trim());
  const filtered = items
    .filter(
      (i) =>
        (!visibility || i.visibility === visibility) &&
        normalizeSearch(
          i.name +
            " " +
            i.prompt +
            " " +
            (visibilityLabels[i.visibility] ?? i.visibility),
        ).includes(search),
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
      <h2>Presupuestos particulares · OWNER</h2>
      <p className="hint">
        Si existe un límite particular se aplica además del global. Cero bloquea
        nuevas reservas. Los importes son reservas en USD y no garantizan la
        factura final del proveedor.
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.notice}
    </section>
  );
}
