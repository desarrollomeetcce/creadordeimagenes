import type { Prisma } from "@prisma/client";
import { metaQuotaPauseMs } from "./realtime-policy";
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
/** Credential rotation must not reset a provider pause for the same connection. */
export async function carryMetaQuota(tx:Prisma.TransactionClient,from:string,to:string){
 if(from===to)return;
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(884412)`;
 for(const prefix of ["","provider:","recovery:"]){
  const rows=await tx.metaApiQuota.findMany({where:{scope:{in:[prefix+from,prefix+to]}}});
  if(!rows.some(row=>row.scope===prefix+from))continue;
  const maxDate=(values:(Date|null)[])=>{const stamps=values.filter((v):v is Date=>!!v).map(v=>v.valueOf());return stamps.length?new Date(Math.max(...stamps)):null};
  const data={blockedUntil:maxDate(rows.map(row=>row.blockedUntil)),nextReadAt:maxDate(rows.map(row=>row.nextReadAt))!,lastLimitedAt:maxDate(rows.map(row=>row.lastLimitedAt)),failures:Math.max(...rows.map(row=>row.failures))};
  await tx.metaApiQuota.upsert({where:{scope:prefix+to},create:{scope:prefix+to,...data},update:data});
 }
}
export async function quotaUntil(scope: string) {
  const row = await db.metaApiQuota.findUnique({ where: { scope } });
  return row?.blockedUntil && row.blockedUntil.valueOf() > Date.now()
    ? row.blockedUntil
    : null;
}
/** Explicit, bounded availability check of an app-held pause. Separate quota keys
 * retain provider deadlines and serialize recovery across all shared accounts. */
export async function recoverMetaQuota(
  tx: Prisma.TransactionClient,
  scope: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(884412)`;
  const rows = await tx.metaApiQuota.findMany({
    where: { scope: { in: [scope, "provider:" + scope, "recovery:" + scope] } },
  });
  const now = Date.now(),
    row = rows.find((r) => r.scope === scope),
    provider = rows.find((r) => r.scope === "provider:" + scope),
    recovery = rows.find((r) => r.scope === "recovery:" + scope);
  if (provider?.blockedUntil && provider.blockedUntil.valueOf() > now)
    return provider.blockedUntil;
  if (!row?.blockedUntil || row.blockedUntil.valueOf() <= now) return null;
  const earliest = Math.max(
    (row.lastLimitedAt?.valueOf() ?? 0) + 60000,
    recovery?.nextReadAt.valueOf() ?? 0,
  );
  if (earliest > now) return new Date(earliest);
  await tx.metaApiQuota.upsert({
    where: { scope: "recovery:" + scope },
    create: {
      scope: "recovery:" + scope,
      nextReadAt: new Date(now + 15 * 60000),
    },
    update: { nextReadAt: new Date(now + 15 * 60000) },
  });
  // Do not change account schedules/cursors, data, failures, tokens or permissions.
  await tx.metaApiQuota.update({
    where: { scope },
    data: { blockedUntil: null },
  });
  return null;
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
        if (Number.isFinite(retryMs) && retryMs > 0) {
          const providerScope = "provider:" + scope;
          const existing = await tx.metaApiQuota.findUnique({
            where: { scope: providerScope },
          });
          const deadline = new Date(
            Math.max(
              existing?.blockedUntil?.valueOf() ?? 0,
              now + Math.min(retryMs, 86400000),
            ),
          );
          await tx.metaApiQuota.upsert({
            where: { scope: providerScope },
            create: { scope: providerScope, blockedUntil: deadline },
            update: { blockedUntil: deadline },
          });
        }
        // Concurrent failures belong to the same event, not several exponential retries.
        const recent =
          row.lastLimitedAt && now - row.lastLimitedAt.valueOf() < 30000;
        const failures = recent
          ? row.failures
          : row.lastLimitedAt && now - row.lastLimitedAt.valueOf() < 86400000
            ? Math.min(row.failures + 1, 5)
            : 1;
        const delay = metaQuotaPauseMs(failures, retryMs);
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
