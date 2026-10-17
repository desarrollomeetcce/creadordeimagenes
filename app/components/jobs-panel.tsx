"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderTree,
  FolderBreadcrumbs,
  folderScope,
  hierarchyFolder,
  type FolderNode,
} from "./folder-navigation";
import { BackgroundBatches } from "./background-batches";
import {
  HierarchyFilters,
  hierarchyFromLocation,
  costLink,
  type HierarchyValue,
} from "./hierarchy-filters";
import { usdMicros } from "../../lib/usage-format";
type Job = {
  waitingApproval: boolean;
  isPreview: boolean;
  id: string;
  actorName: string;
  status: string;
  error: string | null;
  archivedAt: string | null;
  createdAt: string;
  projectId: string;
  canManage: boolean;
  reservedMicros: string;
  actualMicros: string | null;
  variation: { id: string; expired: boolean; reviewStatus: string } | null;
  contexts: {
    projectName: string;
    projectId?: string;
    productName?: string;
    productId?: string;
    subproductName?: string;
    subproductId?: string;
  }[];
};
type Data = {
  rows: Job[];
  total: number;
  limit: number;
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
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const latestData = useRef<Data | null>(null);
  useEffect(() => {
    void request("library/tree")
      .then((nodes: FolderNode[]) =>
        setFolders(nodes.filter((n) => n.kind !== "folder")),
      )
      .catch(() => {});
  }, []);
  const [data, setData] = useState<Data | null>(null),
    [hierarchy, setHierarchy] = useState<HierarchyValue>(hierarchyFromLocation),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [order, setOrder] = useState("newest"),
    [archived, setArchived] = useState(false),
    [size, setSize] = useState("25"),
    [thumbnail, setThumbnail] = useState("medium"),
    [q, setQ] = useState(""),
    [format, setFormat] = useState("png"),
    [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [processing, setProcessing] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [message, setMessage] = useState("");
  const sequence = useRef(0),
    pause = useRef(false),
    alive = useRef(true),
    selectionRows = useRef(new Map<string, Job>());
  latestData.current = data;
  const params = new URLSearchParams({
    page: String(page),
    status,
    order,
    archived: String(archived),
    size,
    q,
    ...hierarchy,
  }).toString();
  const currentQuery = useRef(params);
  currentQuery.current = params;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (currentQuery.current !== params) return;
      const seq = ++sequence.current;
      setLoading(true);
      try {
        const result: Data = await request(
          "jobs/list?" + params,
          "GET",
          undefined,
          signal,
        );
        if (
          seq === sequence.current &&
          alive.current &&
          currentQuery.current === params
        ) {
          setData(result);
          setLoadError("");
          if (page > result.pages) setPage(result.pages);
          for (const row of result.rows) selectionRows.current.set(row.id, row);
          const unavailable = new Set(
            result.rows
              .filter((j) => !j.canManage && !j.variation)
              .map((j) => j.id),
          );
          setSelected((ids) => ids.filter((id) => !unavailable.has(id)));
        }
      } catch (e) {
        if (
          !signal?.aborted &&
          seq === sequence.current &&
          alive.current &&
          currentQuery.current === params
        ) {
          setData(null);
          setLoadError(
            e instanceof Error ? e.message : "No se pudo consultar el listado.",
          );
        }
        throw e;
      } finally {
        if (
          seq === sequence.current &&
          alive.current &&
          currentQuery.current === params
        )
          setLoading(false);
      }
    },
    [params, page],
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
    const debounce = setTimeout(() => void load(), 180);
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        (latestData.current?.counts.PENDING ?? 0) +
          (latestData.current?.counts.RUNNING ?? 0) >
          0
      )
        void load();
    }, 10000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    const channel = new BroadcastChannel("studio-updates");
    channel.onmessage = focus;
    return () => {
      controller.abort();
      clearTimeout(debounce);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      channel.close();
      sequence.current++;
    };
  }, [refresh]);
  const visiblePending = (data?.rows ?? [])
    .filter((j) => j.status === "PENDING" && j.canManage && !j.waitingApproval)
    .map((j) => j.id);
  const selectedRows = selected.flatMap((id) =>
    selectionRows.current.has(id) ? [selectionRows.current.get(id)!] : [],
  );
  const pending = selected.length
    ? selectedRows
        .filter(
          (j) => j.status === "PENDING" && j.canManage && !j.waitingApproval,
        )
        .map((j) => j.id)
    : visiblePending;
  const downloadable = [
    ...new Set(
      selectedRows.flatMap((j) => (j.variation ? [j.variation.id] : [])),
    ),
  ];
  const manageable =
    selectedRows.length > 0 &&
    selectedRows.every((j) => j.canManage && j.status !== "RUNNING");
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
  const toggle = (job: Job, checked: boolean) => {
    selectionRows.current.set(job.id, job);
    setSelected((ids) =>
      checked
        ? [...new Set([...ids, job.id])].slice(0, 200)
        : ids.filter((id) => id !== job.id),
    );
  };
  const cancel = (ids: string[]) => {
    if (
      !confirm(
        `¿Cancelar ${ids.length} pendientes y liberar sus reservas locales? Los cargos inciertos se conservan.`,
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
        `¿Procesar estos ${ids.length} trabajos ya autorizados? Mantén esta pantalla abierta o usa segundo plano.`,
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
  const archive = (ids: string[], restore: boolean) => {
    if (
      !confirm(
        restore
          ? "¿Restaurar la selección en el listado?"
          : "¿Eliminar del listado? Los pendientes se cancelan y liberan su reserva local. Se conservan afiches, historial y cargos inciertos. No representa un reembolso.",
      )
    )
      return;
    void action(
      async () => {
        await request("jobs/archive-many", "POST", { ids, restore });
        setSelected((current) => current.filter((id) => !ids.includes(id)));
      },
      restore
        ? "Selección restaurada."
        : "Selección retirada del listado; historial y consumo conservados.",
    );
  };
  return (
    <section className="stack jobs-panel">
      <div>
        <div className="eyebrow">Producción en servidor</div>
        <h1>Generaciones</h1>
        <p className="muted">
          Consulta tus trabajos y las imágenes terminadas de espacios
          disponibles para tu cuenta. Solo el autor u OWNER administra cada
          trabajo.
        </p>
      </div>
      <div className="explorer-layout">
        <FolderTree
          nodes={folders}
          current={hierarchyFolder(hierarchy)}
          onOpen={(key) => {
            setHierarchy(folderScope(folders, key, hierarchy));
            setPage(1);
            setSelected([]);
          }}
        />
        <div className="explorer-content stack">
          <FolderBreadcrumbs
            nodes={folders}
            current={hierarchyFolder(hierarchy)}
            root="Generaciones"
            onOpen={(key) => {
              setHierarchy(folderScope(folders, key, hierarchy));
              setPage(1);
            }}
          />
          <HierarchyFilters
            value={hierarchy}
            disabled={busy}
            onChange={(value) => {
              setHierarchy(value);
              setPage(1);
            }}
          />
          <div className="metrics compact-metrics">
            <span>
              <strong>{data?.counts.COMPLETED ?? 0}</strong> Completados
            </span>
            <span>
              <strong>{data?.counts.PENDING ?? 0}</strong> Pendientes
            </span>
            <span>
              <strong>{data?.counts.RUNNING ?? 0}</strong> Generándose
            </span>
            <span>
              <strong>{data?.counts.UNCERTAIN ?? 0}</strong> Por revisar
            </span>
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
          {loading && !data && <p role="status">Consultando generaciones…</p>}
          {data && (
            <>
              <div
                className="row selection-toolbar"
                aria-label="Acciones de la selección"
              >
                <details className="other-filters">
                  <summary>Otros filtros</summary>
                  <div className="toolbar-popover stack">
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
                        {Object.entries(labels).map(([id, label]) => (
                          <option key={id} value={id}>
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
                        disabled={busy}
                        value={archived ? "archived" : "active"}
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
                </details>
                <label>
                  Resultados por página
                  <select
                    disabled={busy}
                    value={size}
                    onChange={(e) => {
                      setSize(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </label>
                <label>
                  Tamaño de miniaturas
                  <select
                    value={thumbnail}
                    onChange={(e) => setThumbnail(e.target.value)}
                  >
                    <option value="small">Pequeño</option>
                    <option value="medium">Mediano</option>
                    <option value="large">Muy grande</option>
                  </select>
                </label>

                <details className="queue-menu">
                  <summary>
                    Generar / cola · {data?.counts.PENDING ?? 0}
                  </summary>
                  <div className="toolbar-popover stack">
                    <details
                      onToggle={(e) => setBackgroundOpen(e.currentTarget.open)}
                    >
                      <summary>
                        Generar en segundo plano · {pending.length} en cola
                      </summary>
                      {backgroundOpen && (
                        <BackgroundBatches
                          pending={pending}
                          refreshJobs={refreshJobs}
                          disabled={busy}
                        />
                      )}
                    </details>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || !pending.length}
                      onClick={process}
                    >
                      Generar ahora ({pending.length})
                    </button>
                    <button
                      type="button"
                      disabled={!processing}
                      onClick={() => {
                        pause.current = true;
                        setMessage(
                          "Se detendrá al terminar la imagen en curso.",
                        );
                      }}
                    >
                      Parar cola
                    </button>
                    <span>{data?.counts.RUNNING ?? 0} generándose</span>
                  </div>
                </details>
                <details>
                  <summary>Acciones · {selected.length} seleccionados</summary>
                  <div className="toolbar-popover stack">
                    <button
                      type="button"
                      disabled={busy || !data.rows.length}
                      onClick={() =>
                        setSelected(
                          data.rows
                            .filter((j) => j.canManage || j.variation)
                            .map((j) => j.id)
                            .slice(0, 200),
                        )
                      }
                    >
                      Seleccionar esta página
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const rows: Job[] = [];
                          for (let page = 1; page <= 2; page++) {
                            const p = new URLSearchParams(params);
                            p.set("page", String(page));
                            p.set("size", "100");
                            const batch = await request("jobs/list?" + p);
                            rows.push(...batch.rows);
                            if (batch.pages <= page) break;
                          }
                          rows.forEach((j) =>
                            selectionRows.current.set(j.id, j),
                          );
                          setSelected(
                            rows
                              .filter((j) => j.canManage || j.variation)
                              .slice(0, 200)
                              .map((j) => j.id),
                          );
                        }, "Selección completa (máximo 200).")
                      }
                    >
                      Seleccionar todo · máximo 200
                    </button>
                    <button type="button" onClick={() => setSelected([])}>
                      Limpiar selección
                    </button>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !selectedRows.some(
                          (j) => j.status === "PENDING" && j.canManage,
                        )
                      }
                      onClick={() =>
                        cancel(
                          selectedRows
                            .filter(
                              (j) => j.status === "PENDING" && j.canManage,
                            )
                            .map((j) => j.id),
                        )
                      }
                    >
                      Cancelar generaciones sin iniciar
                    </button>
                  </div>
                </details>
                <label>
                  Formato
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !downloadable.length}
                  onClick={() =>
                    void action(async () => {
                      await (
                        await import("./collection-gallery")
                      ).downloadArchive({ ids: downloadable, format });
                    }, "Descarga preparada.")
                  }
                >
                  Descargar ({downloadable.length})
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy || !manageable}
                  onClick={() => archive([...selected], archived)}
                >
                  {archived ? "Restaurar seleccionados" : "Eliminar"}
                </button>
              </div>
              <div className={"grid jobs-grid size-" + thumbnail}>
                {data.rows.map((j) => {
                  const context = j.contexts[0];
                  return (
                    <article
                      className="card gallery"
                      key={j.id}
                      data-job-id={j.id}
                    >
                      {(j.canManage || j.variation) && (
                        <label className="row">
                          <input
                            type="checkbox"
                            aria-label={"Seleccionar trabajo " + j.id}
                            checked={selected.includes(j.id)}
                            disabled={
                              busy ||
                              (!selected.includes(j.id) &&
                                selected.length >= 200)
                            }
                            onChange={(e) => toggle(j, e.target.checked)}
                          />
                          Seleccionar
                        </label>
                      )}
                      <strong>
                        {context?.subproductName ??
                          context?.productName ??
                          context?.projectName ??
                          (j.projectId === "connection-test"
                            ? "Prueba de conexión de IA"
                            : "Recurso no disponible")}
                      </strong>
                      {context && (
                        <p className="hint job-path">
                          {context.projectId ? (
                            <a
                              href={
                                "?" +
                                new URLSearchParams({
                                  view: "projects",
                                  project: context.projectId,
                                })
                              }
                            >
                              Proyecto: {context.projectName}
                            </a>
                          ) : (
                            <>Sin proyecto · prueba de IA</>
                          )}
                          {context.productName && (
                            <>
                              {" "}
                              /{" "}
                              <a
                                href={
                                  "?" +
                                  new URLSearchParams({
                                    view: "projects",
                                    category: context.productId ?? "",
                                  })
                                }
                              >
                                Producto: {context.productName}
                              </a>
                            </>
                          )}
                          {context.subproductName && (
                            <>
                              {" "}
                              /{" "}
                              <a
                                href={
                                  "?" +
                                  new URLSearchParams({
                                    view: "projects",
                                    gallery: context.subproductId ?? "",
                                  })
                                }
                              >
                                Subproducto: {context.subproductName}
                              </a>
                            </>
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
                          src={
                            "/api/variations/" +
                            j.variation.id +
                            "?thumbnail=true"
                          }
                          alt={
                            "Variación de " +
                            (context?.subproductName ??
                              context?.projectName ??
                              "prueba de IA")
                          }
                        />
                      ) : (
                        <div className="empty">
                          {j.status === "PENDING"
                            ? "En cola · pendiente de procesar"
                            : "Sin resultado disponible"}
                        </div>
                      )}
                      <span
                        className={"badge status-" + j.status.toLowerCase()}
                      >
                        {labels[j.status] ?? j.status}
                      </span>
                      <p className="hint">
                        Coste informado:{" "}
                        {j.actualMicros === null
                          ? "No informado"
                          : "USD " + usdMicros(j.actualMicros)}
                        <br />
                        Reserva inicial: USD {usdMicros(j.reservedMicros)}
                      </p>
                      {(context?.projectId ||
                        j.projectId === "connection-test") && (
                        <a
                          href={costLink({
                            project:
                              j.projectId === "connection-test"
                                ? "none"
                                : (context?.projectId ?? ""),
                            product: context?.productId ?? "",
                            subproduct: context?.subproductId ?? "",
                            from: hierarchy.from,
                            to: hierarchy.to,
                          })}
                        >
                          Ver costos de este ámbito →
                        </a>
                      )}
                      {j.waitingApproval && (
                        <p className="notice">
                          En espera de que apruebes la primera muestra. No se
                          harán llamadas de IA para esta variación todavía.
                        </p>
                      )}
                      {j.isPreview && (
                        <span className="badge">Primera muestra</span>
                      )}
                      {j.canManage &&
                        j.variation &&
                        j.variation.reviewStatus !== "APPROVED" && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                const result = await request(
                                  `jobs/${j.id}/approve`,
                                  "POST",
                                );
                                const channel = new BroadcastChannel(
                                  "studio-updates",
                                );
                                channel.postMessage("approved");
                                channel.close();
                                if (result.pending.length) {
                                  const runner =
                                    await request("jobs/background");
                                  if (runner.available) {
                                    await request("jobs/background", "POST", {
                                      ids: result.pending,
                                      requestId: crypto.randomUUID(),
                                    });
                                  } else {
                                    setProcessing(true);
                                    pause.current = false;
                                    try {
                                      for (const id of result.pending) {
                                        if (pause.current || !alive.current)
                                          break;
                                        await request(
                                          `jobs/${id}/process`,
                                          "POST",
                                        );
                                        await refreshJobs();
                                      }
                                    } finally {
                                      setProcessing(false);
                                    }
                                  }
                                }
                              }, "Muestra aprobada y conservada en Biblioteca. Revisa el avance del resto del lote.")
                            }
                          >
                            {j.isPreview
                              ? "Aprobar muestra y continuar"
                              : "Aprobar y guardar en Biblioteca"}
                          </button>
                        )}
                      {j.variation?.reviewStatus === "APPROVED" && (
                        <a
                          className="button"
                          target="_blank"
                          rel="noopener"
                          href={
                            "?" +
                            new URLSearchParams({
                              view: "library",
                              project:
                                j.projectId === "connection-test"
                                  ? "none"
                                  : (context?.projectId ?? ""),
                              product: context?.productId ?? "",
                              subproduct: context?.subproductId ?? "",
                            })
                          }
                        >
                          Ir a Biblioteca ↗
                        </a>
                      )}
                      {j.canManage && j.status === "PENDING" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => cancel([j.id])}
                        >
                          Cancelar pendiente
                        </button>
                      )}
                      {j.canManage &&
                        !j.archivedAt &&
                        ["FAILED", "UNCERTAIN", "CANCELLED"].includes(
                          j.status,
                        ) && (
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
                                void action(
                                  () =>
                                    request(`jobs/${j.id}/retry`, "POST", {
                                      requestId: crypto.randomUUID(),
                                      confirmCharge: true,
                                      confirmUncertain:
                                        j.status === "UNCERTAIN",
                                    }),
                                  "Nuevo intento encolado.",
                                );
                            }}
                          >
                            Reintentar con autorización
                          </button>
                        )}
                      {j.canManage && j.status !== "RUNNING" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => archive([j.id], !!j.archivedAt)}
                        >
                          {j.archivedAt
                            ? "Restaurar en el listado"
                            : "Eliminar"}
                        </button>
                      )}
                      {j.error && <p className="notice error">{j.error}</p>}
                      {j.variation && (
                        <a
                          href={
                            "/api/variations/" + j.variation.id + "?download"
                          }
                        >
                          Descargar PNG →
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>
              {!data.rows.length && (
                <div className="empty">
                  No hay generaciones para este filtro.
                </div>
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
        </div>
      </div>
    </section>
  );
}
