const labels = [
  "Campañas",
  "Conjuntos de anuncios",
  "Anuncios",
  "Resultados de campañas",
  "Resultados de conjuntos",
  "Resultados de anuncios",
];
export type SyncProgress = {
  recentDays: number;
  scope: string | null;
  status: "disabled" | "queued" | "running" | "error" | "complete" | "stalled";
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
    recentDays?: number;
    plan?: string;
    since?: string;
    until?: string;
    phase?: unknown;
    pages?: unknown;
    processed?: unknown;
    updatedAt?: unknown;
    started?: unknown;
    lastRun?: { pages?: unknown; processed?: unknown; finishedAt?: unknown; since?: string; until?: string; plan?: string; recentDays?: number };
    lastAttempt?: { at?: unknown; revision?: unknown };
  };
  const integer = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
  const date = (d: unknown) =>
    typeof d === "string" && Number.isFinite(Date.parse(d)) ? d : null;
  const phase =
    typeof s.phase === "number" && s.phase >= 0 && s.phase < 6
      ? Math.floor(s.phase)
      : null;
  const lastActivityAt = date(s.updatedAt) ?? date(s.started);
  const waiting = a.enabled && phase === null && !a.syncedAt;
  const stale =
    phase !== null
      ? !!lastActivityAt && now - Date.parse(lastActivityAt) > 180000
      : waiting && !!a.nextSyncAt && now - a.nextSyncAt.valueOf() > 180000;
  const status = !a.enabled
    ? "disabled"
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
    recentDays: s.recentDays ?? s.lastRun?.recentDays ?? 30,
    scope: (phase !== null ? s.since : s.lastRun?.since) ? `${phase !== null ? s.since : s.lastRun?.since} → ${phase !== null ? s.until : s.lastRun?.until} · ${(phase !== null ? s.plan : s.lastRun?.plan) === "activity" ? "solo objetos con actividad en el periodo" : "catálogo completo"}` : null,
    status,
    phase: status === "complete" ? 6 : (phase ?? 0),
    totalPhases: 6,
    label:
      status === "disabled"
        ? "Sincronización deshabilitada"
        : status === "error"
          ? "Importación detenida por un error"
          : status === "stalled"
            ? "Sin avance reciente confirmado"
            : status === "queued"
              ? "Esperando al ejecutor"
              : status === "complete"
                ? "Última importación completada"
                : (s.plan === "activity" ? ["Resultados de campañas", "Resultados de conjuntos", "Resultados de anuncios", "Detalles de campañas", "Detalles de conjuntos", "Detalles de anuncios"] : labels)[phase ?? 0],
    pages: integer(phase === null ? s.lastRun?.pages : s.pages),
    processed: integer(phase === null ? s.lastRun?.processed : s.processed),
    lastActivityAt: lastActivityAt ?? date(s.lastRun?.finishedAt),
    nextSyncAt: a.nextSyncAt?.toISOString() ?? null,
    attemptAt: date(s.lastAttempt?.at),
    credentialRevision: integer(s.lastAttempt?.revision) || null,
  };
}
