import type { LaunchStep } from "./campaign-policy";

// This exact historical message was emitted only before a transport request.
// Never infer safety from a generic timeout, a Meta rejection or an unknown result.
export const legacyPacingMessage =
  "Las consultas están en cola para evitar ráfagas. El avance está guardado.";
export function canResumeLocalWait(d: {
  status: string;
  error: string | null;
  steps: LaunchStep[];
}) {
  if (d.status !== "NEEDS_REVIEW" || d.error !== legacyPacingMessage)
    return false;
  const index = d.steps.findIndex((s) => s.state !== "DONE");
  return (
    index >= 0 &&
    d.steps[index].state === "UNCERTAIN" &&
    !d.steps[index].receipt &&
    d.steps.slice(index + 1).every((s) => s.state === "PENDING" && !s.receipt)
  );
}
export function launchPollDelay(
  next: {
    waiting?: boolean;
    nextAttemptAt?: string | null;
  },
  now = Date.now(),
) {
  const until = Date.parse(next.nextAttemptAt ?? "");
  return next.waiting && Number.isFinite(until)
    ? Math.max(300, Math.min(86400000, until - now + 100))
    : 300;
}
