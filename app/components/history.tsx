"use client";
import { useEffect, useState } from "react";
type Context = {
  projectName: string;
  productName?: string;
  subproductName?: string;
};
type Row = {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  summary: string;
  contexts: Context[];
  contextSource: string;
  note: string | null;
  details: { label: string; value: string }[];
};
type History = { rows: Row[]; page: number; pages: number; total: number };
export function HistoryPanel() {
  const [data, setData] = useState<History | null>(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    const timer = setTimeout(() => {
      void fetch(
        `/api/audit/history?q=${encodeURIComponent(query)}&page=${page}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok)
            throw Error(result.error ?? "No se pudo consultar el historial.");
          if (active) setData(result);
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, page, refresh]);
  return (
    <section className="stack utility-history">
      <div className="utility-section-heading">
        <div>
          <span className="utility-eyebrow">Registro de actividad</span>
          <h2>Todo en una línea de tiempo</h2>
        </div>
        <span className="utility-count">
          {data?.total.toLocaleString("es-PE") ?? "…"} actividades
        </span>
      </div>
      <div className="utility-search-toolbar">
        <label className="utility-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="Filtrar historial"
            placeholder="Buscar persona, proyecto o actividad…"
            value={query}
            maxLength={200}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRefresh((n) => n + 1)}
        >
          ↻ Actualizar
        </button>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {busy && <p role="status">Consultando actividades…</p>}
      {data && (
        <>
          <div className="history-timeline" aria-busy={busy}>
            {data.rows.map((row) => (
              <details className="panel history-entry" key={row.id}>
                <summary>
                  <span className="history-actor-avatar" aria-hidden="true">
                    {row.actorName[0]?.toUpperCase() ?? "•"}
                  </span>
                  <span className="history-entry-summary">
                    <span className="history-entry-person">
                      {row.actorName}
                      <time dateTime={row.createdAt}>
                        {new Date(row.createdAt).toLocaleString("es-PE", {
                          timeZone: "America/Lima",
                        })}{" "}
                        · Lima
                      </time>
                    </span>
                    <strong>{row.summary}</strong>
                    <small className="muted">Ver detalles</small>
                  </span>
                </summary>
                <div className="stack history-entry-details">
                  <p>
                    <strong>Operación:</strong> {row.action}
                  </p>
                  {row.contexts.length > 0 && (
                    <div className="stack">
                      <strong>
                        Proyectos, productos y subproductos involucrados
                      </strong>
                      {row.contexts.map((context, index) => (
                        <div className="history-context" key={index}>
                          <span>
                            <strong>Proyecto:</strong> {context.projectName}
                          </span>
                          {context.productName && (
                            <span>
                              <strong>Producto:</strong> {context.productName}
                            </span>
                          )}
                          {context.subproductName && (
                            <span>
                              <strong>Subproducto:</strong>{" "}
                              {context.subproductName}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {row.details.length > 0 && (
                    <dl className="history-facts">
                      {row.details.map((detail) => (
                        <div key={detail.label}>
                          <dt>{detail.label}</dt>
                          <dd>{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {row.note && <p className="hint">{row.note}</p>}
                  {row.contextSource === "recorded" &&
                    row.contexts.length > 0 && (
                      <p className="hint">
                        Nombres registrados al realizar la operación. Un cambio
                        posterior de nombre no modifica esta actividad.
                      </p>
                    )}
                </div>
              </details>
            ))}
          </div>
          {data.total === 0 && (
            <p className="empty">No hay actividades para esta búsqueda.</p>
          )}
          <div className="utility-pagination">
            <span>
              Página {data.page} de {data.pages}
            </span>
            <button
              disabled={busy || page <= 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Página anterior
            </button>
            <button
              disabled={busy || page >= data.pages}
              onClick={() => setPage((n) => n + 1)}
            >
              Página siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}
