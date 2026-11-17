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
  pendingFlow = false,
  pendingSync = false,
  onFlowChange,
}: {
  name: string;
  status: string;
  delivery: string;
  disabled: boolean;
  onToggle: () => void;
  checkedAt?: string;
  stale?: boolean;
  pendingStop?: boolean;
  pendingFlow?: boolean;
  pendingSync?: boolean;
  onFlowChange?: () => void;
}) {
  if (!["ACTIVE", "PAUSED"].includes(status))
    return <small>Estado no informado</small>;
  const active = status === "ACTIVE";
  return (
    <span
      className="meta-status-control"
      data-pending-stop={(active && pendingStop) || undefined}
      data-pending-flow={pendingFlow || undefined}
      data-pending-sync={pendingSync || undefined}
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
      {pendingSync && <small className="meta-sync-label">Por sincronizar</small>}
      {onFlowChange ? <button type="button" className="meta-flow-task" aria-pressed={pendingFlow} aria-label={`${pendingFlow ? "Quitar pendiente de flujo de" : "Marcar por hacer flujo en"} ${name}`} title={pendingFlow ? "Por hacer flujo. Solo modifica el pendiente interno." : "Marcar Por hacer flujo. No modifica Meta."} disabled={disabled} onClick={onFlowChange}>Flujo</button> : pendingFlow ? <small className="meta-flow-label">Por hacer flujo</small> : null}
    </span>
  );
}
