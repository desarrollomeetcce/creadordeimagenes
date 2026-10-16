"use client";
import { useEffect, useState } from "react";
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
}: {
  category: { id: string; name: string; prompt: string; settings?: unknown };
}) {
  const [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [name, setName] = useState(""),
    [visibility, setVisibility] = useState("PERSONAL"),
    [includeAttachments, setIncludeAttachments] = useState(false),
    [applyAttachments, setApplyAttachments] = useState(true);
  const t = useAction();
  useEffect(() => {
    void t.run(async () => setItems(await api("presets")), "");
  }, []);
  return (
    <details>
      <summary>Guardar o aplicar una configuración reutilizable</summary>
      <div className="inside stack">
        <p className="hint">
          Se guardan las instrucciones y los parámetros ya guardados de esta
          categoría. Puedes incluir copias de sus adjuntos directos. Los
          archivos del proyecto y de los subproductos se administran por
          separado. Una configuración compartida permite descargar sus adjuntos
          a los usuarios aprobados.
        </p>
        <div className="fields">
          <label>
            Nombre
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
          Incluir los adjuntos de esta categoría
        </label>
        <button
          disabled={!name || t.busy}
          onClick={() =>
            void t.run(async () => {
              await api("presets", "POST", {
                name,
                prompt: category.prompt,
                settings: category.settings ?? {},
                visibility,
                sourceCategoryId: category.id,
                includeAttachments,
              });
              setItems(await api("presets"));
            }, "Configuración guardada")
          }
        >
          Guardar configuración actual
        </button>
        <label>
          Buscar configuración
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Selecciona una configuración</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.visibility} · {i.attachmentCount ?? 0} adjuntos
              </option>
            ))}
          </select>
        </label>
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
          disabled={!selected || t.busy}
          onClick={() => {
            if (
              confirm(
                "¿Reemplazar las instrucciones y parámetros de esta categoría y copiar los adjuntos seleccionados? Sus versiones anteriores quedarán en el historial.",
              )
            )
              void t.run(async () => {
                const preset = items.find(
                  (i) => i.id === selected || i.name === selected,
                );
                if (!preset)
                  throw new Error("Selecciona una configuración existente.");
                await api("presets/" + preset.id + "/apply", "POST", {
                  categoryId: category.id,
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
function PresetDetails({
  preset,
  refresh,
}: {
  preset: {
    id: string;
    name: string;
    prompt: string;
    settings: unknown;
    visibility: string;
    attachmentCount: number;
    canEdit: boolean;
  };
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<
    { id: string; name: string; size: number; purpose: string }[]
  >([]);
  const t = useAction();
  useEffect(() => {
    if (!open) return;
    let active = true;
    void t.run(async () => {
      const data = await api(
        `attachments?scope=preset&id=${encodeURIComponent(preset.id)}`,
      );
      if (active) setFiles(data);
    }, "");
    return () => {
      active = false;
    };
  }, [open, preset.id]);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Detalles y adjuntos · {preset.attachmentCount ?? 0}</summary>
      <div className="inside stack">
        {files.map((f) => (
          <a
            key={f.id}
            href={"/api/attachments/" + f.id}
            target="_blank"
            rel="noreferrer"
          >
            {f.name} · {f.purpose} · {Math.ceil(f.size / 1024)} KB
          </a>
        ))}
        {!files.length && <p className="hint">Sin adjuntos reutilizables.</p>}
        {preset.canEdit && (
          <form
            key={preset.name + preset.prompt + preset.visibility}
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void t.run(async () => {
                await api("presets/" + preset.id, "PATCH", {
                  ...data,
                  settings: preset.settings,
                });
                await refresh();
              });
            }}
          >
            <label>
              Nombre de la configuración
              <input
                name="name"
                defaultValue={preset.name}
                required
                maxLength={150}
              />
            </label>
            <label>
              Instrucciones guardadas
              <textarea
                name="prompt"
                defaultValue={preset.prompt}
                maxLength={30000}
                rows={6}
              />
            </label>
            <label>
              Visibilidad de la configuración
              <select name="visibility" defaultValue={preset.visibility}>
                <option value="PERSONAL">Personal</option>
                <option value="SHARED">Compartida</option>
                <option value="OFFICIAL">Oficial · solo OWNER</option>
              </select>
            </label>
            <p className="hint">
              Compartir permite a las cuentas aprobadas consultar, duplicar y
              aplicar esta configuración, incluidos sus archivos. Para cambiar
              los adjuntos, guarda una nueva configuración desde una categoría.
            </p>
            <button disabled={t.busy}>Actualizar configuración</button>
          </form>
        )}
        {t.notice}
      </div>
    </details>
  );
}
export function Presets() {
  const [items, setItems] = useState<any[]>([]),
    [query, setQuery] = useState("");
  const t = useAction();
  const refresh = async () => setItems(await api("presets"));
  useEffect(() => {
    void t.run(refresh, "");
  }, []);
  return (
    <>
      <h1>Configuraciones guardadas</h1>
      <p className="muted">
        Guarda configuraciones desde una categoría y aplícalas a nuevas
        campañas.
      </p>
      <input
        aria-label="Buscar configuraciones"
        placeholder="Buscar…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 20 }}
      />
      <div className="grid">
        {items
          .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
          .map((i) => (
            <article className="card" key={i.id}>
              <h3>{i.name}</h3>
              <span className="badge">{i.visibility}</span>
              <p>{i.prompt.slice(0, 200)}</p>
              <PresetDetails preset={i} refresh={refresh} />
              <div className="row">
                <button
                  disabled={t.busy}
                  onClick={() =>
                    void t.run(async () => {
                      await api("presets/" + i.id + "/duplicate", "POST", {});
                      await refresh();
                    }, "Copia personal creada")
                  }
                >
                  Duplicar
                </button>
                {i.canEdit && (
                  <button
                    disabled={t.busy}
                    className="danger"
                    onClick={() => {
                      if (
                        confirm(
                          "¿Eliminar esta configuración y sus adjuntos? Las copias aplicadas a categorías se conservan.",
                        )
                      )
                        void t.run(async () => {
                          await api("presets/" + i.id, "DELETE");
                          await refresh();
                        });
                    }}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {t.notice}
    </>
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
