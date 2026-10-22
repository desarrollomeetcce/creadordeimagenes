"use client";
export function MetaStatusSwitch({
  name,
  status,
  delivery,
  disabled,
  onToggle,
}: {
  name: string;
  status: string;
  delivery: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (!["ACTIVE", "PAUSED"].includes(status))
    return <small>Estado no informado</small>;
  const active = status === "ACTIVE";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? "Desactivar" : "Activar"} ${name} en Meta`}
      title={`${active ? "Activado" : "Desactivado"} · Entrega: ${delivery}`}
      className="meta-status-switch"
      disabled={disabled}
      onClick={onToggle}
    >
      <span aria-hidden="true" />
    </button>
  );
}
