import { automaticSyncAllowed } from "./automatic-sync";
import { decryptKey } from "../crypto";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { demand, AppError } from "../errors";
import { access, reader, type Actor } from "./service";
import { metaCanSync } from "./workspace-access";
import { localDay, shiftDay } from "./analytics";
import { facts, day } from "./focused-sync";
import { writeSyncPage } from "./bulk-sync";
import { MetaGraphError, requiresMetaReconnect } from "./graph-error";
import { MetaQuotaWait, metaQuotaScope, recoverMetaQuota } from "./quota";
import {
  realtimeCoverage,
  mergeRealtimeCoverage,
  realtimeSelectionCheckedAt,
  statusIsStale,
  type RealtimeState,
} from "./realtime-policy";
const scope = "7d_click,1d_view|impression";
const schema = z
  .object({
    recover: z.boolean().optional(),
    manual: z.boolean().optional(),
    objects: z
      .array(z.string().regex(/^\d{1,40}$/))
      .min(1)
      .max(50),
  })
  .strict();
/** Bounded GETs to Meta for the visible page; never enables accounts or changes an advertisement. */
export async function refreshVisibleMeta(
  actor: Actor,
  accountId: string,
  input: unknown,
) {
  const b = schema.parse(input);
  demand(new Set(b.objects).size === b.objects.length, "Selección repetida.");
  const a = await access(actor, accountId, true);
  demand(
    a.connection.transport === "API",
    "La actualización breve requiere Marketing API.",
    409,
  );
  const objects = await db.metaAdObject.findMany({
    where: { id: { in: b.objects }, accountId },
    select: {
      id: true,
      level: true,
      status: true,
      effectiveStatus: true,
      seenAt: true,
    },
  });
  demand(
    objects.length === b.objects.length,
    "Hay elementos de otra cuenta o no disponibles.",
    404,
  );
  if (
    !b.manual &&
    !b.recover &&
    (!a.enabled || !(await automaticSyncAllowed(a, db, false)))
  )
    return {
      updated: false,
      automaticDisabled: true,
      nextAt: null,
      error: null,
    };
  const claim = randomUUID(),
    at = new Date(),
    today = localDay(a.timezone),
    since = shiftDay(today, -1);
  async function transaction<T>(
    fn: (tx: Prisma.TransactionClient, current: RealtimeState) => Promise<T>,
  ) {
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        const current = await tx.metaAdAccount.findUniqueOrThrow({
          where: { id: accountId },
          include: {
            connection: true,
            grants: { where: { userId: actor.id } },
          },
        });
        demand(
          await metaCanSync(actor, current.grants, tx),
          "Ya no tienes permiso para actualizar esta cuenta.",
          403,
        );
        demand(
          current.connectionId === a.connectionId &&
            current.connection.revision === a.connection.revision &&
            !current.connection.disconnectedAt,
          "La conexión cambió. Vuelve a verificarla.",
          409,
        );
        return fn(tx, current.realtimeState as RealtimeState);
      },
      { timeout: 15000 },
    );
  }
  const recovery = { wait: null as Date | null };
  const acquired = await transaction(async (tx, s) => {
    const quotaScope = a.connection.encryptedToken
      ? metaQuotaScope(
          a.connection,
          decryptKey(a.connection.encryptedToken, `meta:${a.connectionId}`),
        )
      : null;
    if (s.revision === a.connection.revision) {
      // Legacy pending-verification errors were incorrectly labelled as expired.
      // Permit one bounded provider check; a genuine rejection below records its source.
      if (s.authorizationRequired && s.authorizationSource) return false;
      if (s.leaseUntil && Date.parse(s.leaseUntil) > Date.now()) return false;
      if (s.nextAt && Date.parse(s.nextAt) > Date.now()) {
        const heldByQuota =
          !!s.error &&
          /Meta limitó las consultas|código (?:4|17|32|613|80000|80004)\b|HTTP 429/.test(
            s.error,
          );
        if (!heldByQuota || !quotaScope) return false;
        if (b.recover) {
          recovery.wait = await recoverMetaQuota(tx, quotaScope);
          if (recovery.wait) return false;
        } else {
          const quota = await tx.metaApiQuota.findUnique({
            where: { scope: quotaScope },
          });
          if (quota?.blockedUntil && quota.blockedUntil > new Date())
            return false;
        }
      }
    }
    await tx.metaAdAccount.update({
      where: { id: accountId },
      data: {
        realtimeState: {
          ...s,
          claim,
          ...(s.revision !== a.connection.revision
            ? { coverage: {}, objects: [], checkedAt: null }
            : {}),
          quotaScopeHash: a.connection.encryptedToken
            ? metaQuotaScope(
                a.connection,
                decryptKey(
                  a.connection.encryptedToken,
                  `meta:${a.connectionId}`,
                ),
              )
            : "",
          priorityUntil: new Date(at.getTime() + 90000).toISOString(),
          revision: a.connection.revision,
          leaseUntil: new Date(Date.now() + 120000).toISOString(),
          nextAt: new Date(Date.now() + 60000).toISOString(),
        },
      },
    });
    return true;
  });
  if (!acquired) {
    const latest = await db.metaAdAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { realtimeState: true },
    });
    const s = latest.realtimeState as RealtimeState;
    return {
      updated: false,
      waiting: true,
      nextAt: recovery.wait?.toISOString() ?? s.nextAt ?? null,
      recoveryAt: recovery.wait?.toISOString() ?? null,
      checkedAt:
        realtimeSelectionCheckedAt(s, b.objects, since, today) ??
        s.checkedAt ??
        null,
      covered: b.objects.every((id) => realtimeCoverage(s, id, since, today)),
      authorizationRequired:
        !!s.authorizationRequired && !!s.authorizationSource,
      error: recovery.wait
        ? "La comprobación está en espera. Se respeta el plazo de Meta y una comprobación por conexión cada 15 minutos."
        : s.authorizationRequired && !s.authorizationSource
          ? "Conexión pendiente de comprobar con el informe de Meta."
          : (s.error ?? null),
    };
  }
  let statusUpdated = false;
  try {
    const { reader: r } = await reader(a.connectionId, true, true);
    // Reuse only already-verified states within the existing120s freshness window.
    // The spend report below still runs; stale/missing states and explicit recovery recheck Meta.
    const stale = objects.filter(
      (o) =>
        b.recover ||
        !o.status ||
        !o.effectiveStatus ||
        statusIsStale(o.seenAt, false, at.valueOf()) ||
        o.seenAt > at,
    );
    const allowed = new Set(stale.map((o) => o.id)),
      seen = new Set(
        objects.filter((o) => !allowed.has(o.id)).map((o) => o.id),
      );
    const response = stale.length
      ? await r.get("campaigns", {
          accountId,
          ids: stale.map((o) => o.id),
          statusOnly: true,
        })
      : { data: [] };
    const statusAt = new Date(
      Math.min(
        ...objects.map((o) =>
          allowed.has(o.id) ? at.valueOf() : o.seenAt.valueOf(),
        ),
      ),
    ).toISOString();
    for (const row of response.data) {
      const id = String(row.id);
      demand(
        allowed.has(id) &&
          !seen.has(id) &&
          String(row.account_id) === accountId,
        "Meta devolvió un estado ajeno o repetido.",
        502,
      );
      seen.add(id);
      demand(
        typeof row.status === "string" &&
          typeof row.effective_status === "string",
        "Meta no informó el estado del elemento.",
        502,
      );
    }
    // States are persisted before requesting reports, so a slow report cannot hide a campaign pause.
    await transaction(async (tx, s) => {
      demand(s.claim === claim, "Otra actualización tomó el turno.", 409);
      for (const row of response.data)
        await tx.metaAdObject.updateMany({
          where: { id: String(row.id), accountId, seenAt: { lte: at } },
          data: {
            status: String(row.status),
            effectiveStatus: String(row.effective_status),
            seenAt: at,
          },
        });
      const missing = stale.map((o) => o.id).filter((id) => !seen.has(id));
      if (missing.length)
        await tx.metaAdObject.updateMany({
          where: { accountId, id: { in: missing }, seenAt: { lte: at } },
          data: { status: null, effectiveStatus: "UNAVAILABLE", seenAt: at },
        });
      const campaignIds = new Set(objects.filter(o=>o.level === "campaign").map(o=>o.id));
      const confirmedIds = response.data.map(row=>String(row.id)).filter(id=>campaignIds.has(id));
      if (confirmedIds.length)
        await (await import("./paused-sales-retention")).retainPausedSalesRows(tx,confirmedIds,at);
      await tx.metaAdAccount.update({
        where: { id: accountId },
        data: {
          realtimeState: {
            ...s,
            statusAt,
            error: null,
            authorizationRequired: false,
          },
        },
      });
    });
    statusUpdated = stale.length > 0;
    const daily: Record<string, unknown>[] = [];
    for (const level of ["campaign", "adset", "ad"]) {
      const ids = objects
        .filter((o) => o.level === level && seen.has(o.id))
        .map((o) => o.id);
      if (!ids.length) continue;
      const found = new Set<string>();
      let after: string | undefined;
      for (let page = 0; page < 3; page++) {
        const report = await r.get("insights", {
          accountId,
          level,
          insightIds: ids,
          since,
          until: today,
          after,
        });
        for (const row of report.data) {
          const oid = String(row[level + "_id"]),
            d = day(row.date_start),
            key = oid + ":" + d;
          demand(
            ids.includes(oid) &&
              String(row.account_id) === accountId &&
              d === row.date_stop &&
              d >= since &&
              d <= today &&
              !found.has(key),
            "Meta devolvió un informe ajeno, repetido o fuera del rango.",
            502,
          );
          found.add(key);
          daily.push({
            id: randomUUID(),
            accountId,
            objectId: oid,
            day: d,
            scope,
            ...facts(row),
          });
        }
        demand(
          !report.after || report.after !== after,
          "Meta repitió el cursor del informe.",
          502,
        );
        after = report.after;
        if (!after) break;
      }
      demand(
        !after,
        "Meta no completó el informe breve. Se conserva el gasto anterior.",
        502,
      );
      // A complete, authorized two-day report with no activity is a confirmed zero, not a missing report.
      for (const oid of ids)
        for (const d of [since, today])
          if (!found.has(oid + ":" + d))
            daily.push({
              id: randomUUID(),
              accountId,
              objectId: oid,
              day: d,
              scope,
              ...facts({}),
            });
    }
    await transaction(async (tx, s) => {
      demand(s.claim === claim, "Otra actualización tomó el turno.", 409);
      await writeSyncPage(tx, [], daily, false, at);
      if (!a.connection.verifiedAt) {
        const verified = await tx.metaConnection.updateMany({
          where: {
            id: a.connectionId,
            revision: a.connection.revision,
            disconnectedAt: null,
          },
          data: { verifiedAt: at, lastError: null },
        });
        demand(
          verified.count === 1,
          "La conexión cambió antes de verificar el informe.",
          409,
        );
        await tx.metaAccountSource.updateMany({
          where: {
            accountId,
            connectionId: a.connectionId,
            revision: a.connection.revision,
          },
          data: { verifiedAt: at },
        });
      }
      await tx.metaAdAccount.update({
        where: { id: accountId },
        data: {
          realtimeState: {
            quotaScopeHash: s.quotaScopeHash ?? "",
            priorityUntil: new Date(at.getTime() + 90000).toISOString(),
            checkedAt: at.toISOString(),
            statusAt,
            since,
            until: today,
            objects: [...seen],
            coverage: mergeRealtimeCoverage(
              s,
              b.objects,
              [...seen],
              since,
              today,
              a.connection.revision,
              at.toISOString(),
            ),
            revision: a.connection.revision,
            nextAt: s.nextAt ?? new Date(Date.now() + 60000).toISOString(),
          },
        },
      });
    });
    return {
      updated: true,
      statusUpdated,
      covered: true,
      checkedAt: at.toISOString(),
      count: seen.size,
      since,
      until: today,
      nextAt: new Date(at.getTime() + 60000).toISOString(),
    };
  } catch (error) {
    const auth =
      requiresMetaReconnect(error) ||
      (error instanceof Error && /token.*caduc/i.test(error.message));
    const retryAt =
      error instanceof MetaQuotaWait
        ? error.retryAt
        : error instanceof MetaGraphError
          ? error.retryAt
          : undefined;
    const message = auth
      ? "Meta requiere renovar la autorización" +
        (error instanceof MetaGraphError
          ? ` (HTTP ${error.diagnostic.httpStatus}, código ${error.diagnostic.code ?? "sin código"})`
          : " por caducidad de la credencial") +
        ". Reconecta la conexión para volver a consultar estados y gasto."
      : error instanceof MetaGraphError || error instanceof AppError
        ? error.message
        : "No se pudo completar la lectura breve de Meta. Se conservan los datos anteriores.";
    await transaction(async (tx, s) => {
      if (s.claim !== claim) return;
      const { claim: _, leaseUntil: __, ...rest } = s;
      await tx.metaAdAccount.update({
        where: { id: accountId },
        data: {
          realtimeState: {
            ...rest,
            error: message,
            authorizationRequired: auth,
            authorizationSource: auth
              ? error instanceof MetaGraphError
                ? "META"
                : "EXPIRED"
              : null,
            nextAt: (retryAt ?? new Date(Date.now() + 60000)).toISOString(),
          },
        },
      });
    }).catch(() => {});
    if (error instanceof AppError && [403, 404].includes(error.status))
      throw error;
    return {
      updated: false,
      statusUpdated,
      error: message,
      authorizationRequired: auth,
      waiting: !!retryAt,
      nextAt: (retryAt ?? new Date(Date.now() + 60000)).toISOString(),
    };
  }
}
