"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackgroundBatches } from "./background-batches";
type Job = {
  id: string;
  actorName: string;
  status: string;
  error: string | null;
  archivedAt: string | null;
  createdAt: string;
  projectId: string;
  canManage: boolean;
  reservedMicros: string;
  variation: { id: string; expired: boolean } | null;
  contexts: {
    projectName: string;
    productName?: string;
    subproductName?: string;
  }[];
};
type Data = {
  rows: Job[];
  total: number;
  page: number;
  pages: number;
  counts: Record<string, number>;
};
const labels: Record<string, string> = {
  PENDING: "Pendiente",
  RUNNING: "Procesando",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  UNCERTAIN: "Resultado incierto",
  CANCELLED: "Cancelada",
};
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    signal,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo completar la operación.");
  return b;
}
export function JobsPanel() {
  const [data, setData] = useState<Data | null>(null),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [order, setOrder] = useState("newest"),
    [archived, setArchived] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [processing, setProcessing] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [message, setMessage] = useState("");
  const sequence = useRef(0),
    pause = useRef(false),
    alive = useRef(true);
  const queryKey = `${page}:${status}:${order}:${archived}`;
  const currentQuery = useRef(queryKey);
  currentQuery.current = queryKey;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (currentQuery.current !== queryKey) return;
      const seq = ++sequence.current;
      setLoading(true);
      try {
        const result: Data = await request(
          `jobs/list?page=${page}&status=${status}&order=${order}&archived=${archived}`,
          "GET",
          undefined,
          signal,
        );
        if (
          seq === sequence.current &&
          alive.current &&
          currentQuery.current === queryKey
        ) {
          setData(result);
          setLoadError("");
          if (page > result.pages) setPage(result.pages);
          const unavailable = new Set(
            result.rows
              .filter((j) => j.status !== "PENDING" || !j.canManage)
              .map((j) => j.id),
          );
          setSelected((ids) => ids.filter((id) => !unavailable.has(id)));
        }
      } catch (e) {
        if (
          !signal?.aborted &&
          seq === sequence.current &&
          alive.current &&
          currentQuery.current === queryKey
        )
          setLoadError(
            e instanceof Error ? e.message : "No se pudo consultar la cola.",
          );
        throw e;
      } finally {
        if (
          seq === sequence.current &&
          alive.current &&
          currentQuery.current === queryKey
        )
          setLoading(false);
      }
    },
    [page, status, order, archived, queryKey],
  );
  const refreshJobs = useCallback(async () => {
    await refresh();
  }, [refresh]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pause.current = true;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      try {
        await refresh(controller.signal);
      } catch {
      } finally {
        fetching = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
      sequence.current++;
    };
  }, [refresh]);
  const visiblePending = (data?.rows ?? [])
      .filter((j) => j.status === "PENDING" && j.canManage)
      .map((j) => j.id),
    pending = selected.length ? selected : visiblePending;
  const action = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refreshJobs();
      if (alive.current) setMessage(success);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "No se pudo completar la operación.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const cancel = (ids: string[]) => {
    if (
      !confirm(
        `¿Cancelar ${ids.length} trabajos pendientes y liberar sus reservas locales? Los afiches en curso y los cargos inciertos se conservan.`,
      )
    )
      return;
    void action(async () => {
      await request("jobs/cancel-many", "POST", { ids });
      setSelected((current) => current.filter((id) => !ids.includes(id)));
    }, "Pendientes cancelados y reservas locales liberadas.");
  };
  const process = () => {
    const ids = [...pending];
    if (
      !confirm(
        `¿Procesar estos ${ids.length} trabajos ya autorizados usando sus reservas? Mantén esta pantalla abierta o usa segundo plano.`,
      )
    )
      return;
    pause.current = false;
    setProcessing(true);
    void action(async () => {
      try {
        for (const id of ids) {
          if (pause.current) break;
          const result = await request(`jobs/${id}/process`, "POST");
          if (alive.current) {
            setSelected((current) => current.filter((value) => value !== id));
            await refreshJobs();
          }
          if (result.status !== "COMPLETED")
            throw Error(
              result.error ??
                "El trabajo requiere revisión antes de continuar.",
            );
        }
      } finally {
        if (alive.current) setProcessing(false);
      }
    }, "Procesamiento detenido o finalizado. Los trabajos sin iniciar permanecen en cola.");
  };
  return (
    <section className="stack jobs-panel">
      <div>
        <div className="eyebrow">Producción en servidor</div>
        <h1>Generaciones</h1>
        <p className="muted">
          Consulta toda tu cola, filtra por estado y selecciona hasta 200
          pendientes entre páginas. OWNER consulta todas las cuentas; las demás
          ven sus propios trabajos.
        </p>
      </div>
      <div className="metrics">
        <div>
          <strong>
            {Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0)}
          </strong>
          <span>Trabajos registrados</span>
        </div>
        <div>
          <strong>{data?.counts.COMPLETED ?? 0}</strong>
          <span>Completados</span>
        </div>
        <div>
          <strong>{data?.counts.PENDING ?? 0}</strong>
          <span>Pendientes</span>
        </div>
        <div>
          <strong>{data?.counts.UNCERTAIN ?? 0}</strong>
          <span>Resultados inciertos · revisar</span>
        </div>
      </div>
      <div className="fields">
        <label>
          Filtrar generaciones por estado
          <select
            disabled={busy}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ordenar generaciones
          <select
            disabled={busy}
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Más recientes primero</option>
            <option value="oldest">Más antiguas primero</option>
          </select>
        </label>
        <label>
          Mostrar
          <select
            value={archived ? "archived" : "active"}
            disabled={busy}
            onChange={(e) => {
              setArchived(e.target.value === "archived");
              setSelected([]);
              setPage(1);
            }}
          >
            <option value="active">Generaciones actuales</option>
            <option value="archived">Retiradas del listado</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void refreshJobs().catch(() => {})}
        >
          Actualizar estado
        </button>
      </div>
      <div className="panel stack">
        <p>{selected.length} pendientes seleccionados · máximo 200</p>
        <div className="row">
          <button
            type="button"
            disabled={busy || !visiblePending.length || selected.length >= 200}
            onClick={() =>
              setSelected((ids) =>
                [...new Set([...ids, ...visiblePending])].slice(0, 200),
              )
            }
          >
            Seleccionar pendientes de esta página
          </button>
          <button
            type="button"
            disabled={busy || !selected.length}
            onClick={() => setSelected([])}
          >
            Limpiar selección
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || !selected.length}
            onClick={() => cancel([...selected])}
          >
            Cancelar seleccionados ({selected.length})
          </button>
        </div>
        <p className="hint">
          La selección se conserva al cambiar de página o filtro. Sin selección,
          el procesamiento utiliza solo los pendientes accesibles de la página
          actual. Cancelar libera reservas locales; no representa un reembolso
          del proveedor.
        </p>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {(error || loadError) && (
        <p role="alert" className="notice error">
          {error || loadError}
        </p>
      )}
      <BackgroundBatches
        pending={pending}
        refreshJobs={refreshJobs}
        disabled={busy}
      />
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy || !pending.length}
          onClick={process}
        >
          Procesar {pending.length} pendientes en esta pantalla
        </button>
        {processing && (
          <button
            type="button"
            onClick={() => {
              pause.current = true;
              setMessage(
                "Pausa solicitada. El afiche en curso termina; los siguientes permanecen pendientes.",
              );
            }}
          >
            Pausar después del actual
          </button>
        )}
      </div>
      {loading && !data && <p role="status">Consultando generaciones…</p>}
      {data && (
        <>
          <p className="hint">
            {data.total} coincidencias · página {data.page} de {data.pages} · 25
            por página
          </p>
          <div className="grid">
            {data.rows.map((j) => {
              const context = j.contexts[0];
              return (
                <article className="card gallery" key={j.id} data-job-id={j.id}>
                  <strong>
                    {context?.subproductName ??
                      context?.productName ??
                      context?.projectName ??
                      (j.projectId === "connection-test"
                        ? "Prueba de conexión"
                        : "Recurso no disponible")}
                  </strong>
                  {context && (
                    <p className="hint">
                      Proyecto: {context.projectName}
                      {context.productName && (
                        <> / Producto: {context.productName}</>
                      )}
                      {context.subproductName && (
                        <> / Subproducto: {context.subproductName}</>
                      )}
                    </p>
                  )}
                  <p className="hint">
                    {j.actorName} ·{" "}
                    {new Date(j.createdAt).toLocaleString("es-PE", {
                      timeZone: "America/Lima",
                    })}
                  </p>
                  {j.variation ? (
                    <img
                      loading="lazy"
                      src={"/api/variations/" + j.variation.id}
                      alt="Afiche generado"
                    />
                  ) : (
                    <div className="empty">
                      {j.status === "PENDING"
                        ? "En cola · pendiente de procesar"
                        : j.status === "RUNNING"
                          ? "Generando…"
                          : j.status === "COMPLETED"
                            ? "Archivo no disponible o caducado"
                            : "Sin resultado disponible"}
                    </div>
                  )}
                  <p>
                    <span className="badge">
                      {labels[j.status] ?? j.status}
                    </span>
                  </p>
                  {j.status === "PENDING" && j.canManage && (
                    <>
                      <label className="row">
                        <input
                          type="checkbox"
                          aria-label={"Seleccionar pendiente " + j.id}
                          disabled={
                            busy ||
                            (!selected.includes(j.id) && selected.length >= 200)
                          }
                          checked={selected.includes(j.id)}
                          onChange={(e) =>
                            setSelected((ids) =>
                              e.target.checked
                                ? [...new Set([...ids, j.id])].slice(0, 200)
                                : ids.filter((id) => id !== j.id),
                            )
                          }
                        />
                        Seleccionar pendiente
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => cancel([j.id])}
                      >
                        Cancelar pendiente
                      </button>
                    </>
                  )}
                  {j.canManage &&
                    !j.archivedAt &&
                    ["FAILED", "UNCERTAIN", "CANCELLED"].includes(j.status) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              j.status === "UNCERTAIN"
                                ? "La solicitud anterior pudo producir un cargo. ¿Autorizas otro intento con posible cargo adicional?"
                                : "¿Autorizas un nuevo intento con posible cargo de API?",
                            )
                          )
                            void action(async () => {
                              await request(`jobs/${j.id}/retry`, "POST", {
                                requestId: crypto.randomUUID(),
                                confirmCharge: true,
                                confirmUncertain: j.status === "UNCERTAIN",
                              });
                            }, "Nuevo intento encolado.");
                        }}
                      >
                        Reintentar con autorización
                      </button>
                    )}
                  {j.canManage &&
                    !["PENDING", "RUNNING"].includes(j.status) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !confirm(
                              j.archivedAt
                                ? "¿Restaurar este trabajo en el listado?"
                                : "¿Eliminar del listado? Se conservarán el afiche, el historial y el consumo, incluidos posibles cargos inciertos. No genera otra imagen ni devuelve saldo.",
                            )
                          )
                            return;
                          void action(
                            () =>
                              request(`jobs/${j.id}/archive`, "POST", {
                                restore: !!j.archivedAt,
                              }),
                            j.archivedAt
                              ? "Trabajo restaurado en el listado."
                              : "Trabajo retirado. Su consumo e historial se conservan.",
                          );
                        }}
                      >
                        {j.archivedAt
                          ? "Restaurar en el listado"
                          : "Eliminar del listado"}
                      </button>
                    )}
                  {j.error && <p className="notice error">{j.error}</p>}
                  {j.variation && (
                    <a href={"/api/variations/" + j.variation.id + "?download"}>
                      Descargar PNG →
                    </a>
                  )}
                </article>
              );
            })}
          </div>
          {!data.rows.length && (
            <div className="empty">No hay generaciones para este filtro.</div>
          )}
          <div className="row">
            <button
              type="button"
              disabled={busy || loading || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Página anterior
            </button>
            <button
              type="button"
              disabled={busy || loading || page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Página siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}
