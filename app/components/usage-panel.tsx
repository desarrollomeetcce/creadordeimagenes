"use client";
import { useEffect, useState } from "react";
import { usdMicros } from "../../lib/usage-format";
type Row = {
  id: string;
  jobId: string;
  actorName: string;
  createdAt: string;
  model: string;
  status: string;
  reservedMicros: string;
  actualMicros: string | null;
  contexts: {
    projectName: string;
    productName?: string;
    subproductName?: string;
  }[];
};
type Report = {
  rows: Row[];
  total: number;
  page: number;
  pages: number;
  summary: {
    reservedMicros: string;
    knownActualMicros: string;
    knownCosts: number;
    unknownCosts: number;
    uncertain: number;
  };
};
const labels: Record<string, string> = {
  RESERVED: "Reserva pendiente",
  RELEASED: "Reserva liberada",
  UNCERTAIN: "Cargo incierto",
  CONSUMED_ESTIMATE: "Procesado con reserva estimada",
};
export function UsagePanel() {
  const [data, setData] = useState<Report | null>(null),
    [days, setDays] = useState("30"),
    [status, setStatus] = useState(""),
    [cost, setCost] = useState("all"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState("");
  const params = new URLSearchParams({
    days,
    status,
    cost,
    q: query,
    page: String(page),
  }).toString();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBusy(true);
    const timer = setTimeout(() => {
      void fetch("/api/usage/list?" + params, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw Error(body.error ?? "No se pudo consultar el consumo.");
          if (active) {
            setData(body);
            setError("");
            if (page > body.pages) setPage(body.pages);
          }
        })
        .catch((e) => {
          if (active && !controller.signal.aborted) setError(e.message);
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
  }, [params, version, page]);
  async function download() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/usage/export?" + params, {
        cache: "no-store",
      });
      if (!response.ok) {
        const b = await response.json();
        throw Error(b.error ?? "No se pudo preparar el informe.");
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "consumo-ia.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo descargar el informe.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="stack usage-panel">
      <h1>Consumo de IA</h1>
      <p className="muted">
        Reservas locales y costes reales informados, separados. Una reserva no
        es una factura; un coste no informado permanece desconocido. OWNER ve
        todas las cuentas; las demás consultan sus propias operaciones.
      </p>
      <div className="fields">
        <label>
          Período del consumo
          <select
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setPage(1);
            }}
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="all">Todo el historial</option>
          </select>
        </label>
        <label>
          Estado del consumo
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Coste real
          <select
            value={cost}
            onChange={(e) => {
              setCost(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="known">Informado</option>
            <option value="unknown">No informado · reserva no liberada</option>
          </select>
        </label>
        <label>
          Buscar modelo
          <input
            type="search"
            maxLength={100}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Nombre del modelo…"
          />
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          Actualizar consumo
        </button>
        <button
          type="button"
          disabled={busy || exporting || !data?.total}
          onClick={() => void download()}
        >
          Descargar informe CSV
        </button>
      </div>
      <p className="hint">
        El informe incluye todas las coincidencias del filtro, hasta 2000
        operaciones; no solo la página visible. Puedes abrirlo en Excel. Los
        períodos usan días de Lima.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {busy && !data && <p role="status">Consultando consumo…</p>}
      {data && (
        <>
          <div className="metrics">
            <div>
              <strong>USD {usdMicros(data.summary.reservedMicros)}</strong>
              <span>Reservas no liberadas del filtro completo</span>
            </div>
            <div>
              <strong>
                {data.summary.knownCosts
                  ? "USD " + usdMicros(data.summary.knownActualMicros)
                  : "No informado"}
              </strong>
              <span>
                Coste informado en {data.summary.knownCosts} operaciones
              </span>
            </div>
            <div>
              <strong>{data.summary.unknownCosts}</strong>
              <span>Costes no informados</span>
            </div>
            <div>
              <strong>{data.summary.uncertain}</strong>
              <span>Cargos inciertos por revisar</span>
            </div>
          </div>
          <p>
            {data.total} operaciones · página {data.page} de {data.pages} · 50
            por página
          </p>
          <div className="table-wrap">
            <table>
              <caption>Operaciones del filtro · importes en USD</caption>
              <thead>
                <tr>
                  <th>Fecha · Lima</th>
                  <th>Persona y recurso</th>
                  <th>Modelo y estado</th>
                  <th>Reserva local USD</th>
                  <th>Coste real USD</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} data-usage-id={row.id}>
                    <td data-label="Fecha · Lima">
                      {new Date(row.createdAt).toLocaleString("es-PE", {
                        timeZone: "America/Lima",
                      })}
                    </td>
                    <td data-label="Persona y recurso">
                      {row.actorName}
                      <br />
                      {row.contexts[0]
                        ? [
                            row.contexts[0].projectName,
                            row.contexts[0].productName,
                            row.contexts[0].subproductName,
                          ]
                            .filter(Boolean)
                            .join(" / ")
                        : "Recurso no disponible"}
                    </td>
                    <td data-label="Modelo y estado">
                      {row.model}
                      <br />
                      {labels[row.status] ?? row.status}
                    </td>
                    <td data-label="Reserva local USD">
                      {usdMicros(row.reservedMicros)}
                    </td>
                    <td data-label="Coste real USD">
                      {usdMicros(row.actualMicros)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.rows.length && (
            <div className="empty">No hay operaciones para estos filtros.</div>
          )}
          <div className="row">
            <button
              type="button"
              disabled={busy || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Página anterior
            </button>
            <button
              type="button"
              disabled={busy || page >= data.pages}
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
