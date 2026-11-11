"use client";
import { useEffect, useState } from "react";
import "./campaign-audit.css";
type Row = {
  key: string;
  name: string;
  countryName: string;
  campaignId: string;
  accountId: string;
  completedAt: string;
  adsetCount: number;
  adCount: number;
  href: string | null;
};
export function CampaignAuditPanel() {
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ items: Row[]; hasNext: boolean } | null>(
    null,
  );
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    void fetch("/api/campaign-audit?page=" + page, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw Error(value.error ?? "No se pudo cargar la auditoría.");
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, revision]);
  return (
    <section className="campaign-audit" aria-labelledby="campaign-audit-title">
      <header>
        <div>
          <h2 id="campaign-audit-title">Auditoría de campañas</h2>
          <p>Publicaciones completadas · historial de texto</p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          Actualizar
        </button>
      </header>
      <small>
        Incluye campañas creadas y anuncios añadidos a campañas existentes. Las
        cantidades corresponden a lo creado en cada publicación.
      </small>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Cargando campañas…</p>}
      {!loading && data && (
        <div className="campaign-audit-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Campaña</th>
                <th scope="col">País</th>
                <th scope="col">Conjuntos creados</th>
                <th scope="col">Anuncios creados</th>
                <th scope="col">Publicada</th>
                <th scope="col">Meta</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>
                      Cuenta {row.accountId} · ID {row.campaignId}
                    </small>
                  </td>
                  <td>{row.countryName}</td>
                  <td>{row.adsetCount}</td>
                  <td>{row.adCount}</td>
                  <td>
                    <time dateTime={row.completedAt}>
                      {new Date(row.completedAt).toLocaleString("es-PE", {
                        timeZone: "America/Lima",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </time>
                  </td>
                  <td>
                    {row.href ? (
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver en Meta ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!data.items.length && (
                <tr>
                  <td colSpan={6}>
                    Aún no hay publicaciones exitosas en esta página.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <footer>
        <button
          type="button"
          disabled={loading || page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          type="button"
          disabled={loading || !data?.hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </button>
      </footer>
    </section>
  );
}
