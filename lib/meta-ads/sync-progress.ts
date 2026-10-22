import { focusedLabels } from "./focused-labels";
const labels = [
  "Campañas",
  "Conjuntos de anuncios",
  "Anuncios",
  "Resultados de campañas",
  "Resultados de conjuntos",
  "Resultados de anuncios",
];
export type SyncProgress = {
  focused: boolean;
  recentReady: boolean;
  waitReason: "quota" | "pacing" | null;
  recentDays: number;
  scope: string | null;
  status:
    | "waiting"
    | "paused"
    | "cancelled"
    | "disabled"
    | "queued"
    | "running"
    | "error"
    | "complete"
    | "stalled";
  phase: number;
  totalPhases: number;
  label: string;
  pages: number;
  processed: number;
  lastActivityAt: string | null;
  nextSyncAt: string | null;
  attemptAt: string | null;
  credentialRevision: number | null;
};
export function syncProgress(
  a: {
    enabled: boolean;
    syncedAt: Date | null;
    nextSyncAt: Date | null;
    syncError: string | null;
    syncState: unknown;
  },
  now = Date.now(),
): SyncProgress {
  const s = (
    a.syncState && typeof a.syncState === "object" ? a.syncState : {}
  ) as {
    stop?: string;
    quotaUntil?: unknown;
    waitReason?: unknown;
    recentReady?: boolean;
    recentDays?: number;
    plan?: string;
    since?: string;
    until?: string;
    phase?: unknown;
    pages?: unknown;
    processed?: unknown;
    updatedAt?: unknown;
    started?: unknown;
    lastRun?: {
      pages?: unknown;
      processed?: unknown;
      finishedAt?: unknown;
      since?: string;
      until?: string;
      plan?: string;
      recentDays?: number;
      recentReady?: boolean;
    };
    lastAttempt?: { at?: unknown; revision?: unknown };
  };
  const integer = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
  const date = (d: unknown) =>
    typeof d === "string" && Number.isFinite(Date.parse(d)) ? d : null;
  const focused = s.plan === "focus" || s.lastRun?.plan === "focus";
  const totalPhases = focused ? focusedLabels.length : 6;
  const phase =
    typeof s.phase === "number" && s.phase >= 0 && s.phase < totalPhases
      ? Math.floor(s.phase)
      : null;
  const lastActivityAt = date(s.updatedAt) ?? date(s.started);
  const waiting = a.enabled && phase === null && !a.syncedAt;
  const stale =
    phase !== null
      ? !!lastActivityAt && now - Date.parse(lastActivityAt) > 180000
      : waiting && !!a.nextSyncAt && now - a.nextSyncAt.valueOf() > 180000;
  const quotaWaiting =
    !!date(s.quotaUntil) && Date.parse(date(s.quotaUntil)!) > now;
  const status = !a.enabled
    ? s.stop === "paused"
      ? "paused"
      : s.stop === "cancelled"
        ? "cancelled"
        : "disabled"
    : quotaWaiting
      ? "waiting"
      : a.syncError
        ? "error"
        : stale
          ? "stalled"
          : phase !== null
            ? "running"
            : waiting
              ? "queued"
              : "complete";
  return {
    focused,
    waitReason:
      status === "waiting"
        ? s.waitReason === "pacing"
          ? "pacing"
          : "quota"
        : null,
    recentReady: !!(
      s.recentReady ||
      (phase === null && s.lastRun?.recentReady)
    ),
    recentDays: s.recentDays ?? s.lastRun?.recentDays ?? (focused ? 7 : 30),
    scope: (phase !== null ? s.since : s.lastRun?.since)
      ? `${phase !== null ? s.since : s.lastRun?.since} → ${phase !== null ? s.until : s.lastRun?.until} · ${(phase !== null ? s.plan : s.lastRun?.plan) === "focus" ? "activos o con entrega reciente; estadísticas históricas independientes" : (phase !== null ? s.plan : s.lastRun?.plan) === "activity" ? "solo objetos con actividad en el periodo" : "catálogo completo"}`
      : null,
    status,
    phase: status === "complete" ? totalPhases : (phase ?? 0),
    totalPhases,
    label:
      status === "waiting"
        ? s.waitReason === "pacing"
          ? "Esperando el turno de consulta"
          : "En espera por límite de consultas de Meta"
        : status === "paused"
          ? "Sincronización pausada"
          : status === "cancelled"
            ? "Sincronización cancelada"
            : status === "disabled"
              ? "Sincronización deshabilitada"
              : status === "error"
                ? "Importación detenida por un error"
                : status === "stalled"
                  ? "Sin avance reciente confirmado"
                  : status === "queued"
                    ? "Esperando al ejecutor"
                    : status === "complete"
                      ? "Última importación completada"
                      : s.plan === "focus"
                        ? focusedLabels[phase ?? 0]
                        : (s.plan === "activity"
                            ? [
                                "Resultados de campañas",
                                "Resultados de conjuntos",
                                "Resultados de anuncios",
                                "Detalles de campañas",
                                "Detalles de conjuntos",
                                "Detalles de anuncios",
                              ]
                            : labels)[phase ?? 0],
    pages: integer(phase === null ? s.lastRun?.pages : s.pages),
    processed: integer(phase === null ? s.lastRun?.processed : s.processed),
    lastActivityAt: lastActivityAt ?? date(s.lastRun?.finishedAt),
    nextSyncAt: a.nextSyncAt?.toISOString() ?? null,
    attemptAt: date(s.lastAttempt?.at),
    credentialRevision: integer(s.lastAttempt?.revision) || null,
  };
}
