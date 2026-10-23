"use client";
type FreshAccount = {
  id: string;
  name: string;
  lastDataAt?: string | null;
  enabled: boolean;
  intervalMinutes: number;
  progress?: { status: string; label: string };
};
const stamp = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "medium",
      })
    : "Pendiente de la primera sincronización";
export function MetaDataFreshness({ accounts }: { accounts: FreshAccount[] }) {
  const times = accounts
    .map((a) => a.lastDataAt)
    .filter((v): v is string => !!v && Number.isFinite(Date.parse(v)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const pending = accounts.length - times.length,
    automatic = accounts.filter((a) => a.enabled).length;
  return (
    <section
      className="meta-data-freshness"
      aria-label="Actualización de datos de Meta"
    >
      <div role="status" aria-live="polite">
        <strong>Últimos datos guardados: </strong>
        {accounts.length === 1
          ? stamp(accounts[0].lastDataAt)
          : times.length
            ? `${stamp(times[0])} · fecha más antigua de las cuentas con datos`
            : "Todavía no hay datos sincronizados"}
        {accounts.length > 1 && pending > 0 && (
          <span> · {pending} cuenta(s) pendientes</span>
        )}
        <small>
          Hora de Lima ·{" "}
          {automatic
            ? `Automática programada en ${automatic} cuenta(s)`
            : "Sincronización automática pausada"}
        </small>
      </div>
      {accounts.some(
        (a) =>
          a.progress &&
          !["complete", "disabled", "cancelled"].includes(a.progress.status),
      ) && (
        <small className="meta-freshness-explanation">
          El intento de importación puede ser más reciente que los datos: una
          espera o un error no actualizan las estadísticas guardadas.
        </small>
      )}
      {accounts.length === 1 && (
        <small>
          {accounts[0].enabled
            ? `Cada ${accounts[0].intervalMinutes} min al terminar la importación actual. `
            : ""}
          {accounts[0].progress?.label}
        </small>
      )}
      {accounts.length > 1 && (
        <details>
          <summary>Ver actualización por cuenta</summary>
          {accounts.map((a) => (
            <div key={a.id}>
              <strong>{a.name}</strong>
              <span>{stamp(a.lastDataAt)}</span>
              <small>
                {a.enabled
                  ? `Automática cada ${a.intervalMinutes} min`
                  : "Automática pausada"}{" "}
                · {a.progress?.label}
              </small>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
