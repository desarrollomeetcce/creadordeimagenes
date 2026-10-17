"use client";
import { useEffect, useRef, useState } from "react";
import { InteractiveQueue } from "../../lib/interactive-queue";
import { BackgroundBatches } from "./background-batches";
export type ExecutionMode = "queue" | "background" | "here";
async function request(path: string, body?: unknown) {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "No se pudo completar la operación.");
  return b;
}
export function ExecutionChoice({
  value,
  onChange,
  disabled = false,
  label = "Cómo generar",
}: {
  value: ExecutionMode;
  onChange: (value: ExecutionMode) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="execution-choice">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ExecutionMode)}
      >
        <option value="queue">Dejar en cola · iniciar después</option>
        <option value="background">
          En segundo plano · puedo cerrar la pestaña
        </option>
        <option value="here">En esta pantalla · mantenerla abierta</option>
      </select>
    </label>
  );
}
export function useProductionController(onUpdate?: () => Promise<void>) {
  const [, render] = useState(0),
    [error, setError] = useState(""),
    [batchId, setBatchId] = useState<string | null>(null),
    [dispatching, setDispatching] = useState(false);
  const mounted = useRef(true),
    update = useRef(onUpdate),
    allocated = useRef<string[]>([]),
    sending = useRef(false);
  update.current = onUpdate;
  const queue = useRef<InteractiveQueue | null>(null);
  if (!queue.current)
    queue.current = new InteractiveQueue(() => {
      if (mounted.current) render((n) => n + 1);
    });
  const q = queue.current;
  const backgroundRequest = useRef<{ ids: string[]; requestId: string } | null>(
    null,
  );
  useEffect(() => {
    mounted.current = true;
    const leaving = (event: Event) => {
      if (q.running || q.pending.length) {
        if (
          !confirm(
            "Al cambiar de vista se pausará este procesamiento después de la imagen en curso. Los siguientes quedan en cola. ¿Continuar?",
          )
        ) {
          event.preventDefault();
          return;
        }
        q.pause();
      }
    };
    window.addEventListener("production-leave", leaving);
    return () => {
      window.removeEventListener("production-leave", leaving);
      mounted.current = false;
      q.pause();
    };
  }, [q]);
  const run = async () => {
    setError("");
    try {
      await q.run(async (id) => {
        const result = await request(`jobs/${id}/process`, {});
        const channel = new BroadcastChannel("studio-updates");
        channel.postMessage("job-updated");
        channel.close();
        // Refresh failure must never repeat an already dispatched paid attempt.
        if (mounted.current) await update.current?.().catch(() => {});
        if (result.status !== "COMPLETED")
          throw Error(
            result.error || "El trabajo requiere revisión. No se reintentó.",
          );
      });
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Generación interrumpida.");
    }
  };
  const start = async (ids: string[], mode: ExecutionMode, allIds = ids) => {
    if (mode === "queue" || !ids.length) return;
    if (sending.current || q.running || q.pending.length)
      throw Error(
        "Hay un lote en curso o pausado. Reanúdalo o deténlo primero.",
      );
    setError("");
    allocated.current = allIds;
    if (mode === "here") {
      q.load(ids);
      void run();
      return;
    }
    sending.current = true;
    setDispatching(true);
    try {
      const prior = backgroundRequest.current;
      if (prior && JSON.stringify(prior.ids) !== JSON.stringify(ids))
        throw Error("Consulta el envío anterior antes de iniciar otro lote.");
      const payload = prior ?? { ids, requestId: crypto.randomUUID() };
      backgroundRequest.current = payload;
      const result = await request("jobs/background", payload);
      backgroundRequest.current = null;
      if (mounted.current) setBatchId(result.id);
      const channel = new BroadcastChannel("studio-updates");
      channel.postMessage("queued");
      channel.close();
      if (result.status === "DISPATCH_UNCERTAIN")
        throw Error(
          "Envío sin confirmar. Consulta el lote; no se repetirá automáticamente.",
        );
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Envío sin confirmar. Consulta la misma solicitud.",
        );
      throw e;
    } finally {
      sending.current = false;
      if (mounted.current) setDispatching(false);
    }
  };
  const stop = async () => {
    if (
      !confirm(
        "¿Detener este lote y cancelar sus imágenes sin iniciar? La imagen ya enviada puede terminar y generar un cargo.",
      )
    )
      return;
    q.stop();
    setError("");
    try {
      // Server cancels PENDING only, never marks the in-flight provider attempt cancelled.
      await request("jobs/stop-many", { ids: allocated.current });
      await update.current?.();
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se pudieron cancelar los pendientes.",
        );
    }
  };
  return {
    start,
    pause: () => q.pause(),
    resume: () => void run(),
    stop: () => void stop(),
    running: q.running,
    paused: q.paused,
    remaining: q.pending.length,
    current: q.current,
    last: q.last,
    error,
    batchId,
    dispatching,
    uncertainDispatch: !!backgroundRequest.current,
    resolveDispatch: () => {
      const prior = backgroundRequest.current;
      if (prior)
        void start(prior.ids, "background", allocated.current).catch(() => {});
    },
    active: q.running || q.pending.length > 0,
    refresh: async () => {
      await update.current?.();
    },
  };
}
export type ProductionController = ReturnType<typeof useProductionController>;
export function ProductionControls({
  controller: c,
}: {
  controller: ProductionController;
}) {
  return (
    <div className="stack production-controls">
      {(c.active || c.last) && (
        <>
          <div className="row">
            <strong>
              {c.running
                ? c.paused
                  ? "Pausa solicitada"
                  : "Generando en esta pantalla"
                : c.remaining
                  ? "Pausado"
                  : "Lote terminado"}
            </strong>
            <span>{c.remaining} por iniciar</span>
          </div>
          <div className="row">
            <button
              type="button"
              disabled={!c.active || c.dispatching || (c.paused && c.running)}
              onClick={c.paused ? c.resume : c.pause}
            >
              {c.paused ? "Reanudar" : "Pausar"}
            </button>
            <button
              type="button"
              className="danger"
              disabled={!c.active}
              onClick={c.stop}
            >
              Detener lote
            </button>
          </div>
        </>
      )}
      {c.uncertainDispatch && (
        <button
          type="button"
          disabled={c.dispatching}
          onClick={c.resolveDispatch}
        >
          Consultar el mismo envío
        </button>
      )}
      {c.dispatching && <p role="status">Enviando al ejecutor…</p>}
      {c.batchId && (
        <BackgroundBatches
          pending={[]}
          batchId={c.batchId}
          refreshJobs={c.refresh}
        />
      )}
      {(c.active || c.batchId) && (
        <p className="hint">
          Pausar impide iniciar las siguientes imágenes. Detener cancela las
          pendientes. Una solicitud ya enviada al proveedor puede terminar y
          generar un cargo.
        </p>
      )}
      {c.error && (
        <p className="notice error" role="alert">
          {c.error}
        </p>
      )}
    </div>
  );
}
