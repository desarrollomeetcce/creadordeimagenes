"use client";
import { useCallback, useEffect, useState } from "react";
type Result = {
  expired?: number;
  thumbnails?: number;
  deletedFiles?: number;
  failedFiles?: number;
  interrupted?: number;
};
type State = {
  host: string;
  cronConfigured: boolean;
  lastAutomaticAt: string | null;
  pending: {
    variations: number;
    queuedFiles: number;
    thumbnails: number;
    interrupted: number;
  };
  runs: {
    id: string;
    source: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    result: Result;
    error: string | null;
  }[];
};
const sources: Record<string, string> = {
  MANUAL: "Desde el panel",
  CRON: "Programación automática",
  WORKER: "Ejecutor del servidor",
  CLI: "Tarea del servidor",
};
const statuses: Record<string, string> = {
  RUNNING: "En curso",
  COMPLETED: "Completado",
  PARTIAL: "Con archivos por reintentar",
  INTERRUPTED: "Interrumpido",
  FAILED: "No completado",
};
const date = (value: string) =>
  new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" });
async function request(path: string, method = "GET") {
  const response = await fetch("/api/system/" + path, {
    method,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "No se pudo consultar el mantenimiento.");
  return data;
}
export function MaintenancePanel({
  onCleaned,
}: {
  onCleaned: () => Promise<void>;
}) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setState(await request("maintenance"));
    setError("");
  }, []);
  useEffect(() => {
    let active = true;
    request("maintenance")
      .then((data) => {
        if (active) setState(data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="stack" aria-label="Mantenimiento del sistema">
      <h3>Mantenimiento del sistema</h3>
      <p className="hint">
        La limpieza retira archivos temporales y miniaturas cuyo plazo ya
        venció. Conserva la biblioteca permanente, los adjuntos y el historial.
        Los trabajos interrumpidos pasan a revisión; no se vuelven a generar ni
        se cobran automáticamente.
      </p>
      {state && (
        <>
          <p>
            <strong>Limpieza programada: </strong>
            {!state.cronConfigured
              ? "Pendiente de configurar la autorización del programador."
              : !state.lastAutomaticAt
                ? "Preparada; todavía no se ha recibido una ejecución automática."
                : "Última ejecución recibida: " +
                  date(state.lastAutomaticAt) +
                  "."}
          </p>
          {state.host === "VERCEL" && (
            <p className="hint">
              La programación incluida solicita una ejecución diaria alrededor
              de las 5:00 a. m. de Lima. El proveedor determina la hora
              efectiva; una clave configurada no prueba que la tarea se haya
              ejecutado.
            </p>
          )}
          {state.lastAutomaticAt &&
            Date.now() - Date.parse(state.lastAutomaticAt) > 48 * 3600000 && (
              <p className="notice">
                No se ha confirmado una ejecución automática en las últimas 48
                horas. Revisa el programador o ejecuta una limpieza desde este
                panel.
              </p>
            )}
          <p>
            {state.pending.variations} afiches caducados por procesar ·{" "}
            {state.pending.thumbnails} miniaturas caducadas ·{" "}
            {state.pending.queuedFiles} archivos en cola ·{" "}
            {state.pending.interrupted} trabajos por revisar.
          </p>
          <p className="hint">
            Cada pasada procesa hasta 25 afiches, 200 miniaturas y 100 archivos.
            Si falla un borrado se conserva en la cola para reintentarlo después
            de cinco minutos. Con muchos pendientes pueden necesitarse varias
            pasadas.
          </p>
          <details>
            <summary>Preparar la limpieza automática</summary>
            <div className="inside stack">
              <p>
                En Vercel se necesita configurar una sola vez el secreto
                CRON_SECRET (al menos 32 caracteres aleatorios) en producción y
                volver a desplegar. Se guarda en la configuración del
                alojamiento; el panel nunca muestra su valor.
              </p>
              <p>
                En un VPS puede programarse la tarea npm run maintenance con las
                mismas variables y el almacenamiento de la aplicación. El worker
                también ejecuta mantenimiento cada cinco minutos mientras
                permanece activo.
              </p>
              <p>
                Esta tarea no usa modelos de IA ni envía correos. Las
                ejecuciones están sujetas a los límites del alojamiento.
              </p>
            </div>
          </details>
        </>
      )}
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setMessage("");
            setError("");
            void (async () => {
              const result: Result = await request("cleanup", "POST");
              setMessage(
                `${result.expired ?? 0} afiches caducados procesados; ${result.thumbnails ?? 0} miniaturas retiradas; ${result.deletedFiles ?? 0} archivos retirados; ${result.failedFiles ?? 0} borrados pendientes de reintento; ${result.interrupted ?? 0} trabajos enviados a revisión.`,
              );
              await refresh();
              await onCleaned();
            })()
              .catch((error) => setError(error.message))
              .finally(() => setBusy(false));
          }}
        >
          Limpiar temporales caducados
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void refresh()
              .catch((error) => setError(error.message))
              .finally(() => setBusy(false));
          }}
        >
          Actualizar mantenimiento
        </button>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!state && !error && <p role="status">Consultando mantenimiento…</p>}
      {state && (
        <div className="table-wrap">
          <table>
            <caption>Últimas ejecuciones · hora de Lima</caption>
            <thead>
              <tr>
                <th>Inicio</th>
                <th>Origen</th>
                <th>Estado y resumen</th>
              </tr>
            </thead>
            <tbody>
              {state.runs.map((run) => (
                <tr key={run.id}>
                  <td>{date(run.startedAt)}</td>
                  <td>{sources[run.source] ?? "Sistema"}</td>
                  <td>
                    {statuses[run.status] ?? "Revisar"}
                    {run.finishedAt && (
                      <>
                        <br />
                        {run.result.expired ?? 0} afiches ·{" "}
                        {run.result.thumbnails ?? 0} miniaturas ·{" "}
                        {run.result.deletedFiles ?? 0} archivos ·{" "}
                        {run.result.failedFiles ?? 0} borrados por reintentar
                      </>
                    )}
                    {run.error && <p>{run.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!state.runs.length && (
            <p className="hint">Todavía no hay ejecuciones registradas.</p>
          )}
        </div>
      )}
    </section>
  );
}
