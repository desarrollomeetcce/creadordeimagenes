"use client";
import {
  syncTiming,
  type SyncTimingAccount,
} from "../../lib/meta-ads/sync-timing";
const stamp = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "medium",
      })
    : "Pendiente";
export function MetaDataFreshness({
  accounts,
}: {
  accounts: SyncTimingAccount[];
}) {
  if (!accounts.length) return null;
  const t = syncTiming(accounts),
    single = accounts.length === 1;
  return (
    <section
      className="meta-sync-inline"
      aria-label="Información de sincronización"
    >
      <span>
        <b>{single ? "Actividad" : "Actividad más reciente"}:</b>{" "}
        {stamp(t.activity)}
      </span>
      <span>
        <b>{single ? "Última completa" : "Completa más antigua"}:</b>{" "}
        {stamp(t.completed)}
        {!single && t.pending > 0 ? ` · ${t.pending} pendientes` : ""}
      </span>
      <details>
        <summary>
          {single
            ? (accounts[0].progress?.label ?? "Ver sincronización")
            : `${t.ongoing} sin finalizar · ${accounts.length} cuentas`}{" "}
          ·{" "}
          {single
            ? accounts[0].progress?.authorizationRequired
              ? "Necesita reconectar"
              : accounts[0].enabled && accounts[0].progress?.status !== "paused"
                ? `Auto ${accounts[0].intervalMinutes} min`
                : "Auto pausada"
            : `Auto en ${t.automatic}`}{" "}
          · hora de Lima
        </summary>
        <p>
          Actividad es el último intento o avance, no confirma datos nuevos.
          Completa es la última importación terminada. La actualización es
          periódica, no continua en tiempo real.
        </p>
        {accounts.map((a) => (
          <div key={a.id}>
            <strong>{a.name}</strong>
            <span>
              Actividad: {stamp(a.progress?.lastActivityAt)} · Completa:{" "}
              {stamp(a.lastCompletedAt)}
            </span>
            <span>Datos recibidos: {stamp(a.lastDataAt)}</span>
            <span>
              {a.progress?.authorizationRequired
                ? "Autorización vencida o rechazada. Reconectar Meta para continuar."
                : a.enabled && a.progress?.status !== "paused"
                  ? `Automática cada ${a.intervalMinutes} min, al terminar la importación actual.`
                  : "Automática pausada."}{" "}
              {a.progress?.label}
            </span>
            {a.progress?.nextSyncAt && !a.progress.authorizationRequired && (
              <span>
                {a.progress.status === "waiting"
                  ? "Reintento previsto"
                  : "Próxima ejecución prevista"}
                : {stamp(a.progress.nextSyncAt)}
              </span>
            )}
          </div>
        ))}
      </details>
    </section>
  );
}
