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
export function generationSlots(
  order: OrderProgress,
  visibleImageIds: string[] = [],
) {
  const gate = !!order.sampleJobId && order.sample?.reviewStatus !== "APPROVED";
  if (
    gate &&
    order.sample &&
    !order.sample.deletedAt &&
    visibleImageIds.includes(order.sample.id)
  )
    return [];
  const jobs = (order.jobs ?? []).filter(
    (j) =>
      ["PENDING", "RUNNING", "FAILED", "UNCERTAIN"].includes(j.status) &&
      (!gate || j.id === order.sampleJobId),
  );
  if (jobs.length)
    return jobs
      .slice(0, 12)
      .map((j) => ({
        key: j.id,
        state: generationCardState({
          ...order,
          running: j.status === "RUNNING" ? 1 : 0,
          pending: j.status === "PENDING" ? 1 : 0,
          failed: j.status === "FAILED" ? 1 : 0,
          uncertain: j.status === "UNCERTAIN" ? 1 : 0,
        }),
      }));
  return [{ key: order.id + ":summary", state: generationCardState(order) }];
}
export function StudioGenerationCard({
  order,
  refresh,
  visibleImageIds = [],
}: {
  order: OrderProgress;
  refresh: () => Promise<void>;
  visibleImageIds?: string[];
}) {
  const slots = generationSlots(order, visibleImageIds);
  return (
    <>
      {slots.map((slot, index) => (
        <article
          key={slot.key}
          className="studio-generation-card"
          data-order-id={order.id}
          data-generating={slot.state.animated || undefined}
        >
          <div
            className="studio-generation-visual"
            aria-busy={slot.state.animated}
          >
            <span className="studio-generation-orbit" aria-hidden="true">
              ✦
            </span>
            <strong role="status">{slot.state.label}</strong>
            <small>{slot.state.detail}</small>
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
          {index === 0 && (
            <div className="studio-generation-actions">
              <OrderProgressCard
                order={order}
                refresh={refresh}
                inline
                approvalInImage={
                  !!order.sample && visibleImageIds.includes(order.sample.id)
                }
              />
            </div>
          )}
        </article>
      ))}
    </>
  );
}
