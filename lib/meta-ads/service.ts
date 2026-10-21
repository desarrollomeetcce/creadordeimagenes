import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly, rateLimit } from "../auth";
import { encryptKey, decryptKey, maskKey } from "../crypto";
import { demand, AppError } from "../errors";
import { recordActivity } from "../activity";
import { MetaReader, type Operation, type Query } from "./provider";
import { localDay, shiftDay, metricFor } from "./analytics";
export type Actor = { id: string; role: string };
export const connectionSelect = {
  id: true,
  name: true,
  transport: true,
  apiVersion: true,
  appId: true,
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
  return {
    connection: c,
    reader: new MetaReader(
      decryptKey(c.encryptedToken, `meta:${c.id}`),
      c.transport,
      c.apiVersion,
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
export async function discover(actor: Actor, id: string) {
  ownerOnly(actor);
  await rateLimit("meta:discover:" + actor.id, 15);
  const { connection: c, reader: r } = await reader(id, true);
  try {
    const tools = c.transport === "MCP" ? await r.tools() : [];
    let after: string | undefined;
    let count = 0;
    const visited = new Set<string>();
    do {
      const result = await r.get("accounts", { after });
      await db.$transaction(async (tx) => {
        demand(
          await tx.user.findFirst({
            where: { id: c.ownerId, role: "OWNER", status: "APPROVED" },
          }),
          "El propietario de la conexión ya no está autorizado.",
          403,
        );
        const active = await tx.metaConnection.findFirst({
          where: { id, revision: c.revision, disconnectedAt: null },
        });
        demand(active, "La conexión cambió. Vuelve a verificarla.", 409);
        for (const row of result.data) {
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
            throw new AppError(
              "Meta no devolvió una zona horaria válida.",
              502,
            );
          }
          const business = row.business as
            { id?: unknown; name?: unknown } | undefined;
          const data = {
            name: text(row.name) || aid,
            currency,
            timezone,
            businessId: business?.id ? digits(business.id) : null,
            businessName: text(business?.name) || null,
            accountStatus:
              typeof row.account_status === "number"
                ? row.account_status
                : null,
          };
          const previous = await tx.metaAdAccount.findUnique({
            where: { id: aid },
          });
          if (!previous)
            await tx.metaAdAccount.create({
              data: { id: aid, connectionId: id, ...data },
            });
          else if (previous.connectionId === id)
            await tx.metaAdAccount.update({ where: { id: aid }, data });
          await tx.metaAccountSource.upsert({
            where: {
              accountId_connectionId: { accountId: aid, connectionId: id },
            },
            create: { accountId: aid, connectionId: id, revision: c.revision },
            update: { revision: c.revision, verifiedAt: new Date() },
          });
          count++;
        }
      });
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
    await db.metaConnection.updateMany({
      where: { id, revision: c.revision, disconnectedAt: null },
      data: {
        verifiedAt: new Date(),
        lastError: null,
        tools: tools as unknown as Prisma.InputJsonValue,
      },
    });
    await recordActivity(db, {
      data: {
        actorId: actor.id,
        action: "META_CONEXION_VERIFICADA",
        resourceId: id,
        detail: { transport: c.transport, accounts: count },
      },
    });
    return { accounts: count, tools: tools.map((t) => t.name) };
  } catch (e) {
    const message =
      e instanceof AppError
        ? e.message
        : "No se pudo verificar la conexión con Meta.";
    await db.metaConnection.updateMany({
      where: { id, revision: c.revision },
      data: { lastError: message },
    });
    throw new AppError(message, e instanceof AppError ? e.status : 503);
  }
}
export async function saveToken(
  id: string,
  token: string,
  expectedRevision?: number,
) {
  await db.$transaction(async (tx) => {
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
      },
    });
    demand(changed.count, "La conexión cambió. Vuelve a intentarlo.", 409);
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
  started?: string;
};
export async function queueSync(actor: Actor, id: string, full = false) {
  const a = await access(actor, id, true);
  demand(
    a.enabled && a.connection.verifiedAt,
    "Habilita la cuenta y verifica su conexión antes de sincronizar.",
    409,
  );
  await rateLimit("meta:sync:" + actor.id, 30);
  await db.metaAdAccount.updateMany({
    where: {
      id,
      OR: [
        { syncToken: null },
        { syncLeaseAt: { lt: new Date(Date.now() - 120000) } },
      ],
    },
    data: {
      nextSyncAt: new Date(),
      syncError: null,
      ...(full ? { syncState: {}, syncedAt: null } : {}),
    },
  });
  return { queued: true };
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
  let revision = 0;
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
            const obj = await tx.metaAdObject.findUnique({
              where: { id: oid },
            });
            demand(
              !obj || obj.accountId === id,
              "Meta devolvió un objeto de otra cuenta.",
              502,
            );
            if (!obj)
              await tx.metaAdObject.create({
                data: {
                  id: oid,
                  accountId: id,
                  level,
                  name: text(row[level + "_name"]) || oid,
                  campaignId: row.campaign_id ? digits(row.campaign_id) : null,
                  adsetId: row.adset_id ? digits(row.adset_id) : null,
                },
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
            await tx.metaAdDaily.upsert({
              where: {
                objectId_day_scope: {
                  objectId: oid,
                  day,
                  scope: "7d_click,1d_view|impression",
                },
              },
              create: {
                accountId: id,
                objectId: oid,
                day,
                scope: "7d_click,1d_view|impression",
                ...data,
              },
              update: data,
            });
          } else {
            const oid = digits(row.id),
              kind =
                current === "campaigns"
                  ? "campaign"
                  : current === "adsets"
                    ? "adset"
                    : "ad";
            const existing = await tx.metaAdObject.findUnique({
              where: { id: oid },
            });
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
            await tx.metaAdObject.upsert({
              where: { id: oid },
              create: { id: oid, accountId: id, ...data },
              update: data,
            });
          }
        }
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
              ? {}
              : {
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
        : "No se completó la sincronización. Los datos anteriores se conservan.";
    await db.metaAdAccount.updateMany({
      where: { id, syncToken: token },
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
      code: e instanceof AppError ? e.status : 503,
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
