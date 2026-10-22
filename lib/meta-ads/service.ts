import { writeSyncPage } from "./bulk-sync";
import { syncProgress } from "./sync-progress";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly, rateLimit } from "../auth";
import { encryptKey, decryptKey, maskKey } from "../crypto";
import { demand, AppError } from "../errors";
import { recordActivity } from "../activity";
import { MetaReader, type Operation, type Query } from "./provider";
import {
  MetaGraphError,
  internalErrorCode,
  type GraphDiagnostic,
} from "./graph-error";
import { localDay, shiftDay, metricFor } from "./analytics";
export type Actor = { id: string; role: string };
export const connectionSelect = {
  id: true,
  name: true,
  transport: true,
  apiVersion: true,
  appId: true,
  appSecretConfiguredAt: true,
  loginConfigId: true,
  authMethod: true,
  tokenExpiresAt: true,
  tokenMask: true,
  revision: true,
  verifiedAt: true,
  disconnectedAt: true,
  lastError: true,
  createdAt: true,
} as const;
export const accountSelect = {
  id: true,
  connectionId: true,
  name: true,
  businessId: true,
  businessName: true,
  currency: true,
  timezone: true,
  enabled: true,
  metric: true,
  targetCost: true,
  minResults: true,
  intervalMinutes: true,
  historyFrom: true,
  syncedAt: true,
  nextSyncAt: true,
  syncError: true,
  syncState: true,
} as const;
export const accountWhere = (actor: Actor): Prisma.MetaAdAccountWhereInput =>
  actor.role === "OWNER"
    ? {}
    : {
        connection: { disconnectedAt: null },
        grants: { some: { userId: actor.id } },
      };
export async function access(actor: Actor, id: string, sync = false) {
  const a = await db.metaAdAccount.findFirst({
    where: { AND: [{ id }, accountWhere(actor)] },
    include: { connection: true, grants: { where: { userId: actor.id } } },
  });
  demand(a, "Cuenta publicitaria no disponible para este usuario.", 404);
  if (sync)
    demand(
      actor.role === "OWNER" ||
        (actor.role === "ADMIN" && a.grants.some((g) => g.canSync)),
      "No tienes permiso para sincronizar esta cuenta.",
      403,
    );
  return a;
}
export async function reader(id: string, allowUnverified = false) {
  const c = await db.metaConnection.findUniqueOrThrow({ where: { id } });
  const owner = await db.user.findFirst({
    where: { id: c.ownerId, role: "OWNER", status: "APPROVED" },
  });
  demand(
    owner && !c.disconnectedAt && c.encryptedToken,
    "La conexión está desconectada o su propietario ya no está autorizado.",
    409,
  );
  demand(
    allowUnverified || c.verifiedAt,
    "La conexión cambió o todavía no se verificó. Verifica antes de sincronizar.",
    409,
  );
  demand(!c.tokenExpiresAt || c.tokenExpiresAt > new Date(), "El token de Facebook caducó. Pulsa Conectar con Facebook para renovar la autorización.", 409);
  return {
    connection: c,
    reader: new MetaReader(
      decryptKey(c.encryptedToken, `meta:${c.id}`),
      c.transport,
      c.apiVersion,
      c.transport === "API" && c.authMethod === "OAUTH" && c.encryptedAppSecret ? decryptKey(c.encryptedAppSecret, `meta-app:${c.id}`) : undefined,
    ),
  };
}
const digits = (v: unknown) => {
  const s = String(v ?? "").replace(/^act_/, "");
  demand(/^\d{1,40}$/.test(s), "Meta devolvió un identificador inválido.", 502);
  return s;
};
const text = (v: unknown, max = 250) =>
  typeof v === "string" ? v.slice(0, max) : "";
const finite = (v: unknown) => {
  const n = Number(v ?? 0);
  demand(
    Number.isFinite(n) && n >= 0 && n <= 1e12,
    "Meta devolvió una métrica inválida.",
    502,
  );
  return n;
};
function date(v: unknown) {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isFinite(d.valueOf()) ? d : null;
}
export async function discover(
  actor: Actor,
  id: string,
  expectedRevision?: number,
  sessionId?: string,
) {
  ownerOnly(actor);
  await rateLimit("meta:discover:" + actor.id, 15);
  const { connection: c, reader: r } = await reader(id, true);
  demand(
    expectedRevision === undefined || c.revision === expectedRevision,
    "La conexión cambió durante la autorización. Inicia de nuevo.",
    409,
  );
  let phase = "descubrimiento de herramientas",
    minimalVerified = false;
  try {
    const tools = c.transport === "MCP" ? await r.tools() : [];
    let after: string | undefined;
    let count = 0;
    const warnings: GraphDiagnostic[] = [];
    const visited = new Set<string>();
    do {
      const result = await r.accounts(after, (next) => {
        phase = next;
        if (
          c.transport === "API" &&
          next === "lectura de moneda y zona horaria"
        )
          minimalVerified = true;
      });
      if (c.transport === "API") minimalVerified = true;
      warnings.push(...(result.warnings ?? []));
      phase = "validación de metadatos";
      const normalized = result.data.map((row) => {
        const aid = digits(row.id),
          currency = text(row.currency, 3),
          timezone = text(row.timezone_name, 100);
        demand(
          /^[A-Z]{3}$/.test(currency),
          "Meta no devolvió la moneda de la cuenta.",
          502,
        );
        try {
          localDay(timezone);
        } catch {
          throw new AppError("Meta no devolvió una zona horaria válida.", 502);
        }
        const business = row.business as
          { id?: unknown; name?: unknown } | undefined;
        return {
          aid,
          data: {
            name: text(row.name) || aid,
            currency,
            timezone,
            ...(Object.hasOwn(row, "business")
              ? {
                  businessId: business?.id ? digits(business.id) : null,
                  businessName: text(business?.name) || null,
                }
              : {}),
            ...(Object.hasOwn(row, "account_status")
              ? {
                  accountStatus:
                    typeof row.account_status === "number"
                      ? row.account_status
                      : null,
                }
              : {}),
          },
        };
      });
      phase = "guardado de cuentas";
      // Keep remote-database round trips out of one default five-second transaction.
      for (let offset = 0; offset < normalized.length; offset += 10) {
        const batch = normalized.slice(offset, offset + 10),
          ids = batch.map((row) => row.aid);
        await db.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
            if (sessionId)
              demand(
                await tx.session.findFirst({
                  where: {
                    id: sessionId,
                    userId: actor.id,
                    expiresAt: { gt: new Date() },
                    user: { role: "OWNER", status: "APPROVED" },
                  },
                }),
                "La sesión original ya no está autorizada.",
                401,
              );
            demand(
              await tx.user.findFirst({
                where: { id: c.ownerId, role: "OWNER", status: "APPROVED" },
              }),
              "El propietario de la conexión ya no está autorizado.",
              403,
            );
            demand(
              await tx.metaConnection.findFirst({
                where: { id, revision: c.revision, disconnectedAt: null },
              }),
              "La conexión cambió. Vuelve a verificarla.",
              409,
            );
            const previous = await tx.metaAdAccount.findMany({
              where: { id: { in: ids } },
              select: { id: true, connectionId: true },
            });
            const existing = new Map(
              previous.map((a) => [a.id, a.connectionId]),
            );
            await tx.metaAdAccount.createMany({
              data: batch
                .filter((row) => !existing.has(row.aid))
                .map((row) => ({ id: row.aid, connectionId: id, ...row.data })),
              skipDuplicates: true,
            });
            for (const row of batch)
              if (existing.get(row.aid) === id)
                await tx.metaAdAccount.update({
                  where: { id: row.aid },
                  data: row.data,
                });
            await tx.metaAccountSource.createMany({
              data: ids.map((accountId) => ({
                accountId,
                connectionId: id,
                revision: c.revision,
              })),
              skipDuplicates: true,
            });
            await tx.metaAccountSource.updateMany({
              where: { accountId: { in: ids }, connectionId: id },
              data: { revision: c.revision, verifiedAt: new Date() },
            });
          },
          { timeout: 30000, maxWait: 10000 },
        );
        count += batch.length;
      }
      after = result.after;
      if (after) {
        demand(
          !visited.has(after),
          "Meta repitió un cursor. No se completó la importación.",
          502,
        );
        visited.add(after);
      }
      demand(
        visited.size <= 100,
        "La importación supera 10.000 cuentas; reduce el alcance de la autorización.",
        409,
      );
    } while (after);
    phase = "confirmación de la conexión";
    const verified = await db.$transaction(async (tx) => {
      if (sessionId)
        demand(
          await tx.session.findFirst({
            where: {
              id: sessionId,
              userId: actor.id,
              expiresAt: { gt: new Date() },
              user: { role: "OWNER", status: "APPROVED" },
            },
          }),
          "La sesión original ya no está autorizada.",
          401,
        );
      demand(
        await tx.user.findFirst({
          where: { id: c.ownerId, role: "OWNER", status: "APPROVED" },
        }),
        "El propietario de la conexión ya no está autorizado.",
        403,
      );
      return tx.metaConnection.updateMany({
        where: {
          id,
          revision: c.revision,
          disconnectedAt: null,
        },
        data: {
          verifiedAt: new Date(),
          lastError: warnings.length
            ? `Cuentas verificadas; campos opcionales omitidos: ${warnings
                .slice(0, 3)
                .map(
                  (w) =>
                    `${w.fields}: código ${w.code ?? w.httpStatus}${w.subcode !== null ? `/${w.subcode}` : ""} · ${w.message}`,
                )
                .join("; ")}`.slice(0, 2200)
            : null,
          tools: tools as unknown as Prisma.InputJsonValue,
        },
      });
    });
    demand(
      verified.count,
      "La conexión cambió antes de completar la verificación.",
      409,
    );
    phase = "registro de verificación";
    await recordActivity(db, {
      data: {
        actorId: actor.id,
        action: "META_CONEXION_VERIFICADA",
        resourceId: id,
        detail: {
          transport: c.transport,
          accounts: count,
          apiVersion: c.apiVersion,
          ...(c.transport === "API" ? { minimalFields: "id,name" } : {}),
          warnings: warnings.slice(0, 5),
        },
      },
    });
    return {
      accounts: count,
      tools: tools.map((t) => t.name),
      warnings: warnings.slice(0, 5),
      ...(c.transport === "API"
        ? { minimalVerified: true, apiVersion: c.apiVersion }
        : {}),
    };
  } catch (e) {
    const reference = randomUUID();
    const code = internalErrorCode(e);
    const message =
      e instanceof AppError
        ? e.message
        : `${minimalVerified ? "La consulta mínima id,name fue correcta. " : ""}Falló ${phase} en la plataforma${code ? ` (${code})` : ""}. Referencia: ${reference}. Se conservan la conexión y los datos previos.`;
    const diagnostic = {
      reference,
      phase,
      minimalVerified,
      apiVersion: c.apiVersion,
      ...(code ? { internalCode: code } : {}),
      ...(e instanceof MetaGraphError ? e.diagnostic : {}),
    };
    console.warn(
      JSON.stringify({
        event: "meta_verification_failed",
        connectionId: id,
        ...diagnostic,
      }),
    );
    try {
      await db.metaConnection.updateMany({
        where: { id, revision: c.revision },
        data: { lastError: message, verifiedAt: null },
      });
    } catch (persistenceError) {
      console.warn(
        JSON.stringify({
          event: "meta_verification_diagnostic_unavailable",
          reference,
          code: internalErrorCode(persistenceError),
        }),
      );
    }
    try {
      await recordActivity(db, {
        data: {
          actorId: actor.id,
          action: "META_CONEXION_ERROR",
          resourceId: id,
          detail: diagnostic,
        },
      });
    } catch (auditError) {
      console.warn(
        JSON.stringify({
          event: "meta_verification_audit_unavailable",
          reference,
          code: internalErrorCode(auditError),
        }),
      );
    }
    throw new AppError(message, e instanceof AppError ? e.status : 503);
  }
}
export async function saveToken(
  id: string,
  token: string,
  expectedRevision?: number,
  options?: { method: "OAUTH"; expiresAt: Date | null; metaUserId: string; sessionId: string },
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    const c = await tx.metaConnection.findUniqueOrThrow({ where: { id } });
    demand(
      expectedRevision === undefined || c.revision === expectedRevision,
      "La conexión cambió durante la autorización. Inicia de nuevo.",
      409,
    );
    const owner = await tx.user.findFirst({
      where: { id: c.ownerId, role: "OWNER", status: "APPROVED" },
    });
    demand(owner, "El propietario de la conexión ya no está autorizado.", 403);
    if (options) demand(await tx.session.findFirst({ where: { id: options.sessionId, userId: c.ownerId, expiresAt: { gt: new Date() }, user: { role: "OWNER", status: "APPROVED" } } }), "La sesión original ya no está autorizada.", 401);
    const changed = await tx.metaConnection.updateMany({
      where: { id, revision: c.revision },
      data: {
        encryptedToken: encryptKey(token, `meta:${id}`),
        tokenMask: maskKey(token),
        revision: { increment: 1 },
        verifiedAt: null,
        disconnectedAt: null,
        lastError: null,
        tools: [],
        authMethod: options?.method ?? (c.transport === "MCP" ? "MCP" : "MANUAL"),
        tokenExpiresAt: options?.expiresAt ?? null,
        metaUserId: options?.metaUserId ?? null,
      },
    });
    demand(changed.count, "La conexión cambió. Vuelve a intentarlo.", 409);
    // Stop old credential attempts without discarding imported data or page cursors.
    await tx.metaAdAccount.updateMany({
      where: { connectionId: id },
      data: {
        syncError: null,
        syncToken: null,
        syncLeaseAt: null,
        schedulerToken: null,
        schedulerRunId: null,
        nextSyncAt: null,
      },
    });
    return c.revision + 1;
  });
}

const phases = [
  "campaigns",
  "adsets",
  "ads",
  "insights:campaign",
  "insights:adset",
  "insights:ad",
];
type State = {
  phase?: number;
  after?: string;
  since?: string;
  until?: string;
  mode?: string;
  pages?: number;
  processed?: number;
  updatedAt?: string;
  lastRun?: { pages: number; processed: number; finishedAt: string };
  started?: string;
  lastAttempt?: { at: string; revision: number };
};
export async function queueSync(actor: Actor, id: string, full = false) {
  const a = await access(actor, id, true);
  demand(
    a.enabled && a.connection.verifiedAt,
    "Habilita la cuenta y verifica su conexión antes de sincronizar.",
    409,
  );
  await rateLimit("meta:sync:" + actor.id, 30);
  const progress = syncProgress(a);
  const resumed = !full && typeof (a.syncState as State).phase === "number";
  // Retire a stopped executor, including runs pinned to a previous deployment.
  // The saved page cursor and imported records belong to the account, not the run.
  const recover = progress.status === "error" || progress.status === "stalled";
  const updated = await db.metaAdAccount.updateMany({
    where: {
      id,
      enabled: true,
      connectionId: a.connectionId,
      connection: { revision: a.connection.revision, disconnectedAt: null },
      OR: [
        { syncToken: null },
        { syncLeaseAt: { lt: new Date(Date.now() - 120000) } },
      ],
    },
    data: {
      nextSyncAt: new Date(),
      syncError: null,
      ...(recover ? { schedulerToken: null, schedulerRunId: null } : {}),
      ...(full ? { syncState: {}, syncedAt: null } : {}),
    },
  });
  demand(updated.count, "La cuenta ya está procesando una página o su conexión cambió. Espera a que termine y vuelve a consultar el progreso.", 409);
  return { queued: true, resumed };
}
export async function syncStep(id: string): Promise<boolean> {
  const token = randomUUID(),
    now = new Date();
  const claimed = await db.metaAdAccount.updateMany({
    where: {
      id,
      enabled: true,
      nextSyncAt: { lte: now },
      connection: { disconnectedAt: null },
      OR: [
        { syncToken: null },
        { syncLeaseAt: { lt: new Date(Date.now() - 120000) } },
      ],
    },
    data: { syncToken: token, syncLeaseAt: now },
  });
  if (!claimed.count) return false;
  let revision = 0,
    syncPhase = "inicio";
  try {
    const a = await db.metaAdAccount.findUniqueOrThrow({ where: { id } }),
      { connection: c, reader: r } = await reader(a.connectionId);
    revision = c.revision;
    const state = a.syncState as State;
    const started = state.started ?? new Date().toISOString();
    const today = localDay(a.timezone);
    const since = state.mode
      ? state.since
      : a.syncedAt
        ? shiftDay(today, -35)
        : undefined;
    const until = state.until ?? today;
    const phase = state.phase ?? 0;
    demand(phase < phases.length, "Estado de sincronización inválido.", 409);
    const current = phases[phase],
      insight = current.startsWith("insights:"),
      level = current.split(":")[1];
    syncPhase = current;
    const lastAttempt = { at: now.toISOString(), revision: c.revision };
    const attempt = await db.metaAdAccount.updateMany({
        where: { id, syncToken: token, connectionId: a.connectionId, connection: { revision: c.revision, disconnectedAt: null } },
        data: {
          syncState: {
            ...state,
            started,
            phase,
            pages: state.pages ?? 0,
            processed: state.processed ?? 0,
            lastAttempt,
          },
        },
      });
    demand(attempt.count, "La credencial cambió antes de consultar Meta. Vuelve a verificar la conexión.", 409);
    const result = await r.get((insight ? "insights" : current) as Operation, {
      accountId: id,
      after: state.after,
      level,
      since,
      until,
    });
    demand(
      !result.after || result.after !== state.after,
      "Meta repitió la página de resultados. Revisa la sincronización.",
      502,
    );
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        demand(
          await tx.user.findFirst({
            where: { id: c.ownerId, role: "OWNER", status: "APPROVED" },
          }),
          "El propietario de la conexión ya no está autorizado.",
          403,
        );
        const fresh = await tx.metaAdAccount.findFirst({
          where: {
            id,
            enabled: true,
            connectionId: a.connectionId,
            syncToken: token,
            connection: { revision: c.revision, disconnectedAt: null },
          },
        });
        demand(
          fresh,
          "La cuenta o la conexión cambió durante la sincronización.",
          409,
        );
        const objectIds = [
          ...new Set(
            result.data.map((row) =>
              digits(insight ? row[level + "_id"] : row.id),
            ),
          ),
        ];
        const existingObjects = new Map(
          (objectIds.length
            ? await tx.metaAdObject.findMany({
                where: { id: { in: objectIds } },
                select: { id: true, accountId: true },
              })
            : []
          ).map((o) => [o.id, o]),
        );
        const objectRows: Record<string, unknown>[] = [],
          dailyRows: Record<string, unknown>[] = [];
        for (const row of result.data) {
          if (insight) {
            const oid = digits(row[level + "_id"]),
              day = text(row.date_start, 10);
            demand(
              digits(row.account_id) === id &&
                /^\d{4}-\d{2}-\d{2}$/.test(day) &&
                row.date_stop === day &&
                day <= until &&
                (!since || day >= since),
              "Meta no devolvió estadísticas diarias del rango solicitado.",
              502,
            );
            const obj = existingObjects.get(oid);
            demand(
              !obj || obj.accountId === id,
              "Meta devolvió un objeto de otra cuenta.",
              502,
            );
            if (!obj)
              objectRows.push({
                id: oid,
                accountId: id,
                level,
                name: text(row[level + "_name"]) || oid,
                campaignId: row.campaign_id ? digits(row.campaign_id) : null,
                adsetId: row.adset_id ? digits(row.adset_id) : null,
              });
            const actions: Record<string, number> = {};
            if (Array.isArray(row.actions))
              for (const action of row.actions.slice(0, 150)) {
                const entry = action as {
                  action_type: unknown;
                  value: unknown;
                };
                if (
                  typeof entry.action_type === "string" &&
                  /^[a-zA-Z0-9_.]{1,150}$/.test(entry.action_type)
                )
                  actions[entry.action_type] = finite(entry.value);
              }
            const data = {
              spend: finite(row.spend),
              impressions: finite(row.impressions),
              clicks: finite(row.clicks),
              actions,
            };
            dailyRows.push({
              id: randomUUID(),
              accountId: id,
              objectId: oid,
              day,
              scope: "7d_click,1d_view|impression",
              ...data,
            });
          } else {
            const oid = digits(row.id),
              kind =
                current === "campaigns"
                  ? "campaign"
                  : current === "adsets"
                    ? "adset"
                    : "ad";
            const existing = existingObjects.get(oid);
            demand(
              !existing || existing.accountId === id,
              "Meta devolvió un objeto de otra cuenta.",
              502,
            );
            let thumbnailUrl: string | null = null;
            const creative = row.creative as
              { thumbnail_url?: unknown } | undefined;
            if (typeof creative?.thumbnail_url === "string") {
              try {
                const u = new URL(creative.thumbnail_url);
                if (
                  u.protocol === "https:" &&
                  (u.hostname.endsWith(".fbcdn.net") ||
                    u.hostname.endsWith(".facebook.com")) &&
                  !u.searchParams.has("access_token")
                )
                  thumbnailUrl = u.href;
              } catch {}
            }
            const data = {
              name: text(row.name) || oid,
              level: kind,
              campaignId: row.campaign_id
                ? digits(row.campaign_id)
                : kind === "campaign"
                  ? oid
                  : null,
              adsetId: row.adset_id
                ? digits(row.adset_id)
                : kind === "adset"
                  ? oid
                  : null,
              objective: text(row.objective) || null,
              optimizationGoal: text(row.optimization_goal) || null,
              status: text(row.status, 60) || null,
              effectiveStatus: text(row.effective_status, 60) || null,
              createdTime: date(row.created_time),
              scheduledStart: date(row.start_time),
              thumbnailUrl,
              seenAt: new Date(),
            };
            objectRows.push({ id: oid, accountId: id, ...data });
          }
        }
        await writeSyncPage(tx, objectRows, dailyRows, !insight);
        if (insight && !result.after)
          await tx.metaAdDaily.deleteMany({
            where: {
              accountId: id,
              object: { level },
              scope: "7d_click,1d_view|impression",
              day: { ...(since ? { gte: since } : {}), lte: until },
              updatedAt: { lt: new Date(started) },
            },
          });
        if (!insight && !result.after)
          await tx.metaAdObject.updateMany({
            where: {
              accountId: id,
              level:
                current === "campaigns"
                  ? "campaign"
                  : current === "adsets"
                    ? "adset"
                    : "ad",
              seenAt: { lt: new Date(started) },
            },
            data: { status: null, effectiveStatus: "NOT_RETURNED" },
          });
        const nextPhase = result.after ? phase : phase + 1;
        const done = nextPhase >= phases.length;
        const pages = (state.pages ?? 0) + 1;
        demand(
          pages <= 20000,
          "Importación demasiado grande. Revisa el alcance antes de continuar.",
          409,
        );
        const earliest = insight
          ? result.data.map((row) => text(row.date_start, 10)).sort()[0]
          : undefined;
        await tx.metaAdAccount.updateMany({
          where: { id, syncToken: token },
          data: {
            syncToken: null,
            syncLeaseAt: null,
            syncError: null,
            syncState: done
              ? {
                  lastAttempt,
                  lastRun: {
                    pages,
                    processed: (state.processed ?? 0) + result.data.length,
                    finishedAt: new Date().toISOString(),
                  },
                }
              : {
                  lastAttempt,
                  ...(state.lastRun ? { lastRun: state.lastRun } : {}),
                  processed: (state.processed ?? 0) + result.data.length,
                  updatedAt: new Date().toISOString(),
                  started,
                  phase: nextPhase,
                  ...(result.after ? { after: result.after } : {}),
                  ...(since ? { since } : {}),
                  until,
                  mode: since ? "recent" : "history",
                  pages,
                },
            nextSyncAt: done
              ? new Date(Date.now() + a.intervalMinutes * 60000)
              : new Date(),
            ...(done ? { syncedAt: new Date() } : {}),
            ...(earliest && (!a.historyFrom || earliest < a.historyFrom)
              ? { historyFrom: earliest }
              : {}),
          },
        });
      },
      { timeout: 30000 },
    );
    return true;
  } catch (e) {
    const message =
      e instanceof AppError
        ? e.message
        : `Falló el guardado de la importación en ${syncPhase}${internalErrorCode(e) ? ` (${internalErrorCode(e)})` : ""}. Los datos anteriores se conservan.`;
    await db.metaAdAccount.updateMany({
      where: { id, syncToken: token, ...(revision ? { connection: { revision, disconnectedAt: null } } : {}) },
      data: {
        syncToken: null,
        syncLeaseAt: null,
        syncError: message,
        nextSyncAt: new Date(Date.now() + 30 * 60000),
      },
    });
    console.warn("meta_sync_failed", {
      accountId: id,
      revision,
      code: e instanceof AppError ? e.status : (internalErrorCode(e) ?? 503),
      phase: syncPhase,
    });
    return false;
  }
}
export async function runDueSync(limit = 3) {
  const accounts = await db.metaAdAccount.findMany({
    where: {
      enabled: true,
      nextSyncAt: { lte: new Date() },
      connection: { disconnectedAt: null },
    },
    select: { id: true },
    take: limit,
    orderBy: { nextSyncAt: "asc" },
  });
  for (const a of accounts) await syncStep(a.id);
  return accounts.length;
}
