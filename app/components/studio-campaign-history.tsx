"use client";
import { useEffect, useState } from "react";
import { studioRequest } from "./inventory-meta-picker";
import type { CampaignConfig } from "../../lib/creative-studio/campaign-policy";
import { countryName } from "../../lib/meta-ads/countries";
export function StudioCampaignHistory({
  categoryId,
  onUse,
  onClose,
}: {
  categoryId: string;
  onUse: (c: CampaignConfig) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void studioRequest(
      "/launch-history/" + categoryId,
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => {
        if (!controller.signal.aborted) setRows(r.items);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [categoryId]);
  const labels: Record<string, string> = {
    DRAFT: "Borrador",
    PUBLISHING: "En proceso",
    PUBLISHED: "Creada en Meta",
    NEEDS_REVIEW: "Intento incompleto",
  };
  return (
    <section
      className="studio-campaign-history"
      aria-label="Bitácora de campañas"
    >
      <header>
        <strong>Bitácora</strong>
        <button type="button" onClick={onClose} aria-label="Cerrar bitácora">
          ×
        </button>
      </header>
      <small>
        Últimos 20 intentos y configuraciones. Los afiches permanecen en
        Biblioteca.
      </small>
      {loading && <p role="status">Cargando bitácora…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !rows.length && (
        <p>Aún no hay campañas guardadas.</p>
      )}
      {rows.map((row) => (
        <article key={row.id}>
          <div>
            <strong>{labels[row.status] ?? row.status}</strong>
            <time dateTime={row.createdAt}>
              {new Date(row.createdAt).toLocaleString("es-PE", {
                timeZone: "America/Lima",
                dateStyle: "short",
                timeStyle: "short",
              })}
            </time>
          </div>
          {row.config && (
            <>
              <span>
                {countryName(row.config.country)} · {row.config.dailyBudget} por
                día
              </span>
              <small>{row.config.headline}</small>
              <button
                type="button"
                disabled={row.status === "PUBLISHING"}
                onClick={() => onUse(row.config)}
              >
                Usar ajustes
              </button>
            </>
          )}
          {row.error && (
            <details>
              <summary>Ver motivo</summary>
              <p>{row.error}</p>
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
