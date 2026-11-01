"use client";
export function MetaStatusSwitch({
  name,
  status,
  delivery,
  disabled,
  onToggle,
  checkedAt,
  stale = false,
}: {
  name: string;
  status: string;
  delivery: string;
  disabled: boolean;
  onToggle: () => void;
  checkedAt?: string;
  stale?: boolean;
}) {
  if (!["ACTIVE", "PAUSED"].includes(status))
    return <small>Estado no informado</small>;
  const active = status === "ACTIVE";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${stale ? "Sin verificar. " : ""}${active ? "Desactivar" : "Activar"} ${name} en Meta`}
      title={`${stale ? "Último estado guardado; necesita actualizar. " : ""}${active ? "Activado" : "Desactivado"} · Entrega: ${delivery}${checkedAt ? " · Consultado: " + new Date(checkedAt).toLocaleString("es-PE",{timeZone:"America/Lima"}) : ""}`}
      className="meta-status-switch"
      data-stale={stale || undefined}
      disabled={disabled}
      onClick={onToggle}
    >
      <span aria-hidden="true" />
    </button>
  );
}
