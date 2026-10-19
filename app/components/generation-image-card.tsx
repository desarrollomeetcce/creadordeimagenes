"use client";
import { OrderProgressCard, type OrderProgress } from "./order-progress";
export type PendingImage = {
  id: string;
  status: string;
  orderId: string | null;
  sourceNotice?:string|null;
  subproduct: { id: string; name: string; category: { id: string } } | null;
};
export function GenerationImageCard({
  slot,
  order,
  controls,
  refresh,
  onPreview,
}: {
  slot: PendingImage;
  order?: OrderProgress;
  controls: boolean;
  refresh: () => Promise<void>;
  onPreview: () => void;
}) {
  const waiting =
    slot.status === "PENDING" &&
    (order?.status === "REVIEW" ||
      !!(order?.sample && order.sample.reviewStatus !== "APPROVED"));
  const label =
    slot.status === "RUNNING"
      ? "Generando imagen…"
      : slot.status === "FAILED"
        ? "No se pudo generar"
        : slot.status === "UNCERTAIN"
          ? "Resultado por revisar"
          : order?.status === "PAUSED"
            ? "En pausa"
            : waiting
              ? "Espera aprobación de la muestra"
              : order?.status === "NEEDS_REVIEW"
                ? "Pendiente · requiere atención"
                : order?.status === "DISPATCH_UNCERTAIN"
                  ? "Envío por comprobar"
                  : "En cola";
  return (
    <article
      className={
        "card gallery generation-image generation-" + slot.status.toLowerCase()
      }
      data-job-id={slot.id}
    >
      <div className="generation-placeholder" role="status">
        <span
          className={slot.status === "RUNNING" ? "generation-spinner" : ""}
          aria-hidden="true"
        >
          ◌
        </span>
        <strong>{label}</strong>
      </div>
      <strong>
        {slot.subproduct?.name ?? order?.name ?? "Imagen pendiente"}
      </strong>
      {slot.sourceNotice?<span className="source-deleted-notice">{slot.sourceNotice}</span>:slot.subproduct && (
        <a
          href={
            "?" +
            new URLSearchParams({
              view: "projects",
              category: slot.subproduct.category.id,
              subproduct: slot.subproduct.id,
            })
          }
        >
          Ir al subproducto ↗
        </a>
      )}
      {controls && order && (
        <>
          {order.sample && !order.sample.deletedAt && (
            <button type="button" onClick={onPreview}>
              Ver muestra
            </button>
          )}
          <OrderProgressCard inline order={order} refresh={refresh} />
        </>
      )}
    </article>
  );
}
