"use client";
import { useEffect, useState } from "react";
import { HierarchyBreadcrumbs } from "./breadcrumbs";
import { VariationEditor } from "./variation-editor";
type Scope = "project" | "category";
type Item = {
  id: string;
  model: string;
  favorite: boolean;
  permanent: boolean;
  reviewStatus: string;
  subproduct: {
    id: string;
    name: string;
    category: { id: string; name: string };
  } | null;
};
type Data = {
  resource: {
    name: string;
    projectName: string;
    projectId: string;
    canEdit: boolean;
  };
  total: number;
  pages: number;
  items: Item[];
};
export async function downloadArchive(
  input: unknown,
  filename = "afiches.zip",
) {
  const response = await fetch("/api/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(
      (await response.json()).error ?? "No se pudo preparar la descarga.",
    );
  const url = URL.createObjectURL(await response.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CollectionGallery({
  scope,
  id,
  back,
  openSubproduct,
}: {
  scope: Scope;
  id: string;
  back: () => void;
  openSubproduct: (id: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null),
    [q, setQ] = useState(""),
    [review, setReview] = useState("ALL"),
    [favorite, setFavorite] = useState(false),
    [saved, setSaved] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [format, setFormat] = useState("png"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<string | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [compare, setCompare] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({
      scope,
      id,
      page: String(page),
      q,
      review,
      favorite: String(favorite),
      saved: String(saved),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/gallery?" + params, { signal: controller.signal })
        .then(async (r) => {
          const value = await r.json();
          if (!r.ok)
            throw new Error(value.error || "No se pudo cargar la galería.");
          if (active) {
            if (page > value.pages) setPage(value.pages);
            else setData(value);
          }
        })
        .catch((e: Error) => {
          if (active) {
            setData(null);
            setMessage(e.message);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [scope, id, page, q, review, favorite, saved, revision]);
  const reset = () => {
    setPage(1);
    setSelected([]);
    setPreview(null);
    setCompare(false);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  };
  const filters = { q, review, favorite, saved };
  const current = data?.items.findIndex((item) => item.id === preview) ?? -1;
  return (
    <>
      {data && (
        <HierarchyBreadcrumbs
          project={{
            id: data.resource.projectId,
            name: data.resource.projectName,
          }}
          category={
            scope === "category" ? { id, name: data.resource.name } : null
          }
        />
      )}
      <button onClick={back}>
        Volver {scope === "project" ? "al proyecto" : "a la categoría"}
      </button>
      <h1>
        Afiches de{" "}
        {data?.resource.name ??
          (scope === "project" ? "proyecto" : "categoría")}
      </h1>
      <p className="muted">
        {data?.total ?? 0} afiches disponibles. Cada resultado se descarga como
        un archivo independiente, organizado por categoría y subproducto.
      </p>
      <div className="panel stack">
        <div className="fields">
          <label>
            Buscar por subproducto o categoría
            <input
              value={q}
              maxLength={200}
              onChange={(e) => {
                setQ(e.target.value);
                reset();
              }}
            />
          </label>
          <label>
            Revisión
            <select
              value={review}
              onChange={(e) => {
                setReview(e.target.value);
                reset();
              }}
            >
              <option value="ALL">Todas</option>
              <option value="PENDING">Sin revisar</option>
              <option value="APPROVED">Aprobadas</option>
              <option value="REJECTED">Rechazadas</option>
            </select>
          </label>
          <label>
            Formato de descarga
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label className="row">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => {
                setFavorite(e.target.checked);
                reset();
              }}
            />
            Solo favoritas
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => {
                setSaved(e.target.checked);
                reset();
              }}
            />
            Conservadas en biblioteca
          </label>
        </div>
        <div className="row">
          <button
            disabled={loading || !data?.items.length}
            onClick={() =>
              setSelected(
                [
                  ...new Set([...selected, ...data!.items.map((i) => i.id)]),
                ].slice(0, 200),
              )
            }
          >
            Seleccionar página
          </button>
          <button
            disabled={!selected.length}
            onClick={() => {
              setSelected([]);
              setCompare(false);
            }}
          >
            Quitar selección
          </button>
          <button
            disabled={busy || !selected.length}
            onClick={() =>
              void run(() => downloadArchive({ ids: selected, format }))
            }
          >
            Descargar seleccionados ({selected.length})
          </button>
          <button
            className="primary"
            disabled={loading || busy || !data?.total || data.total > 200}
            onClick={() =>
              void run(() => downloadArchive({ scope, id, format, filters }))
            }
          >
            Descargar todos los resultados
          </button>
          <button
            disabled={selected.length !== 2}
            onClick={() => setCompare(!compare)}
          >
            Comparar 2 seleccionados
          </button>
        </div>
        <small>
          La selección se conserva al cambiar de página. Máximo 200 afiches y
          100 MB por descarga; utiliza filtros para grupos mayores.
        </small>
      </div>
      {editing && (
        <VariationEditor
          id={editing}
          key={editing}
          onClose={() => {
            setEditing(null);
            setRevision((r) => r + 1);
          }}
        />
      )}
      {compare && selected.length === 2 && (
        <section className="panel stack">
          <h2>Comparación</h2>
          <div className="grid">
            {selected.map((id, i) => (
              <figure key={id}>
                <img
                  src={`/api/variations/${id}`}
                  alt={`Comparación ${i + 1}`}
                  style={{
                    width: "100%",
                    maxHeight: 650,
                    objectFit: "contain",
                  }}
                />
              </figure>
            ))}
          </div>
          <button onClick={() => setCompare(false)}>Cerrar comparación</button>
        </section>
      )}
      {preview && current >= 0 && (
        <section className="panel stack">
          <h2>
            Vista ampliada · {data!.items[current].subproduct?.name ?? "Afiche"}
          </h2>
          <img
            src={`/api/variations/${preview}`}
            alt="Vista ampliada del afiche"
            style={{ width: "100%", maxHeight: "80vh", objectFit: "contain" }}
          />
          <div className="row">
            <button
              disabled={current <= 0}
              onClick={() => setPreview(data!.items[current - 1].id)}
            >
              Anterior
            </button>
            <button
              disabled={current >= data!.items.length - 1}
              onClick={() => setPreview(data!.items[current + 1].id)}
            >
              Siguiente
            </button>
            <button onClick={() => setPreview(null)}>
              Cerrar vista ampliada
            </button>
          </div>
        </section>
      )}
      {loading && <p role="status">Cargando afiches…</p>}
      {message && (
        <p className="notice error" role="status">
          {message}
        </p>
      )}
      <div className="grid" aria-busy={loading}>
        {!loading &&
          data?.items.map((item) => (
            <article className="card gallery" key={item.id}>
              <button
                onClick={() => setPreview(item.id)}
                aria-label={`Ampliar ${item.subproduct?.name ?? "afiche"}`}
              >
                <img
                  loading="lazy"
                  src={`/api/variations/${item.id}?thumbnail=true`}
                  alt={item.subproduct?.name ?? "Afiche"}
                />
              </button>
              <h3>{item.subproduct?.name ?? "Prueba de IA"}</h3>
              <small>{item.subproduct?.category.name}</small>
              <label className="row">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  disabled={
                    !selected.includes(item.id) && selected.length >= 200
                  }
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, item.id]
                        : selected.filter((v) => v !== item.id),
                    );
                    setCompare(false);
                  }}
                />
                Seleccionar afiche
              </label>
              <small>
                {item.favorite ? "★ Favorito · " : ""}
                {item.reviewStatus === "APPROVED"
                  ? "Aprobado"
                  : item.reviewStatus === "REJECTED"
                    ? "Rechazado"
                    : "Sin revisar"}{" "}
                · {item.permanent ? "En biblioteca" : "Temporal"}
              </small>
              <div className="row">
                <a
                  href={`/api/variations/${item.id}?download&format=${format}`}
                >
                  Descargar {format.toUpperCase()}
                </a>
                {data.resource.canEdit && (
                  <button onClick={() => setEditing(item.id)}>
                    Ajustar / Editar con IA
                  </button>
                )}
                {item.subproduct && (
                  <button onClick={() => openSubproduct(item.subproduct!.id)}>
                    Ver subproducto
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {!loading && data && !data.items.length && (
        <div className="empty">
          No hay afiches disponibles con estos filtros.
        </div>
      )}
      <div className="row" style={{ marginTop: 24 }}>
        <button
          disabled={loading || page <= 1}
          onClick={() => {
            setPage(page - 1);
            setPreview(null);
          }}
        >
          Página anterior
        </button>
        <span>
          Página {page} de {data?.pages ?? 1}
        </span>
        <button
          disabled={loading || !data || page >= data.pages}
          onClick={() => {
            setPage(page + 1);
            setPreview(null);
          }}
        >
          Página siguiente
        </button>
      </div>
    </>
  );
}
