import type { CampaignMetaTiming } from "../../lib/meta-ads/campaign-meta-timing";
const date = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
export function CampaignTiming({
  meta,
  internalStart,
  internalSource,
}: {
  meta: CampaignMetaTiming;
  internalStart?: string | null;
  internalSource?: "activation" | "record";
}) {
  return (
    <div className="campaign-timing" aria-label="Fechas de la hoja y de Meta">
      {internalStart !== undefined && (
        <span>
          <b>
            {internalSource === "record"
              ? "Primer registro en la hoja"
              : "Activación interna"}
            :
          </b>{" "}
          {internalStart ? date(internalStart) : "Sin registro"}
        </span>
      )}
      <span>
        <b>Fecha inicio Meta{meta.campaigns > 1 ? " más reciente" : ""}:</b>{" "}
        {meta.day ? date(meta.day) : "Sin fecha sincronizada"}
        {meta.source === "created"
          ? " · estimada por creación"
          : meta.source === "reporting"
            ? " · estimada por primer informe disponible"
            : meta.source === "scheduled"
              ? " · inicio reportado por Meta"
              : ""}
      </span>
      {meta.days !== null && (
        <span>
          <b>{meta.days}</b>{" "}
          {meta.source === "reporting"
            ? "días desde el primer informe Meta disponible"
            : "días desde el inicio Meta registrado"}
        </span>
      )}
      <small>
        El inicio no acredita una reactivación posterior. Última reactivación
        Meta: sin historial verificable guardado.
      </small>
    </div>
  );
}
