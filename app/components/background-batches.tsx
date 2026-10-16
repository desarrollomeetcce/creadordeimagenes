"use client";
import { useCallback, useEffect, useRef, useState } from "react";
type Batch = {
  id: string;
  status: string;
  error: string | null;
  total: number;
  completed: number;
  pending: number;
  running: number;
};
const active = ["STARTING", "ACTIVE", "PAUSING", "DISPATCH_UNCERTAIN"];
const labels: Record<string, string> = {
  STARTING: "Enviando al ejecutor",
  ACTIVE: "En segundo plano",
  PAUSING: "Pausa solicitada",
  PAUSED: "Detenido",
  COMPLETED: "Finalizado",
  DISPATCH_UNCERTAIN: "Envío sin confirmar",
  NEEDS_REVIEW: "Requiere revisión",
};
async function request(path: string, data?: unknown) {
  const r = await fetch("/api/jobs/background" + path, {
    method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || "No se pudo administrar el lote.");
  return b;
}
export function BackgroundBatches({
  pending,
  refreshJobs,
}: {
  pending: string[];
  refreshJobs: () => Promise<void>;
}) {
  const [batches, setBatches] = useState<Batch[]>([]),
    [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const inFlight = useRef<{ ids: string[]; requestId: string } | null>(null);
  const refresh = useCallback(async () => {
    const data = await request("");
    setBatches(data.batches);
    setAvailable(data.available);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const r = await fetch("/api/jobs/background", {
          signal: controller.signal,
        });
        const b = await r.json();
        if (!controller.signal.aborted) {
          if (!r.ok) throw new Error(b.error);
          setBatches(b.batches);
          setAvailable(b.available);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setMessage(
            e instanceof Error ? e.message : "No se pudo consultar el lote.",
          );
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await Promise.all([refresh(), refreshJobs()]);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  const hasActive = batches.some((b) => active.includes(b.status));
  return (
    <section className="panel stack" aria-label="Generación en segundo plano">
      <h2>Generación en segundo plano</h2>
      <p>
        Los trabajos que ya autorizaste pueden seguir aunque cierres esta
        pantalla. Se envían hasta 200 pendientes actuales; los nuevos no se
        añaden a ese lote.
      </p>
      {!available && (
        <p className="hint">
          El ejecutor en segundo plano aún no está habilitado en este servidor.
          El procesamiento interactivo sigue disponible.
        </p>
      )}
      <button
        className="primary"
        disabled={
          !available ||
          busy ||
          hasActive ||
          (!pending.length && !inFlight.current)
        }
        onClick={() => {
          if (
            !confirm(
              `¿Procesar en segundo plano los ${inFlight.current?.ids.length ?? pending.length} trabajos ya autorizados? Se usarán sus reservas de presupuesto. No se reintentarán cargos inciertos.`,
            )
          )
            return;
          const data = inFlight.current ?? {
            ids: pending.slice(0, 200),
            requestId: crypto.randomUUID(),
          };
          inFlight.current = data;
          void action(async () => {
            const result = await request("", data);
            inFlight.current = null;
            setMessage(
              result.status === "DISPATCH_UNCERTAIN"
                ? "No se pudo confirmar el envío. Consulta el lote antes de programar otro."
                : "Lote registrado. Puedes cerrar la pantalla; consulta su estado al volver.",
            );
          });
        }}
      >
        {inFlight.current
          ? "Consultar la misma solicitud"
          : `Procesar ${pending.length} pendientes en segundo plano`}
      </button>
      <p className="hint">
        Detener un lote deja sus trabajos sin iniciar en cola y conserva sus
        reservas. Puedes cancelarlos para liberarlas. Un afiche en curso termina
        antes de la pausa.
      </p>
      {batches.map((b) => (
        <article className="card stack" key={b.id}>
          <strong>{labels[b.status] ?? "Estado desconocido"}</strong>
          <span>
            {b.completed} de {b.total} completados · {b.pending} pendientes ·{" "}
            {b.running} en curso
          </span>
          {b.error && <p role="status">{b.error}</p>}
          {active.includes(b.status) && (
            <div className="row">
              <button
                disabled={busy || b.status === "PAUSING"}
                onClick={() => void action(() => request(`/${b.id}/pause`, {}))}
              >
                Detener después del actual
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const result = await request(`/${b.id}/check`, {});
                    if (result.message) setMessage(result.message);
                  })
                }
              >
                Comprobar ejecutor
              </button>
            </div>
          )}
        </article>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
