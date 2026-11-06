"use client";
import { OrderProgressCard, type OrderProgress } from "./order-progress";
export function generationCardState(order: OrderProgress) {
  if (order.running > 0)
    return {
      label:
        order.status === "STOPPED" ? "Terminando imagen" : "Generando afiche",
      animated: true,
      detail: "La imagen aparecerá aquí cuando esté lista.",
    };
  if (order.status === "REVIEW")
    return {
      label: "Aprueba la primera muestra",
      animated: false,
      detail: "Las siguientes imágenes esperan tu aprobación.",
    };
  if (order.status === "PAUSED" || order.status === "PAUSING")
    return {
      label: "Generación en pausa",
      animated: false,
      detail: "Las imágenes pendientes se conservan.",
    };
  if (
    ["NEEDS_REVIEW", "DISPATCH_UNCERTAIN"].includes(order.status) ||
    order.failed > 0 ||
    order.uncertain > 0
  )
    return {
      label: "Requiere revisión",
      animated: false,
      detail: "Revisa el estado antes de continuar.",
    };
  if (order.status === "STOPPED")
    return {
      label: "Generación detenida",
      animated: false,
      detail: "Se conservan las imágenes terminadas.",
    };
  return {
    label: "En espera",
    animated: false,
    detail: "El siguiente afiche comenzará cuando llegue su turno.",
  };
}
export function StudioGenerationCard({
  order,
  refresh,
}: {
  order: OrderProgress;
  refresh: () => Promise<void>;
}) {
  const state = generationCardState(order);
  return (
    <article
      className="studio-generation-card"
      data-order-id={order.id}
      data-generating={state.animated || undefined}
    >
      <div className="studio-generation-visual" aria-busy={state.animated}>
        <span className="studio-generation-orbit" aria-hidden="true">
          ✦
        </span>
        <strong role="status">{state.label}</strong>
        <small>{state.detail}</small>
        <div className="studio-generation-counts">
          <span>{order.completed} listas</span>
          {order.running > 0 && <span>{order.running} generando</span>}
          {order.pending > 0 && <span>{order.pending} en espera</span>}
        </div>
        <progress
          max={Math.max(1, order.target)}
          value={order.completed}
          aria-label="Afiches terminados"
        />
      </div>
      <div className="studio-generation-actions">
        <OrderProgressCard
          order={order}
          refresh={refresh}
          inline
          approvalInImage
        />
      </div>
    </article>
  );
}
