export type SyncTimingAccount = {
  id: string;
  name: string;
  enabled: boolean;
  intervalMinutes: number;
  lastDataAt?: string | null;
  lastCompletedAt?: string | null;
  progress?: {
    status: string;
    authorizationRequired?: boolean;
    label: string;
    lastActivityAt?: string | null;
    nextSyncAt?: string | null;
  };
};
export function syncTiming(accounts: SyncTimingAccount[]) {
  const valid = (value?: string | null): value is string =>
    !!value && Number.isFinite(Date.parse(value));
  const completed = accounts
    .map((a) => a.lastCompletedAt)
    .filter(valid)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const activity = accounts
    .map((a) => a.progress?.lastActivityAt)
    .filter(valid)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return {
    activity: activity[0] ?? null,
    completed: completed[0] ?? null,
    pending: accounts.length - completed.length,
    automatic: accounts.filter(
      (a) =>
        a.enabled &&
        a.progress?.status !== "paused" &&
        !a.progress?.authorizationRequired,
    ).length,
    ongoing: accounts.filter(
      (a) =>
        a.progress &&
        !["complete", "disabled", "cancelled"].includes(a.progress.status),
    ).length,
  };
}
