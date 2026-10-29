import { metaCanSync } from "../workspace-access";
import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../../db";
import { AppError, demand } from "../../errors";
import { access, reader, type Actor } from "../service";
import { metadata, facts, day } from "../focused-sync";
import { writeSyncPage } from "../bulk-sync";
import { localDay, shiftDay } from "../analytics";
import { deriveCoveredTotals } from "./derive-total";
import { MetaQuotaWait } from "../quota";
const scope = "7d_click,1d_view|impression";
export type SourceState = {
  runId: string;
  started: string;
  since: string;
  until: string;
  phase: number;
  offset?: number;
  after?: string;
  pages: number;
  records: number;
  adIds: string[];
  setIds: string[];
  cursors: string[];
  dailyAt?: string;
  completedAt?: string;
  error?: string;
  retryAt?: string;
};
const labels = [
  "Comprobando campaña",
  "Leyendo conjuntos activos y desactivados",
  "Leyendo anuncios y creatividades",
  "Leyendo estadísticas diarias reales",
  "Leyendo acumulados disponibles en Meta",
  "Datos recibidos y listos para analizar",
];
function stateOf(value: unknown) {
  const s = value as SourceState;
  demand(
    s &&
      typeof s.runId === "string" &&
      Number.isInteger(s.phase) &&
      s.phase >= 0 &&
      s.phase <= 5 &&
      Array.isArray(s.adIds) &&
      Array.isArray(s.setIds) &&
      Array.isArray(s.cursors),
    "El avance guardado no es compatible. Inicia otra lectura.",
    409,
  );
  return s;
}
export function sourceView(s: SourceState) {
  return {
    phase: s.phase,
    label: labels[s.phase],
    pages: s.pages,
    records: s.records,
    ads: s.adIds.length,
    adsets: s.setIds.length,
    since: s.since,
    until: s.until,
    dailyAt: s.dailyAt ?? null,
    completedAt: s.completedAt ?? null,
    error: s.error ?? null,
    retryAt: s.retryAt ?? null,
    done: s.phase === 5,
  };
}
async function campaignAccess(actor: Actor, id: string, sync = false) {
  const o = await db.metaAdObject.findUnique({ where: { id } });
  demand(o?.level === "campaign", "Campaña no disponible.", 404);
  return { object: o, account: await access(actor, o.accountId, sync) };
}
export async function sourceStatus(actor: Actor, id: string) {
  const { account } = await campaignAccess(actor, id);
  const row = await db.metaRecommendationSource.findUnique({
    where: { campaignId: id },
  });
  return row &&
    row.accountId === account.id &&
    row.connectionId === account.connectionId &&
    row.revision === account.connection.revision
    ? sourceView(stateOf(row.state))
    : null;
}
// One explicit POST reads one bounded Graph page. GET never calls Meta. A shared account
// lease and the existing quota budget serialize imports; every page revalidates permissions.
export async function refreshSource(
  actor: Actor,
  id: string,
  action: "start" | "continue" | "restart",
) {
  const { account: a } = await campaignAccess(actor, id, true);
  demand(
    a.connection.transport === "API",
    "Se requiere una conexión de Marketing API.",
    409,
  );
  const token = randomUUID(),
    now = new Date();
  const claimed = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    const user = await tx.user.findFirst({
      where: { id: actor.id, status: "APPROVED" },
      select: { role: true },
    });
    demand(
      user &&
        (await metaCanSync(
          actor,
          await tx.metaAccountGrant.findMany({
            where: { accountId: a.id, userId: actor.id },
          }),
          tx,
        )),
      "Ya no tienes permiso para actualizar esta cuenta.",
      403,
    );
    const account = await tx.metaAdAccount.findFirst({
      where: {
        id: a.id,
        connectionId: a.connectionId,
        connection: {
          revision: a.connection.revision,
          disconnectedAt: null,
          verifiedAt: { not: null },
        },
      },
    });
    demand(account, "La conexión cambió. Verifica antes de actualizar.", 409);
    const row = await tx.metaRecommendationSource.findUnique({
      where: { campaignId: id },
    });
    const old =
      row &&
      row.connectionId === a.connectionId &&
      row.revision === a.connection.revision
        ? stateOf(row.state)
        : null;
    if (action === "continue" && old?.phase === 5) return { done: old };
    if (old?.retryAt && Date.parse(old.retryAt) > now.valueOf())
      return { waiting: old };
    const claim = await tx.metaAdAccount.updateMany({
      where: {
        id: a.id,
        OR: [
          { syncToken: null },
          { syncLeaseAt: { lt: new Date(now.valueOf() - 120000) } },
        ],
      },
      data: { syncToken: token, syncLeaseAt: now },
    });
    if (!claim.count) return { busy: true };
    const s: SourceState =
      action === "restart" ||
      (action === "start" &&
        (!old || old.phase === 5 || old.until !== localDay(a.timezone)))
        ? {
            runId: randomUUID(),
            started: now.toISOString(),
            since: shiftDay(localDay(a.timezone), -29),
            until: localDay(a.timezone),
            phase: 0,
            pages: 0,
            records: 0,
            adIds: [],
            setIds: [],
            cursors: [],
          }
        : old!;
    demand(s, "Inicia primero la lectura de datos de esta campaña.", 409);
    await tx.metaRecommendationSource.upsert({
      where: { campaignId: id },
      create: {
        campaignId: id,
        accountId: a.id,
        connectionId: a.connectionId,
        revision: a.connection.revision,
        state: JSON.parse(JSON.stringify(s)),
      },
      update: {
        connectionId: a.connectionId,
        revision: a.connection.revision,
        state: JSON.parse(JSON.stringify(s)),
      },
    });
    return { state: s };
  });
  if ("done" in claimed) return sourceView(claimed.done!);
  if ("waiting" in claimed)
    return { ...sourceView(claimed.waiting!), waiting: true };
  if ("busy" in claimed)
    return {
      waiting: true,
      done: false,
      label: "La cuenta está guardando otra página. Se conservará el avance.",
      retryAt: new Date(Date.now() + 1500).toISOString(),
    };
  const s = claimed.state!,
    phase = s.phase;
  try {
    const { connection: c, reader: r } = await reader(
      a.connectionId,
      false,
      true,
    );
    demand(
      c.revision === a.connection.revision,
      "La credencial cambió antes de leer Meta.",
      409,
    );
    const page =
      phase === 0
        ? await r.get("campaigns", { accountId: a.id, objectId: id })
        : phase < 3
          ? await r.get(phase === 1 ? "adsets" : "ads", {
              accountId: a.id,
              campaignId: id,
              inventoryAll: true,
              after: s.after,
            })
          : await r.get("insights", {
              accountId: a.id,
              insightIds: s.adIds.slice(s.offset ?? 0, (s.offset ?? 0) + 50),
              level: "ad",
              after: s.after,
              ...(phase === 3
                ? { since: s.since, until: s.until }
                : { aggregate: true }),
            });
    demand(
      !page.after || page.after !== s.after,
      "Meta repitió el cursor de la página.",
      502,
    );
    const cursorHash = page.after
      ? createHash("sha256")
          .update(`${phase}:${s.offset ?? 0}:${page.after}`)
          .digest("hex")
      : null;
    demand(
      !cursorHash || !s.cursors.includes(cursorHash),
      "Meta repitió una página anterior; el avance queda guardado.",
      502,
    );
    demand(
      s.pages < 4000,
      "La campaña supera el límite de páginas de esta lectura.",
      422,
    );
    const objects: Record<string, unknown>[] = [],
      daily: Record<string, unknown>[] = [],
      totals: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    const ids = new Set(s.adIds),
      sets = new Set(s.setIds);
    for (const row of page.data) {
      if (phase < 3) {
        const level = ["campaign", "adset", "ad"][phase];
        const object = metadata(row, a.id, level);
        demand(
          phase === 0 ? object.id === id : object.campaignId === id,
          "Meta devolvió un objeto ajeno a la campaña.",
          502,
        );
        demand(
          !seen.has(object.id),
          "Meta repitió un objeto en la misma página.",
          502,
        );
        seen.add(object.id);
        if (
          ["DELETED", "ARCHIVED"].includes(object.status ?? "") ||
          ["DELETED", "ARCHIVED"].includes(object.effectiveStatus ?? "")
        )
          continue;
        if (phase === 1) {
          demand(
            !sets.has(object.id),
            "Meta repitió un conjunto entre páginas.",
            502,
          );
          sets.add(object.id);
        }
        if (phase === 2) {
          demand(
            !!object.adsetId && sets.has(object.adsetId),
            "El anuncio no pertenece a un conjunto confirmado de esta campaña.",
            502,
          );
          demand(
            !ids.has(object.id),
            "Meta repitió un anuncio entre páginas.",
            502,
          );
          ids.add(object.id);
        }
        objects.push(object);
      } else {
        const oid = String(row.ad_id ?? "");
        demand(
          String(row.account_id).replace(/^act_/, "") === a.id &&
            String(row.campaign_id) === id &&
            ids.has(oid) &&
            sets.has(String(row.adset_id)),
          "Meta devolvió estadísticas fuera de la campaña y anuncios confirmados.",
          502,
        );
        const from = day(row.date_start),
          until = day(row.date_stop),
          key = phase === 3 ? `${oid}:${from}` : oid;
        demand(
          !seen.has(key),
          "Meta repitió estadísticas en la misma página.",
          502,
        );
        seen.add(key);
        const values = facts(row);
        if (phase === 3) {
          demand(
            from === until && from >= s.since && until <= s.until,
            "Meta devolvió estadísticas fuera del día y rango solicitados.",
            502,
          );
          daily.push({
            id: randomUUID(),
            accountId: a.id,
            objectId: oid,
            day: from,
            scope,
            ...values,
          });
        } else {
          demand(
            from <= until && until <= s.until,
            "Meta devolvió un acumulado de fechas incompatibles.",
            502,
          );
          totals.push({
            objectId: oid,
            accountId: a.id,
            since: from,
            until,
            scope,
            ...values,
          });
        }
      }
    }
    demand(
      ids.size <= 5000 && sets.size <= 5000,
      "La campaña supera 5000 anuncios o conjuntos; no se emitirá un análisis parcial.",
      422,
    );
    const moreIds =
      phase >= 3 && !page.after && (s.offset ?? 0) + 50 < s.adIds.length;
    const nextPhase = page.after || moreIds ? phase : phase + 1;
    const next: SourceState = {
      ...s,
      phase: phase === 2 && !page.after && ids.size === 0 ? 5 : nextPhase,
      offset: page.after ? (s.offset ?? 0) : moreIds ? (s.offset ?? 0) + 50 : 0,
      pages: s.pages + 1,
      records: s.records + page.data.length,
      adIds: [...ids],
      setIds: [...sets],
      cursors: cursorHash ? [...s.cursors, cursorHash] : s.cursors,
      ...(page.after ? { after: page.after } : {}),
      ...(phase === 3 && !page.after && !moreIds
        ? { dailyAt: new Date().toISOString() }
        : {}),
      ...(phase === 4 && !page.after && !moreIds
        ? { completedAt: new Date().toISOString() }
        : {}),
    };
    if (phase === 2 && !page.after && ids.size === 0) {
      next.dailyAt = new Date().toISOString();
      next.completedAt = next.dailyAt;
    }
    if (!page.after) delete next.after;
    delete next.error;
    delete next.retryAt;
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        const user = await tx.user.findFirst({
          where: { id: actor.id, status: "APPROVED" },
          select: { role: true },
        });
        demand(
          user &&
            (await metaCanSync(
              actor,
              await tx.metaAccountGrant.findMany({
                where: { accountId: a.id, userId: actor.id },
              }),
              tx,
            )),
          "El permiso cambió durante la lectura.",
          403,
        );
        demand(
          await tx.user.findFirst({
            where: { id: c.ownerId, role: "OWNER", status: "APPROVED" },
          }),
          "El propietario de la conexión ya no está autorizado.",
          403,
        );
        demand(
          await tx.metaAdAccount.findFirst({
            where: {
              id: a.id,
              connectionId: c.id,
              syncToken: token,
              connection: {
                revision: c.revision,
                disconnectedAt: null,
                verifiedAt: { not: null },
              },
            },
          }),
          "La conexión o el ejecutor cambió; se descartó la respuesta anterior.",
          409,
        );
        const current = await tx.metaRecommendationSource.findUnique({
          where: { campaignId: id },
        });
        demand(
          current && stateOf(current.state).runId === s.runId,
          "Esta lectura fue sustituida.",
          409,
        );
        if (objects.length) {
          const existing = await tx.metaAdObject.findMany({
            where: { id: { in: objects.map((o) => String(o.id)) } },
            select: {
              id: true,
              accountId: true,
              level: true,
              campaignId: true,
            },
          });
          demand(
            existing.every(
              (o) =>
                o.accountId === a.id &&
                objects.some((r) => r.id === o.id && r.level === o.level) &&
                (o.level === "campaign" || o.campaignId === id),
            ),
            "No se puede sustituir un objeto de otra cuenta o campaña.",
            502,
          );
        }
        await writeSyncPage(tx, objects, daily, true);
        if (totals.length)
          await tx.$executeRaw`INSERT INTO "MetaAdTotal"("objectId","accountId",since,until,scope,spend,impressions,clicks,actions,"updatedAt") SELECT "objectId","accountId",since,until,scope,spend,impressions,clicks,actions,NOW() FROM jsonb_to_recordset(${JSON.stringify(totals)}::jsonb) AS t("objectId" text,"accountId" text,since text,until text,scope text,spend numeric,impressions float8,clicks float8,actions jsonb) ON CONFLICT("objectId") DO UPDATE SET since=EXCLUDED.since,until=EXCLUDED.until,scope=EXCLUDED.scope,spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,actions=EXCLUDED.actions,"updatedAt"=NOW() WHERE "MetaAdTotal"."accountId"=EXCLUDED."accountId"`;
        if (phase === 3 && !page.after && !moreIds)
          await tx.metaAdDaily.deleteMany({
            where: {
              accountId: a.id,
              objectId: { in: next.adIds },
              scope,
              day: { gte: s.since, lte: s.until },
              updatedAt: { lt: new Date(s.started) },
            },
          });
        if (phase === 4 && !page.after && !moreIds)
          await deriveCoveredTotals(tx, a, next);
        await tx.metaRecommendationSource.update({
          where: { campaignId: id },
          data: { state: JSON.parse(JSON.stringify(next)) },
        });
        await tx.metaAdAccount.updateMany({
          where: { id: a.id, syncToken: token },
          data: { syncToken: null, syncLeaseAt: null },
        });
      },
      { timeout: 20000 },
    );
    return sourceView(next);
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "No se pudo guardar esta página de datos. El avance anterior se conserva.";
    const retryAt =
      error instanceof MetaQuotaWait ? error.retryAt.toISOString() : undefined;
    await db
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        const account = await tx.metaAdAccount.findFirst({
          where: {
            id: a.id,
            syncToken: token,
            connectionId: a.connectionId,
            connection: { revision: a.connection.revision },
          },
        });
        const current = await tx.metaRecommendationSource.findUnique({
          where: { campaignId: id },
        });
        if (account && current && stateOf(current.state).runId === s.runId) {
          await tx.metaRecommendationSource.update({
            where: { campaignId: id },
            data: {
              state: JSON.parse(
                JSON.stringify({
                  ...s,
                  error: message,
                  ...(retryAt ? { retryAt } : {}),
                }),
              ),
            },
          });
        }
        await tx.metaAdAccount.updateMany({
          where: { id: a.id, syncToken: token },
          data: { syncToken: null, syncLeaseAt: null },
        });
      })
      .catch(() => {});
    if (error instanceof AppError) throw error;
    throw new AppError(message, 500);
  }
}
