import { createHash } from "node:crypto";
import { db } from "../db";
import { AppError } from "../errors";
import { isGraphQuota, type MetaGraphError } from "./graph-error";

export class MetaQuotaWait extends AppError {
  constructor(
    public retryAt: Date,
    public reason: "quota" | "pacing" = "quota",
  ) {
    super(
      reason === "quota"
        ? "Meta limitó las consultas. El avance está guardado; se volverá a intentar después de la pausa."
        : "Las consultas están en cola para evitar ráfagas. El avance está guardado.",
      429,
    );
  }
}
export function metaQuotaScope(
  c: { appId: string | null; metaUserId: string | null },
  token: string,
) {
  // Facebook user IDs are app scoped. Manual connections with the same token share a budget too.
  return createHash("sha256")
    .update(
      c.metaUserId
        ? JSON.stringify(["user", c.appId, c.metaUserId])
        : JSON.stringify(["token", token]),
    )
    .digest("hex");
}
export async function quotaUntil(scope: string) {
  const row = await db.metaApiQuota.findUnique({ where: { scope } });
  return row?.blockedUntil && row.blockedUntil.valueOf() > Date.now()
    ? row.blockedUntil
    : null;
}
export function quotaHooks(scope: string, paced: boolean) {
  return {
    async beforeRead() {
      const slot = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884412)`;
        const row = await tx.metaApiQuota.upsert({
          where: { scope },
          create: { scope },
          update: {},
        });
        const now = Date.now();
        if (row.blockedUntil && row.blockedUntil.valueOf() > now)
          throw new MetaQuotaWait(row.blockedUntil);
        if (!paced) return now;
        const at = Math.max(now, row.nextReadAt.valueOf());
        if (at - now > 10000) throw new MetaQuotaWait(new Date(at), "pacing");
        await tx.metaApiQuota.update({
          where: { scope },
          data: { nextReadAt: new Date(at + 1000) },
        });
        return at;
      });
      if (slot > Date.now())
        await new Promise((resolve) => setTimeout(resolve, slot - Date.now()));
      // Another request may have hit a quota while this reserved slot was waiting.
      const until = await quotaUntil(scope);
      if (until) throw new MetaQuotaWait(until);
    },
    async limited(error: MetaGraphError, retryMs: number) {
      if (!isGraphQuota(error.diagnostic.httpStatus, error.diagnostic.code))
        return;
      error.retryAt = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884412)`;
        const row = await tx.metaApiQuota.upsert({
          where: { scope },
          create: { scope },
          update: {},
        });
        const now = Date.now();
        // Concurrent failures belong to the same event, not several exponential retries.
        const recent =
          row.lastLimitedAt && now - row.lastLimitedAt.valueOf() < 30000;
        const failures = recent
          ? row.failures
          : row.lastLimitedAt && now - row.lastLimitedAt.valueOf() < 86400000
            ? Math.min(row.failures + 1, 5)
            : 1;
        const delay = Math.max(
          30 * 60000 * 2 ** Math.max(0, failures - 1),
          retryMs,
        );
        const until = new Date(
          Math.max(
            row.blockedUntil?.valueOf() ?? 0,
            now + Math.min(delay, 86400000),
          ),
        );
        await tx.metaApiQuota.update({
          where: { scope },
          data: { blockedUntil: until, lastLimitedAt: new Date(now), failures },
        });
        return until;
      });
    },
  };
}
