import { randomUUID } from "node:crypto";
import type { Prisma, MetaAdAccount, MetaConnection } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { localDay, shiftDay } from "./analytics";
import {
  MetaReader,
  settledReads,
  type Operation,
  type Page,
} from "./provider";
import { writeSyncPage } from "./bulk-sync";

import { focusedLabels } from "./focused-labels";
export type FocusState = {
  plan: "focus";
  recentDays: number;
  phase: number;
  started: string;
  until: string;
  after?: string;
  objectAfter?: string;
  pages?: number;
  processed?: number;
  updatedAt?: string;
  recentReady?: boolean;
  lastReportUntil?: string;
  lastRun?: Prisma.InputJsonObject;
  lastAttempt?: { at: string; revision: number };
};
const scope = "7d_click,1d_view|impression";
const levels = ["campaign", "adset", "ad"];
const operations: Operation[] = ["campaigns", "adsets", "ads"];
function id(v: unknown) {
  const value = String(v ?? "").replace(/^act_/, "");
  demand(
    /^\d{1,40}$/.test(value),
    "Meta devolvió un identificador inválido.",
    502,
  );
  return value;
}
const text = (v: unknown, max = 250) =>
  typeof v === "string" ? v.slice(0, max) : "";
function value(v: unknown) {
  const n = Number(v ?? 0);
  demand(
    Number.isFinite(n) && n >= 0 && n <= 1e12,
    "Meta devolvió una métrica inválida.",
    502,
  );
  return n;
}
function facts(row: Record<string, unknown>) {
  const actions: Record<string, number> = {};
  if (Array.isArray(row.actions))
    for (const a of row.actions.slice(0, 150))
      if (
        a &&
        typeof a.action_type === "string" &&
        /^[a-zA-Z0-9_.]{1,150}$/.test(a.action_type)
      )
        actions[a.action_type] = value(a.value);
  return {
    spend: value(row.spend),
    impressions: value(row.impressions),
    clicks: value(row.clicks),
    actions,
  };
}
function parsedDate(v: unknown) {
  const s = text(v, 50);
  return s && Number.isFinite(Date.parse(s)) ? new Date(s) : null;
}
function metadata(
  row: Record<string, unknown>,
  accountId: string,
  level: string,
) {
  demand(
    id(row.account_id) === accountId,
    "Meta devolvió un objeto de otra cuenta.",
    502,
  );
  const oid = id(row.id);
  const raw = (row.creative as { thumbnail_url?: unknown } | undefined)
    ?.thumbnail_url;
  let thumbnailUrl: string | null = null;
  if (typeof raw === "string")
    try {
      const u = new URL(raw);
      if (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.searchParams.has("access_token") &&
        (u.hostname.endsWith(".fbcdn.net") ||
          u.hostname.endsWith(".facebook.com"))
      )
        thumbnailUrl = u.href;
    } catch {}
  return {
    id: oid,
    accountId,
    level,
    name: text(row.name) || oid,
    campaignId:
      level === "campaign" ? oid : row.campaign_id ? id(row.campaign_id) : null,
    adsetId: level === "adset" ? oid : row.adset_id ? id(row.adset_id) : null,
    objective: text(row.objective) || null,
    optimizationGoal: text(row.optimization_goal) || null,
    status: text(row.status, 60) || null,
    effectiveStatus: text(row.effective_status, 60) || null,
    createdTime: parsedDate(row.created_time),
    scheduledStart: parsedDate(row.start_time),
    thumbnailUrl,
    seenAt: new Date(),
  };
}
function day(v: unknown) {
  const s = text(v, 10);
  demand(
    /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)),
    "Meta devolvió fechas incompatibles.",
    502,
  );
  return s;
}

// Only fixed GET reads. Each transaction revalidates the same lease and credential.
export async function focusedSyncStep(
  a: MetaAdAccount,
  c: MetaConnection,
  r: MetaReader,
  token: string,
  state: FocusState,
) {
  const started = state.started,
    since = shiftDay(state.until, 1 - state.recentDays),
    phase = state.phase;
  demand(
    phase >= 0 &&
      phase < focusedLabels.length &&
      [7, 15, 30, 90].includes(state.recentDays),
    "Estado de importación inválido.",
    409,
  );
  const lastAttempt = { at: new Date().toISOString(), revision: c.revision };
  const attempt = await db.metaAdAccount.updateMany({
    where: {
      id: a.id,
      syncToken: token,
      connectionId: c.id,
      connection: { revision: c.revision, disconnectedAt: null },
    },
    data: { syncState: { ...state, lastAttempt } },
  });
  demand(attempt.count, "La conexión cambió antes de consultar Meta.", 409);
  let result: Page = { data: [] },
    objectRows: Record<string, unknown>[] = [],
    dailyRows: Record<string, unknown>[] = [],
    totalRows: Record<string, unknown>[] = [],
    selected: string[] = [];
  let nextAfter: string | undefined,
    objectAfter: string | undefined,
    pages = 0;
  const level = levels[phase % 3];
  if (phase < 3) {
    result = await r.get("insights", {
      accountId: a.id,
      level,
      since,
      until: state.until,
      aggregate: true,
      after: state.after,
    });
    pages++;
    for (const row of result.data) {
      demand(
        id(row.account_id) === a.id,
        "Meta devolvió estadísticas de otra cuenta.",
        502,
      );
      demand(
        day(row.date_start) >= since && day(row.date_stop) <= state.until,
        "Meta devolvió actividad fuera del periodo.",
        502,
      );
      // Zero rows are not proof of delivery. Active objects are discovered separately.
      if (value(row.spend) === 0 && value(row.impressions) === 0) continue;
      const oid = id(row[level + "_id"]);
      selected.push(oid);
      objectRows.push({
        id: oid,
        accountId: a.id,
        level,
        name: text(row[level + "_name"]) || oid,
        campaignId:
          level === "campaign"
            ? oid
            : row.campaign_id
              ? id(row.campaign_id)
              : null,
        adsetId:
          level === "adset" ? oid : row.adset_id ? id(row.adset_id) : null,
      });
    }
    nextAfter = result.after;
  } else if (phase < 6) {
    result = await r.get(operations[phase - 3], {
      accountId: a.id,
      activeOnly: true,
      after: state.after,
    });
    pages++;
    for (const row of result.data) {
      // Validate ownership even for rows omitted from the active inventory.
      // Meta can return a non-active row (including a concurrent status change).
      const object = metadata(row, a.id, level);
      demand(
        typeof row.effective_status === "string" &&
          row.effective_status.length > 0,
        "Meta no informó el estado efectivo del elemento.",
        502,
      );
      if (row.effective_status !== "ACTIVE") continue;
      objectRows.push(object);
      selected.push(id(row.id));
    }
    nextAfter = result.after;
  } else {
    const candidates = await db.metaAdObject.findMany({
      where: {
        accountId: a.id,
        selectedAt: { gte: new Date(started) },
        ...(phase < 9
          ? {
              level,
              ...{
                OR: [{ seenAt: { lt: new Date(started) } }, { status: null }],
              },
            }
          : {}),
        ...(state.objectAfter ? { id: { gt: state.objectAfter } } : {}),
      },
      orderBy: { id: "asc" },
      take: 6,
    });
    const batch = candidates.slice(0, 5);
    if (phase < 9) {
      const reads = await settledReads(
        batch.map((o) =>
          r.get(operations[phase - 6], { accountId: a.id, objectId: o.id }),
        ),
      );
      pages += reads.length;
      reads.forEach((page) =>
        page.data.forEach((row) => objectRows.push(metadata(row, a.id, level))),
      );
    } else if (phase === 9) {
      const from = shiftDay(state.until, -29);
      const reads = await settledReads(
        batch.map((o) =>
          r.get("insights", {
            accountId: a.id,
            objectId: o.id,
            level: o.level,
            since: from,
            until: state.until,
          }),
        ),
      );
      pages += reads.length;
      reads.forEach((page, i) => {
        demand(
          !page.after,
          "Meta paginó un informe diario acotado inesperadamente. El progreso se conserva.",
          502,
        );
        const object = batch[i],
          dates = new Set<string>();
        for (const row of page.data) {
          const d = day(row.date_start);
          demand(
            id(row.account_id) === a.id &&
              id(row[object.level + "_id"]) === object.id &&
              d === row.date_stop &&
              d >= from &&
              d <= state.until &&
              !dates.has(d),
            "Meta devolvió datos diarios incompatibles con el objeto o periodo.",
            502,
          );
          dates.add(d);
          dailyRows.push({
            id: randomUUID(),
            accountId: a.id,
            objectId: object.id,
            day: d,
            scope,
            ...facts(row),
          });
        }
      });
    } else {
      const stored = await db.metaAdTotal.findMany({
        where: {
          objectId: { in: batch.map((o) => o.id) },
          accountId: a.id,
          scope,
          until: state.until,
          updatedAt: { gte: new Date(Date.now() - 6 * 3600000) },
        },
      });
      const missing = batch.filter(
        (o) => !stored.some((t) => t.objectId === o.id),
      );
      const reads = await settledReads(
        missing.map((o) =>
          r.get("insights", {
            accountId: a.id,
            objectId: o.id,
            level: o.level,
            aggregate: true,
          }),
        ),
      );
      pages += reads.length;
      reads.forEach((page, i) => {
        const object = missing[i];
        demand(
          !page.after && page.data.length <= 1,
          "Meta no devolvió un acumulado único del objeto.",
          502,
        );
        const row = page.data[0];
        if (row)
          demand(
            id(row.account_id) === a.id &&
              id(row[object.level + "_id"]) === object.id &&
              day(row.date_stop) <= state.until &&
              day(row.date_start) <= day(row.date_stop),
            "Meta devolvió un acumulado de otro objeto o fechas inválidas.",
            502,
          );
        totalRows.push({
          objectId: object.id,
          accountId: a.id,
          since: row
            ? day(row.date_start)
            : object.createdTime
              ? localDay(a.timezone, object.createdTime)
              : state.until,
          until: row ? day(row.date_stop) : state.until,
          scope,
          ...facts(row ?? {}),
        });
      });
    }
    if (candidates.length > 5) objectAfter = batch.at(-1)!.id;
    // Reconciliation is limited to exactly the queried objects, even when Meta returns no rows.
    selected = phase === 9 ? batch.map((o) => o.id) : [];
  }
  demand(
    !nextAfter || nextAfter !== state.after,
    "Meta repitió el cursor de resultados.",
    502,
  );
  const nextPhase = nextAfter || objectAfter ? phase : phase + 1,
    done = nextPhase === focusedLabels.length;
  const recentReady = state.recentReady || nextPhase >= 10;
  const count = (state.pages ?? 0) + pages;
  demand(
    count <= 20000,
    "La importación supera el límite de páginas. Reduce el periodo de selección.",
    409,
  );
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
      demand(
        await tx.user.findFirst({
          where: { id: c.ownerId, role: "OWNER", status: "APPROVED" },
        }),
        "El propietario ya no está autorizado.",
        403,
      );
      demand(
        await tx.metaAdAccount.findFirst({
          where: {
            id: a.id,
            enabled: true,
            syncToken: token,
            connectionId: c.id,
            connection: { revision: c.revision, disconnectedAt: null },
          },
        }),
        "La cuenta o conexión cambió durante la importación.",
        409,
      );
      const existing = objectRows.length
        ? await tx.metaAdObject.findMany({
            where: { id: { in: objectRows.map((o) => String(o.id)) } },
            select: { accountId: true, level: true, id: true },
          })
        : [];
      demand(
        existing.every(
          (o) =>
            o.accountId === a.id &&
            objectRows.every((row) => row.id !== o.id || row.level === o.level),
        ),
        "Meta devolvió un objeto ajeno o de otro nivel.",
        502,
      );
      await writeSyncPage(tx, objectRows, dailyRows, phase >= 3);
      if (phase < 6 && selected.length)
        await tx.metaAdObject.updateMany({
          where: { accountId: a.id, id: { in: selected } },
          data: { selectedAt: new Date(started) },
        });
      if (phase === 9 && selected.length)
        await tx.metaAdDaily.deleteMany({
          where: {
            accountId: a.id,
            objectId: { in: selected },
            scope,
            day: { gte: shiftDay(state.until, -29), lte: state.until },
            updatedAt: { lt: new Date(started) },
          },
        });
      if (totalRows.length)
        await tx.$executeRaw`
      INSERT INTO "MetaAdTotal"("objectId","accountId",since,until,scope,spend,impressions,clicks,actions,"updatedAt")
      SELECT "objectId","accountId",since,until,scope,spend,impressions,clicks,actions,NOW()
      FROM jsonb_to_recordset(${JSON.stringify(totalRows)}::jsonb) AS t("objectId" text,"accountId" text,since text,until text,scope text,spend numeric,impressions float8,clicks float8,actions jsonb)
      ON CONFLICT("objectId") DO UPDATE SET since=EXCLUDED.since,until=EXCLUDED.until,scope=EXCLUDED.scope,spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,actions=EXCLUDED.actions,"updatedAt"=NOW()
      WHERE "MetaAdTotal"."accountId"=EXCLUDED."accountId"`;
      const common = {
        plan: "focus",
        recentDays: state.recentDays,
        since,
        until: state.until,
        started,
        pages: count,
        processed:
          (state.processed ?? 0) +
          (phase < 6
            ? result.data.length
            : objectRows.length + dailyRows.length + totalRows.length),
        lastAttempt,
        recentReady,
        ...(recentReady
          ? { lastReportUntil: state.until }
          : state.lastReportUntil
            ? { lastReportUntil: state.lastReportUntil }
            : {}),
        updatedAt: new Date().toISOString(),
      };
      await tx.metaAdAccount.updateMany({
        where: { id: a.id, syncToken: token },
        data: {
          syncToken: null,
          syncLeaseAt: null,
          syncError: null,
          syncState: done
            ? {
                lastAttempt,
                lastRun: { ...common, finishedAt: new Date().toISOString() },
              }
            : {
                ...common,
                phase: nextPhase,
                ...(nextAfter ? { after: nextAfter } : {}),
                ...(objectAfter ? { objectAfter } : {}),
                ...(state.lastRun ? { lastRun: state.lastRun } : {}),
              },
          ...(nextPhase >= 6 ? { selectionSince: new Date(started) } : {}),
          ...((nextPhase === 10 && phase === 9) || done
            ? { syncedAt: new Date() }
            : {}),
          nextSyncAt: done
            ? new Date(Date.now() + a.intervalMinutes * 60000)
            : new Date(),
        },
      });
    },
    { timeout: 30000 },
  );
  return true;
}
