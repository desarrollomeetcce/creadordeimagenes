"use client";
import { useEffect, useState } from "react";
type Data = {
  total: number;
  page: number;
  pages: number;
  items: {
    id: string;
    name: string;
    deletedAt: string;
    _count: { variations: number; members: number };
  }[];
};
export function SubproductTrash({
  categoryId,
  onRestored,
}: {
  categoryId: string;
  onRestored: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<Data | null>(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false),
    [restoring, setRestoring] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    const timer = setTimeout(() => {
      void fetch(
        `/api/categories/${categoryId}/subproducts/trash?${new URLSearchParams({ q: query, page: String(page) })}`,
        { signal: controller.signal, cache: "no-store" },
      )
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok)
            throw Error(b.error || "No se pudo consultar la papelera.");
          if (!controller.signal.aborted) {
            if (page > b.pages) setPage(b.pages);
            else setData(b);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, categoryId, query, page, version]);
  async function restore(id: string, name: string) {
    if (
      !confirm(
        `¿Restaurar ${name}? Conservará sus instrucciones y asignaciones de acceso. Los trabajos cancelados no se reactivarán y los archivos caducados no se recuperarán.`,
      )
    )
      return;
    setRestoring(id);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/subproducts/${id}/restore`, {
        method: "POST",
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "No se pudo restaurar.");
      await onRestored();
      setVersion((v) => v + 1);
      setNotice(
        `Subproducto ${name} restaurado. No se ha generado ninguna imagen ni realizado consumo de IA.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo completar la restauración.",
      );
    } finally {
      setRestoring("");
    }
  }
  return (
    <details className="panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Subproductos eliminados · restaurar espacios</summary>
      {open && (
        <div className="inside stack" aria-busy={loading || !!restoring}>
          <p>
            Restaura espacios con sus instrucciones, configuración e historial.
            Se conservan sus asignaciones directas y los accesos heredados
            vigentes. Los trabajos cancelados siguen cancelados; los archivos
            temporales ya caducados no se recuperan. Restaurar no consume IA.
          </p>
          <label>
            Buscar subproducto eliminado
            <input
              type="search"
              value={query}
              maxLength={200}
              disabled={!!restoring}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {loading && <p role="status">Consultando espacios eliminados…</p>}
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {data && (
            <>
              <p>{data.total} espacios eliminados encontrados.</p>
              {!data.items.length && (
                <p>No hay subproductos eliminados que coincidan.</p>
              )}
              {data.items.map((item) => (
                <article className="card stack" key={item.id}>
                  <strong>{item.name}</strong>
                  <span className="muted">
                    Eliminado el{" "}
                    {new Date(item.deletedAt).toLocaleString("es-PE", {
                      timeZone: "America/Lima",
                    })}{" "}
                    · {item._count.variations} afiches en el historial ·{" "}
                    {item._count.members} asignaciones directas conservadas.
                  </span>
                  <button
                    type="button"
                    disabled={!!restoring}
                    onClick={() => void restore(item.id, item.name)}
                  >
                    {restoring === item.id
                      ? "Restaurando…"
                      : `Restaurar ${item.name}`}
                  </button>
                </article>
              ))}
              <div className="row">
                <button
                  type="button"
                  disabled={loading || !!restoring || page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Página anterior de eliminados
                </button>
                <span>
                  Página {data.page} de {data.pages}
                </span>
                <button
                  type="button"
                  disabled={loading || !!restoring || page >= data.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Página siguiente de eliminados
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </details>
  );
}
