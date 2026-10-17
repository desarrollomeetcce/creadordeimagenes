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
  cancelled: number;
  uncertain: number;
  failed: number;
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
  disabled = false,
}: {
  pending: string[];
  disabled?: boolean;
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
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
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
    <section
      className="background-compact"
      aria-label="Generación en segundo plano"
    >
      <strong>Generar sin mantener esta pantalla abierta</strong>
      {!available && (
        <p className="hint">
          El ejecutor en segundo plano aún no está habilitado en este servidor.
          El procesamiento interactivo sigue disponible.
        </p>
      )}
      <button
        className="primary"
        disabled={
          disabled ||
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
          : `Generar en segundo plano (${pending.length})`}
      </button>
      <details className="background-help">
        <summary>Cómo funciona · historial de lotes ({batches.length})</summary>
        <p className="hint">
          Procesa solo trabajos en cola ya autorizados: los seleccionados o los
          de esta página. No añade trabajos nuevos ni repite cargos inciertos.
          Detener deja los siguientes en cola; «No generar» los cancela y libera
          su reserva local. No devuelve cargos del proveedor.
        </p>
        {batches.map((b) => (
          <article className="card stack" key={b.id}>
            <strong>{labels[b.status] ?? "Estado desconocido"}</strong>
            <span>
              {b.completed} de {b.total} completados · {b.pending} pendientes ·{" "}
              {b.running} en curso · {b.cancelled ?? 0} cancelados ·{" "}
              {b.uncertain ?? 0} inciertos · {b.failed ?? 0} fallidos
            </span>
            {b.error && <p role="status">{b.error}</p>}
            {b.pending > 0 && (
              <button
                className="danger"
                disabled={disabled || busy}
                onClick={() => {
                  if (
                    confirm(
                      `¿Cancelar los ${b.pending} trabajos que aún no empezaron en este lote y liberar sus reservas locales? El afiche en curso termina; los cargos inciertos se conservan.`,
                    )
                  )
                    void action(async () => {
                      const result = await request(
                        `/${b.id}/cancel-pending`,
                        {},
                      );
                      setMessage(
                        `${result.cancelled} pendientes cancelados; ${result.running} en curso conservados.`,
                      );
                    });
                }}
              >
                No generar los que siguen en cola
              </button>
            )}
            {active.includes(b.status) && (
              <div className="row">
                <button
                  disabled={disabled || busy || b.status === "PAUSING"}
                  onClick={() =>
                    void action(() => request(`/${b.id}/pause`, {}))
                  }
                >
                  Detener después del actual
                </button>
                <button
                  disabled={disabled || busy}
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
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
