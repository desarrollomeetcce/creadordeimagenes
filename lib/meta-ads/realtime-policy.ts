export type RealtimeState = {
  priorityUntil?: string;
  quotaScopeHash?: string;
  claim?: string;
  leaseUntil?: string;
  nextAt?: string;
  checkedAt?: string;
  statusAt?: string;
  since?: string;
  until?: string;
  objects?: string[];
  revision?: number;
  error?: string;
  authorizationRequired?: boolean;
  authorizationSource?: "META" | "EXPIRED" | null;
};
export function realtimeCoverage(
  raw: unknown,
  objectId: string,
  since: string,
  until: string,
) {
  const s = (raw && typeof raw === "object" ? raw : {}) as RealtimeState;
  return (
    !!s.checkedAt &&
    !!s.since &&
    !!s.until &&
    !!s.objects?.includes(objectId) &&
    since >= s.since &&
    until <= s.until
  );
}
export function statusIsStale(
  seenAt: Date | string,
  error: unknown,
  now = Date.now(),
) {
  const at = new Date(seenAt).valueOf();
  return !!error || !Number.isFinite(at) || now - at > 120000;
}

/** Scheduling only: a provider pause must not be shortened into another one-minute poll. */
export function visibleRefreshDelay(nextAt: number | null, now = Date.now()) {
  return Math.max(
    1000,
    Math.min(2147483647, Number.isFinite(nextAt) ? nextAt! - now : 60000),
  );
}
export function isHistoricalMetaRead(state: unknown) {
  const s = (state ?? {}) as {
    plan?: string;
    phase?: number;
    recentReady?: boolean;
    refreshOnly?: boolean;
    mode?: string;
  };
  return (
    s.mode === "history" ||
    (s.plan === "focus" &&
      s.recentReady === true &&
      s.phase !== undefined &&
      s.phase >= 10 &&
      !s.refreshOnly)
  );
}
export function historicalReadDeferral(
  state: unknown,
  realtime: unknown,
  now = Date.now(),
) {
  const s = (state ?? {}) as {
    plan?: string;
    phase?: number;
    recentReady?: boolean;
    refreshOnly?: boolean;
    mode?: string;
  };
  const r = (realtime ?? {}) as { priorityUntil?: string };
  const at = r.priorityUntil ? Date.parse(r.priorityUntil) : NaN;
  const history = isHistoricalMetaRead(s);
  return history && Number.isFinite(at) && at > now ? new Date(at) : null;
}

/** Retry-After wins; absent a provider deadline, back off gradually instead of imposing30min at the first transient limit. */
export function metaQuotaPauseMs(failures: number, retryMs: number) {
  const progressive = Math.min(
    15 * 60000,
    60000 * 2 ** Math.max(0, Math.min(4, failures - 1)),
  );
  return Math.min(
    86400000,
    Math.max(progressive, Number.isFinite(retryMs) ? Math.max(0, retryMs) : 0),
  );
}
