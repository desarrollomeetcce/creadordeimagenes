"use client";
import { PasswordInput } from "./password-input";
import { useEffect, useState } from "react";
type Policy = {
  enabled: boolean;
  retentionDays: number;
  limitMb: number;
  revision: number;
  usedBytes: number;
  available: number;
  missing: number;
  pendingCleanup: number;
};
type Row = {
  id: string;
  variationId: string;
  versionNumber: number;
  actorName: string;
  projectName: string;
  productName: string;
  subproductName: string;
  model: string;
  available: boolean;
  status: string;
  createdAt: string;
  expiresAt: string;
};
type List = { rows: Row[]; page: number; pages: number; total: number };
async function request(path: string, method = "GET", data?: unknown) {
  const response = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(
      result.error ?? "No se pudo completar la operación de auditoría visual.",
    );
  return result;
}
const date = (value: string) =>
  new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" });
export function VisualAuditNotice() {
  const [notice, setNotice] = useState<{
      enabled: boolean;
      retentionDays: number;
    } | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void request("privacy/visual-audit")
        .then((data) => {
          if (active) {
            setNotice(data);
            setError(false);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
    };
    refresh();
    window.addEventListener("visual-audit-policy", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60000);
    return () => {
      active = false;
      window.removeEventListener("visual-audit-policy", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  return (
    <aside
      className="notice visual-audit-notice"
      aria-label="Conservación de miniaturas de auditoría"
    >
      {notice ? (
        notice.enabled ? (
          <>
            Privacidad: las nuevas versiones guardadas conservan una miniatura
            comprimida durante <strong>{notice.retentionDays} días</strong>,
            visible solo para el OWNER. Borrar proyectos o afiches no elimina
            esa miniatura. Los originales y la biblioteca tienen su propia
            conservación.
          </>
        ) : (
          <>
            Privacidad: la conservación de miniaturas de nuevas versiones está
            desactivada. Las anteriores pueden seguir disponibles para el OWNER
            hasta su caducidad.
          </>
        )
      ) : error ? (
        "No se pudo consultar la política de miniaturas. Consulta al OWNER antes de generar contenido sensible."
      ) : (
        "Consultando la política de conservación de miniaturas…"
      )}
    </aside>
  );
}
export function VisualAuditPanel() {
  const [policy, setPolicy] = useState<Policy | null>(null),
    [rows, setRows] = useState<List | null>(null),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void request("visual-audit/policy")
      .then((data) => {
        if (active) setPolicy(data);
      })
      .catch((e: Error) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void request(`visual-audit?q=${encodeURIComponent(q)}&page=${page}`)
        .then((data) => {
          if (active) setRows(data);
        })
        .catch((e: Error) => {
          if (active) setMessage(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, page, refresh]);
  async function run(
    operation: () => Promise<{ message?: string }>,
    fallback: string,
    form?: HTMLFormElement,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const result = await operation();
      form?.reset();
      setMessage(result.message ?? fallback);
      setRefresh((n) => n + 1);
      window.dispatchEvent(new Event("visual-audit-policy"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar la operación.",
      );
    } finally {
      if (form)
        for (const input of form.querySelectorAll<HTMLInputElement>(
          'input[data-secret-input]',
        ))
          input.value = "";
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <h1>Auditoría visual y conservación</h1>
      <p>
        Solo OWNER puede consultar estas miniaturas y administrar su
        conservación. Se registra cada nueva versión generada, editada,
        restaurada o duplicada desde esta actualización; no se procesan afiches
        anteriores automáticamente.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {policy && (
        <section className="panel stack">
          <h2>Política de conservación</h2>
          <p>
            {policy.available} miniaturas disponibles ·{" "}
            {(policy.usedBytes / 1048576).toFixed(2)} MB de {policy.limitMb} MB
            · {policy.pendingCleanup} caducadas pendientes de limpieza.
          </p>
          {policy.missing > 0 && (
            <p role="alert" className="notice">
              Hay {policy.missing} versiones sin miniatura por falta de espacio.
              Sus afiches se conservaron; amplía la capacidad para próximas
              versiones. Estas miniaturas no se recuperan automáticamente.
            </p>
          )}
          <form
            key={policy.revision}
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget,
                data = new FormData(form),
                applyToExisting = data.get("applyToExisting") === "on";
              if (
                applyToExisting &&
                !confirm(
                  "¿Aplicar el plazo desde la fecha de creación de las miniaturas existentes? Acortarlo puede hacer que caduquen de inmediato. No recupera las ya eliminadas o caducadas.",
                )
              )
                return;
              void run(
                () =>
                  request("visual-audit/policy", "PUT", {
                    enabled: data.get("enabled") === "on",
                    retentionDays: Number(data.get("retentionDays")),
                    limitMb: Number(data.get("limitMb")),
                    expectedRevision: policy.revision,
                    applyToExisting,
                    currentPassword: data.get("currentPassword"),
                  }),
                "Política guardada.",
                form,
              );
            }}
          >
            <fieldset disabled={busy} className="stack">
              <legend>Conservación independiente de los originales</legend>
              <label className="row">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={policy.enabled}
                />
                Conservar miniaturas de nuevas versiones
              </label>
              <label>
                Días de conservación · puedes usar 30, 90, 365 u otro plazo
                entre 1 y 3650
                <input
                  type="number"
                  name="retentionDays"
                  defaultValue={policy.retentionDays}
                  min={1}
                  max={3650}
                  required
                />
              </label>
              <label>
                Espacio máximo de miniaturas · MB, entre 1 y 256
                <input
                  type="number"
                  name="limitMb"
                  defaultValue={policy.limitMb}
                  min={1}
                  max={256}
                  required
                />
              </label>
              <label className="row">
                <input type="checkbox" name="applyToExisting" />
                Aplicar este plazo también a miniaturas existentes que aún no
                caducaron
              </label>
              <p className="hint">
                Por defecto los cambios se aplican a nuevas versiones.
                Desactivar la captura no elimina las anteriores. El plazo se
                cuenta desde la creación de cada versión. Las miniaturas ocupan
                espacio en la base de datos y, con almacenamiento PostgreSQL,
                también cuentan para su límite global.
              </p>
              <label>
                Tu contraseña actual de OWNER
                <PasswordInput
                  name="currentPassword"
                  autoComplete="current-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <button className="primary">Guardar política de auditoría</button>
            </fieldset>
          </form>
          <p className="hint">
            Una miniatura caducada deja de mostrarse inmediatamente. La limpieza
            física se ejecuta al procesar nuevos trabajos o con el botón
            siguiente. Si el servidor permanece inactivo, hay que programar su
            limpieza periódica.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await request("visual-audit/cleanup", "POST");
                return {
                  message: `${result.removed} miniaturas caducadas eliminadas físicamente. Los originales y registros de actividad se conservan. Si hay más pendientes, repite la limpieza.`,
                };
              }, "Limpieza terminada.")
            }
          >
            Limpiar miniaturas caducadas
          </button>
        </section>
      )}
      <section className="panel stack">
        <h2>Versiones registradas</h2>
        <label>
          Buscar por persona, proyecto, producto, subproducto o modelo
          <input
            value={q}
            maxLength={200}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {loading && <p role="status">Consultando miniaturas…</p>}
        {rows && (
          <>
            <p>
              {rows.total} registros · página {rows.page} de {rows.pages}
            </p>
            <div className="visual-audit-grid" aria-busy={loading}>
              {rows.rows.map((row) => (
                <article className="panel stack visual-audit-card" key={row.id}>
                  {row.available ? (
                    <a
                      href={`/api/visual-audit/${row.id}/image`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir miniatura de ${row.subproductName || row.projectName}, versión ${row.versionNumber}`}
                    >
                      {/* Private images deliberately bypass shared image optimization caches. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        loading="lazy"
                        width={192}
                        height={192}
                        src={`/api/visual-audit/${row.id}/image`}
                        alt={`Miniatura de ${row.subproductName || row.projectName}, versión ${row.versionNumber}`}
                      />
                    </a>
                  ) : (
                    <p className="muted">
                      {row.status === "NO_SPACE"
                        ? "No se guardó por falta de espacio"
                        : row.status === "REMOVED"
                          ? "Miniatura eliminada por OWNER"
                          : "Miniatura caducada"}
                    </p>
                  )}
                  <strong>{row.projectName}</strong>
                  <span>
                    {[row.productName, row.subproductName]
                      .filter(Boolean)
                      .join(" / ") || "Sin producto"}
                  </span>
                  <small>
                    {row.actorName} · versión {row.versionNumber} · {row.model}
                  </small>
                  <small>Creación: {date(row.createdAt)} · Lima</small>
                  <small>Caducidad: {date(row.expiresAt)} · Lima</small>
                  {row.available && (
                    <details>
                      <summary>Eliminar solo esta miniatura</summary>
                      <form
                        className="stack"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          if (
                            !confirm(
                              "¿Eliminar esta miniatura de auditoría? No se puede recuperar. El afiche y los registros de actividad se conservan.",
                            )
                          )
                            return;
                          const currentPassword = new FormData(form).get(
                            "currentPassword",
                          );
                          void run(
                            () =>
                              request(`visual-audit/${row.id}`, "DELETE", {
                                currentPassword,
                              }),
                            "Miniatura eliminada; afiche y registros conservados.",
                            form,
                          );
                        }}
                      >
                        <label>
                          Tu contraseña actual de OWNER
                          <PasswordInput
                            name="currentPassword"
                            autoComplete="current-password"
                            minLength={12}
                            maxLength={128}
                            required
                            disabled={busy}
                          />
                        </label>
                        <button className="danger" disabled={busy}>
                          Eliminar miniatura
                        </button>
                      </form>
                    </details>
                  )}
                </article>
              ))}
            </div>
            {rows.total === 0 && (
              <p>No hay versiones registradas para esta búsqueda.</p>
            )}
            <div className="row">
              <button
                disabled={loading || page <= 1}
                onClick={() => setPage((n) => n - 1)}
              >
                Página anterior
              </button>
              <button
                disabled={loading || page >= rows.pages}
                onClick={() => setPage((n) => n + 1)}
              >
                Página siguiente
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
