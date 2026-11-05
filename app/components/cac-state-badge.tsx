import { InventoryCacStatus } from "./inventory-cac-status";
import type { CacStatus } from "../../lib/meta-ads/inventory-cac-policy";
export function CacStateBadge({
  status = "PENDING",
  partial = false,
  fxPending = false,
}: {
  status?: CacStatus;
  partial?: boolean;
  fxPending?: boolean;
}) {
  return (
    <span
      className="cac-state-badge"
      data-cac-status={status}
      title={
        fxPending
          ? "Falta tasa de conversión diaria a soles para evaluar el estado."
          : partial
            ? "Evaluación provisional de los totales registrados; puede cambiar al completar los datos."
            : "Evaluación del CAC con los parámetros vigentes."
      }
    >
      <InventoryCacStatus status={status} />
      {partial && status !== "PENDING" ? " *" : ""}
      {fxPending ? <small>Sin tasa a PEN</small> : null}
    </span>
  );
}
