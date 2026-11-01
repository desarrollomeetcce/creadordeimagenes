export type RealtimeState = {
  claim?: string; leaseUntil?: string; nextAt?: string;
  checkedAt?: string; statusAt?: string; since?: string; until?: string;
  objects?: string[]; revision?: number; error?: string; authorizationRequired?: boolean;
};
export function realtimeCoverage(raw: unknown, objectId: string, since: string, until: string) {
  const s = (raw && typeof raw === 'object' ? raw : {}) as RealtimeState;
  return !!s.checkedAt && !!s.since && !!s.until && !!s.objects?.includes(objectId) && since >= s.since && until <= s.until;
}
export function statusIsStale(seenAt: Date | string, error: unknown, now = Date.now()) {
  const at = new Date(seenAt).valueOf();
  return !!error || !Number.isFinite(at) || now - at > 120000;
}
