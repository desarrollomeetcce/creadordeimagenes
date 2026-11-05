"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { fetchJsonResponse } from "../../lib/http-response";
const ImagePreviewModal = dynamic(() =>
  import("./image-preview-modal").then((m) => m.ImagePreviewModal),
);
type Image = {
  id: string;
  reviewStatus: string;
  revision: number;
  subproduct: { name: string } | null;
};
/** An explicit, read-only peek at the existing authorized gallery. No generation or background polling. */
export function ProjectImagePreview({
  scope,
  id,
  onOpenLibrary,
}: {
  scope: "project" | "category";
  id: string;
  onOpenLibrary: () => void;
}) {
  const [data, setData] = useState<{ items: Image[]; total: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Image | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setPreview(null);
    void fetchJsonResponse<{ items: Image[]; total: number }>(
      "/api/gallery?" +
        new URLSearchParams({ scope, id, page: "1", review: "ALL" }),
      {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      },
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e.name === "TimeoutError"
              ? "La galería está tardando en responder. Puedes volver a intentarlo."
              : e.message,
          );
      });
    return () => controller.abort();
  }, [scope, id, revision]);
  return (
    <section className="project-studio-preview" aria-label="Vista de afiches">
      <header>
        <div>
          <span className="eyebrow">Tu galería</span>
          <h2>Afiches del {scope === "project" ? "proyecto" : "producto"}</h2>
        </div>
        <button type="button" onClick={onOpenLibrary}>
          Revisar en Biblioteca ↗
        </button>
      </header>
      {error ? (
        <div role="alert" className="notice">
          {error}{" "}
          <button type="button" onClick={() => setRevision((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      ) : !data ? (
        <div className="creative-preview-loading" role="status">
          Cargando tus afiches…
        </div>
      ) : data.items.length ? (
        <>
          <div className="creative-preview-grid">
            {data.items.slice(0, 12).map((image) => (
              <button
                type="button"
                key={image.id}
                className="creative-preview-card"
                aria-label={`Ampliar ${image.subproduct?.name ?? "afiche"}`}
                onClick={() => setPreview(image)}
              >
                <div className="creative-preview-image">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={`/api/variations/${image.id}?thumbnail=true&v=${image.revision}`}
                    alt={image.subproduct?.name ?? "Afiche generado"}
                  />
                  <span aria-hidden="true">⤢</span>
                </div>
                <strong>{image.subproduct?.name ?? "Afiche"}</strong>
                <small data-review={image.reviewStatus}>
                  {image.reviewStatus === "APPROVED"
                    ? "✓ Aprobado"
                    : image.reviewStatus === "REJECTED"
                      ? "Rechazado"
                      : "Por revisar"}
                </small>
              </button>
            ))}
          </div>
          <p className="creative-preview-count">
            {Math.min(data.items.length, 12)} de {data.total} afiches · Abre
            Biblioteca para revisar muestras, descargar o continuar un lote.
          </p>
        </>
      ) : (
        <div className="creative-preview-empty">
          <span aria-hidden="true">▧</span>
          <strong>Aquí verás tus próximos afiches</strong>
          <p>Prepara un subproducto y genera tu primera muestra.</p>
        </div>
      )}
      {preview && (
        <ImagePreviewModal
          id={preview.id}
          name={preview.subproduct?.name ?? "Afiche"}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}
