"use client";
import { useRef, useState } from "react";
export type OrderProgress = {
  id: string;
  status: string;
  error: string | null;
  createdAt: string;
  mode: string;
  requested: number;
  target: number;
  completed: number;
  pending: number;
  running: number;
  cancelled: number;
  uncertain: number;
  failed: number;
  canManage: boolean;
  name?: string;
  scope?: { project: string; product: string; subproduct: string };
  sampleJobId?: string | null;
  sample?: {
    id: string;
    revision?: number;
    reviewStatus: string;
    deletedAt: string | null;
  } | null;
  jobs?: {
    id: string;
    status: string;
    variationId: string | null;
    reviewStatus: string | null;
  }[];
};
export const orderLabels: Record<string, string> = {
  QUEUED: "En cola",
  STARTING: "Iniciando",
  ACTIVE: "Generando",
  PAUSING: "Pausando",
  PAUSED: "Pausada",
  STOPPED: "Detenida",
  REVIEW: "Aprueba la primera muestra para continuar",
  COMPLETED: "Completada",
  ACCEPTED: "Completada con las imágenes elegidas",
  DISPATCH_UNCERTAIN: "Envío sin confirmar",
  NEEDS_REVIEW: "Requiere revisión",
};
export const modeLabels: Record<string, string> = {
  background: "Segundo plano",
  "user-queue": "Cola del usuario",
  "system-queue": "Cola del sistema",
  immediate: "Ejecución inmediata",
};
export async function orderRequest(path: string, body: unknown = {}) {
  const r = await fetch("/api/orders" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error ?? "No se pudo actualizar la orden.");
  const channel = new BroadcastChannel("studio-updates");
  channel.postMessage("order-updated");
  channel.close();
  return result;
}
const driving = new Set<string>();
export async function driveOrder(
  id: string,
  refresh: () => Promise<void>,
  alive: () => boolean = () => true,
) {
  if (driving.has(id)) return;
  driving.add(id);
  try {
    while (alive()) {
      const result = await orderRequest(`/${id}/process`);
      await refresh();
      if (result.result !== "CONTINUE" && result.result !== "WAIT") break;
      if (result.result === "WAIT")
        await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  } finally {
    driving.delete(id);
  }
}
export function OrderProgressCard({
  order: o,
  refresh,
  compact = false,
}: {
  order: OrderProgress;
  refresh: () => Promise<void>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const perform = async (action: string, body?: unknown) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await orderRequest(`/${o.id}/${action}`, body);
      await refresh();
      if (
        (action === "resume" || action === "approve") &&
        o.mode === "immediate"
      )
        void driveOrder(o.id, refresh).catch((e) => setError(e.message));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const active = ["QUEUED", "STARTING", "ACTIVE", "PAUSING"].includes(o.status),
    closed = ["COMPLETED", "ACCEPTED"].includes(o.status);
  const date = new Date(o.createdAt).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const statusLabel =
    o.status === "ACTIVE" && !o.running && o.pending > 0
      ? o.mode === "user-queue" || o.mode === "system-queue"
        ? "En cola · esperando turno"
        : o.mode === "immediate"
          ? "Lista para ejecutar en esta pantalla"
          : "Preparando la siguiente imagen"
      : (orderLabels[o.status] ?? o.status);
  return (
    <article
      className={"order-progress-card " + (compact ? "order-compact" : "")}
      data-order-id={o.id}
    >
      <div className="order-preview">
        {o.sample && !o.sample.deletedAt ? (
          <img
            loading="lazy"
            src={`/api/variations/${o.sample.id}?thumbnail=true&v=${o.sample.revision ?? 1}`}
            alt="Primera muestra de esta orden"
          />
        ) : (
          <span aria-hidden="true">▧</span>
        )}
      </div>
      <div className="order-description">
        <strong>{o.name ?? "Orden de generación"}</strong>
        <span className={"badge " + (closed ? "status-completed" : "")}>
          {statusLabel}
        </span>
        <strong className="order-count" role="status">
          {o.completed} de {o.target} imágenes
          {o.pending > 0 ? ` · faltan ${o.pending}` : ""}
          {o.running > 0 ? ` · ${o.running} generándose` : ""}
        </strong>
        <progress
          max={Math.max(1, o.target)}
          value={o.completed}
          aria-label="Avance de esta orden"
        />
        <small>
          {date} · {modeLabels[o.mode] ?? o.mode}
        </small>
        {o.cancelled > 0 && (
          <small>
            {o.cancelled} canceladas · Pedido original: {o.requested} imágenes
          </small>
        )}
        {(o.failed > 0 || o.uncertain > 0) && (
          <small>
            {o.failed} fallidas · {o.uncertain} con resultado incierto. No se
            reintentan automáticamente.
          </small>
        )}
        {o.status === "PAUSED" && (
          <small>
            {o.pending} en espera; no se iniciarán más hasta reanudar.
          </small>
        )}
        {o.status === "ACCEPTED" && (
          <small>
            Orden cerrada con {o.target} resultados. El historial conserva el
            pedido original de {o.requested}.
          </small>
        )}
        {o.scope && (
          <a
            target="_blank"
            rel="noopener"
            href={
              "?" +
              new URLSearchParams({ view: "library", ...o.scope, order: o.id })
            }
          >
            Abrir carpeta ↗
          </a>
        )}
      </div>
      {o.canManage && (
        <div className="order-buttons">
          {active && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void perform("pause")}
            >
              Pausar
            </button>
          )}
          {(o.status === "PAUSED" ||
            (o.status === "ACTIVE" && o.mode === "immediate" && !o.running)) &&
            o.pending > 0 && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void perform("resume")}
              >
                {o.status === "PAUSED" ? "Reanudar" : "Continuar orden"}
              </button>
            )}
          {!closed && o.pending > 0 && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `¿Detener esta orden? Se cancelarán ${o.pending} imágenes sin iniciar. La imagen ya en curso puede terminar y cobrarse.`,
                  )
                )
                  void perform("stop");
              }}
            >
              Detener
            </button>
          )}
          {o.status === "REVIEW" &&
            o.sampleJobId &&
            o.sample?.reviewStatus !== "APPROVED" && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() =>
                  void perform("approve", { jobId: o.sampleJobId })
                }
              >
                Aprobar muestra y continuar
              </button>
            )}
          {o.status !== "ACCEPTED" && o.completed > 0 && !o.running && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `¿Finalizar con estas ${o.completed} imágenes? Se cancelarán las pendientes y esta orden quedará ${o.completed} de ${o.completed}. El pedido original de ${o.requested} se conserva en el historial.`,
                  )
                )
                  void perform("finish", { expectedCompleted: o.completed });
              }}
            >
              Quedarme con {o.completed} · finalizar
            </button>
          )}
          {o.status === "DISPATCH_UNCERTAIN" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void perform("check")}
            >
              Comprobar ejecutor
            </button>
          )}
        </div>
      )}
      {(error || o.error) && (
        <p className="notice error" role="alert">
          {error || o.error}
        </p>
      )}
      {o.running > 0 && (
        <p className="hint">
          La imagen ya en curso puede terminar y cobrarse. Pausar o detener
          impide iniciar las siguientes.
        </p>
      )}
    </article>
  );
}
