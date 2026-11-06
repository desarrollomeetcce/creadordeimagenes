"use client";
export function MetaStatusSwitch({
  name,
  status,
  delivery,
  disabled,
  onToggle,
  checkedAt,
  stale = false,
  pendingStop = false,
}: {
  name: string;
  status: string;
  delivery: string;
  disabled: boolean;
  onToggle: () => void;
  checkedAt?: string;
  stale?: boolean;
  pendingStop?: boolean;
}) {
  if (!["ACTIVE", "PAUSED"].includes(status))
    return <small>Estado no informado</small>;
  const active = status === "ACTIVE";
  return (
    <span
      className="meta-status-control"
      data-pending-stop={(active && pendingStop) || undefined}
    >
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`${stale ? "Sin verificar. " : ""}${active ? "Desactivar" : "Activar"} ${name} en Meta`}
        title={`${stale ? "Último estado guardado; necesita actualizar. " : ""}${active && pendingStop ? "Por desactivar. Meta todavía no ha confirmado la pausa" : active ? "Activado" : "Desactivado"} · Entrega: ${delivery}${checkedAt ? " · Consultado: " + new Date(checkedAt).toLocaleString("es-PE", { timeZone: "America/Lima" }) : ""}`}
        className="meta-status-switch"
        data-stale={stale || undefined}
        data-pending-stop={(active && pendingStop) || undefined}
        disabled={disabled}
        onClick={onToggle}
      >
        <span aria-hidden="true" />
      </button>
      {active && pendingStop && <small>Por desactivar</small>}
    </span>
  );
}
