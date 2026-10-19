"use client";
import { ErrorNotice } from "./error-notice";
import { useRef, useState } from "react";
export type OrderProgress = {
  id: string;
  viewerId?: string;
  errorVersion?: string;
  hiddenFromProduction?: boolean;
  canDismiss?: boolean;
  canContinuePending?:boolean;
  canApproveSample?:boolean;
  recoveryHint?:string|null;
  needsConnectionReview?:boolean;
  canReviewConnection?:boolean;
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
export function orderNeedsControls(o:OrderProgress){
 return o.pending>0||o.running>0||(!["COMPLETED","ACCEPTED"].includes(o.status)&&(o.failed>0||o.uncertain>0||!!o.error));
}
export function OrderProgressCard({
  order: o,
  refresh,
  compact = false,
  selection, inline=false, approvalInImage=false,
}: {
  order: OrderProgress;
  refresh: () => Promise<void>;
  compact?: boolean;
  inline?:boolean; approvalInImage?:boolean;
  selection?: {checked:boolean;onChange:(checked:boolean)=>void};
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
      const updated=await orderRequest(action==="hide-card"?"/hide":`/${o.id}/${action}`,action==="hide-card"?{ids:[o.id]}:body);
      await refresh();
      if (
        (action === "resume" || action === "approve") &&
        o.mode === "immediate" && updated.status === "ACTIVE"
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
      className={inline?"image-order-controls":"order-progress-card " + (compact ? "order-compact" : "")}
      data-order-id={o.id}
    >
      {!inline&&<div className="order-preview">
        {selection&&<label className="row"><input type="checkbox" checked={selection.checked} disabled={!o.canDismiss} onChange={e=>selection.onChange(e.target.checked)} aria-label={"Seleccionar carga "+(o.name??o.id)} />Seleccionar</label>}
        {o.sample && !o.sample.deletedAt ? (
          <img
            loading="lazy"
            src={`/api/variations/${o.sample.id}?thumbnail=true&v=${o.sample.revision ?? 1}`}
            alt="Primera muestra de esta orden"
          />
        ) : (
          <span aria-hidden="true">▧</span>
        )}
      </div>}
      <div className="order-description">
        {!inline&&<><strong>{o.name ?? "Orden de generación"}</strong>
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
        </>}
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
        {o.recoveryHint&&<p className="hint order-recovery-hint">{o.recoveryHint}</p>}
        {(error || o.error) && <ErrorNotice message={error || o.error!} acknowledgementKey={!error ? `${o.viewerId??"viewer"}:${o.id}:${o.errorVersion??o.createdAt}` : undefined} onDismiss={()=>setError("")} />}
        {!inline&&o.scope && (
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
          {(o.canContinuePending || o.status === "PAUSED" ||
            (o.status === "ACTIVE" && o.mode === "immediate" && !o.running)) &&
            o.pending > 0 && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void perform("resume")}
              >
                {o.canContinuePending ? `Continuar ${o.pending} ${o.pending===1?"imagen pendiente":"imágenes pendientes"}` : o.status === "PAUSED" ? "Reanudar" : "Continuar orden"}
              </button>
            )}
          {!closed && o.status !== "STOPPED" && (o.pending > 0 || o.running > 0 || o.failed > 0 || o.uncertain > 0 || !!o.error) && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    o.pending > 0 ? `¿Detener esta orden? Se cancelarán ${o.pending} imágenes sin iniciar. La imagen ya en curso puede terminar y cobrarse.` : "¿Detener esta orden? No se repetirán solicitudes y se conservarán el historial y los costos. Si hay una imagen en curso, puede terminar y cobrarse.",
                  )
                )
                  void perform("stop");
              }}
            >
              Detener
            </button>
          )}
          {!approvalInImage&&(o.canApproveSample || o.status === "REVIEW") &&
            o.sample && !o.sample.deletedAt && o.sampleJobId &&
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
          {o.needsConnectionReview&&o.canReviewConnection&&<a className="button" href="?view=ai">Revisar conexión de IA</a>}
          {(o.failed>0||o.uncertain>0)&&<a className="button" href={"?"+new URLSearchParams({view:"jobs",...(o.scope??{})})}>Ver motivo en Generaciones</a>}
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
          {o.canDismiss&&<button type="button" className="danger" disabled={busy} onClick={()=>{if(confirm("¿Ocultar este aviso de generación? Las imágenes, aprobaciones, historial y costos se conservan."))void perform("hide-card");}}>{inline?"Ocultar aviso":"Eliminar tarjeta"}</button>}
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

      {o.running > 0 && (
        <p className="hint">
          La imagen ya en curso puede terminar y cobrarse. Pausar o detener
          impide iniciar las siguientes.
        </p>
      )}
    </article>
  );
}
