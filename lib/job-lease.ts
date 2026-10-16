import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
export const JOB_LEASE_MS = 15 * 60000;
export const JOB_HEARTBEAT_MS = 30000;
export const leaseCutoff = (now = new Date()) =>
  new Date(now.getTime() - JOB_LEASE_MS);
export function interruptedJobWhere(
  now = new Date(),
): Prisma.GenerationJobWhereInput {
  const before = leaseCutoff(now);
  return {
    status: "RUNNING",
    OR: [
      { heartbeatAt: { lt: before } },
      { heartbeatAt: null, startedAt: { lt: before } },
      { heartbeatAt: null, startedAt: null, createdAt: { lt: before } },
    ],
  };
}
// The token fences delayed processes. Expired leases cannot be renewed or publish results.
export function startJobHeartbeat(
  id: string,
  token: string,
  intervalMs = JOB_HEARTBEAT_MS,
) {
  const controller = new AbortController();
  let stopped = false,
    pending: Promise<void> | null = null;
  const lost = () =>
    new AppError(
      "Se perdió la confirmación de actividad del servidor. Revisa el estado y el consumo antes de autorizar otro intento.",
      409,
    );
  const check = (): Promise<void> => {
    if (stopped || controller.signal.aborted) return Promise.reject(lost());
    if (pending) return pending;
    pending = (async () => {
      try {
        const now = new Date();
        const result = await db.generationJob.updateMany({
          where: {
            id,
            status: "RUNNING",
            leaseToken: token,
            heartbeatAt: { gte: leaseCutoff(now) },
          },
          data: { heartbeatAt: now },
        });
        if (!result.count) throw lost();
      } catch {
        controller.abort();
        clearInterval(timer);
        throw lost();
      } finally {
        pending = null;
      }
    })();
    return pending;
  };
  const timer = setInterval(() => {
    void check().catch(() => {});
  }, intervalMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    check,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pending?.catch(() => {});
    },
  };
}
