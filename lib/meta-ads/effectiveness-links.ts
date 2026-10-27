import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { accountWhere, type Actor } from "./service";
import {
  effectiveness,
  effectivenessLock,
  type EffectivenessCell,
} from "./effectiveness";
import {
  checkColumnLinkPath,
  linkCoversDay,
  linkMetrics,
} from "./column-link-policy";
import { sheetMetrics, type SheetMetric } from "./period-summary";
type Tx = Prisma.TransactionClient;
export type LinkInput = {
  tableId: string;
  sourceTableId: string;
  columns: SheetMetric[];
  scope: "all" | "period";
  since: string;
  until: string;
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pair = (name: string, country: string) => JSON.stringify([name, country]);
async function linkPlan(actor: Actor, b: LinkInput, tx: Tx) {
  const links = await tx.metaEffectivenessLink.findMany();
  demand(
    !links.some((l) => l.tableId === b.tableId),
    "Esta hoja ya tiene columnas vinculadas. Desvincúlalas antes de cambiar el origen o las columnas.",
    409,
  );
  checkColumnLinkPath(b.tableId, b.sourceTableId, links);
  const [source, target] = await Promise.all([
    effectiveness(actor, b.sourceTableId, b.since, b.until, tx),
    effectiveness(actor, b.tableId, b.since, b.until, tx),
  ]);
  const names = new Map(source.table.aliases.map((a) => [a.id, a.name]));
  const sourceRows = new Set(
    source.rows
      .filter((r) => r.country)
      .map((r) => pair(names.get(r.aliasId)!, r.country)),
  );
  const targetNames = new Map(target.table.aliases.map((a) => [a.id, a.name]));
  const matched = target.rows.filter(
    (r) =>
      r.country && sourceRows.has(pair(targetNames.get(r.aliasId)!, r.country)),
  ).length;
  demand(
    matched > 0,
    "No hay filas con el mismo nombre exacto de inventario y país en ambas hojas. Añádelas antes de vincular.",
    409,
  );
  const normalized = {
    tableId: b.tableId,
    sourceTableId: b.sourceTableId,
    scope: b.scope,
    since: b.since,
    until: b.until,
    columns: [...b.columns].sort(),
  };
  return {
    token: hash([normalized, links, source, target]),
    sourceName: source.table.name,
    targetName: target.table.name,
    summary: {
      matched,
      unmatched: target.rows.length - matched,
      columns: b.columns.length,
    },
    normalized,
  };
}
export async function effectivenessLinkConfig(actor: Actor, tableId: string) {
  ownerOnly(actor);
  demand(
    await db.metaAliasTable.findUnique({ where: { id: tableId } }),
    "Hoja no disponible.",
    404,
  );
  return db.metaEffectivenessLink.findUnique({
    where: { tableId },
    include: { source: { select: { name: true } } },
  });
}
export async function previewEffectivenessLink(actor: Actor, b: LinkInput) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const p = await linkPlan(actor, b, tx);
      return {
        token: p.token,
        sourceName: p.sourceName,
        targetName: p.targetName,
        summary: p.summary,
      };
    },
    { timeout: 60000 },
  );
}
export async function createEffectivenessLink(
  actor: Actor,
  b: LinkInput & { token: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const p = await linkPlan(actor, b, tx);
      demand(
        b.token === p.token,
        "Los datos o las vinculaciones cambiaron. Revisa de nuevo antes de vincular.",
        409,
      );
      const config = await tx.metaEffectivenessLink.create({
        data: {
          tableId: b.tableId,
          sourceTableId: b.sourceTableId,
          columns: p.normalized.columns,
          since: b.scope === "period" ? b.since : null,
          until: b.scope === "period" ? b.until : null,
        },
        include: { source: { select: { name: true } } },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_COLUMNAS_VINCULADAS",
          resourceId: b.tableId,
          detail: {
            sourceTableId: b.sourceTableId,
            columns: b.columns,
            scope: b.scope,
            since: config.since,
            until: config.until,
          },
        },
      });
      return config;
    },
    { timeout: 60000 },
  );
}
const hasFact = (c: EffectivenessCell | undefined, m: SheetMetric) =>
  !!c &&
  (c[m] !== null ||
    (c.na.includes(m) && !c.automaticNa.includes(m)) ||
    (c.manual.includes(m) && !c.linked[m]) ||
    c.fxPending.includes(m));
async function unlinkPlan(actor: Actor, tableId: string, tx: Tx) {
  const link = await tx.metaEffectivenessLink.findUnique({
    where: { tableId },
    include: {
      source: { select: { name: true } },
      target: { select: { name: true } },
    },
  });
  demand(link, "Esta hoja ya no tiene columnas vinculadas.", 409);
  const links = await tx.metaEffectivenessLink.findMany();
  const ancestry = [tableId];
  let at = link.sourceTableId;
  while (!ancestry.includes(at)) {
    ancestry.push(at);
    const next = links.find((l) => l.tableId === at);
    if (!next) break;
    at = next.sourceTableId;
    demand(ancestry.length <= 9, "Revisa la cadena de vinculaciones.", 409);
  }
  const dayRange = {
    ...(link.since ? { gte: link.since } : {}),
    ...(link.until ? { lte: link.until } : {}),
  };
  const [manualDates, metaDates] = await Promise.all([
    tx.metaEffectivenessDay.findMany({
      where: { row: { alias: { tableId: { in: ancestry } } }, day: dayRange },
      select: { day: true },
      distinct: ["day"],
    }),
    tx.metaAdDaily.findMany({
      where: {
        object: {
          level: "campaign",
          alias: { tableId: { in: ancestry } },
          account: accountWhere(actor),
        },
        day: dayRange,
        scope: "7d_click,1d_view|impression",
      },
      select: { day: true },
      distinct: ["day"],
    }),
  ]);
  const dates = [
    ...new Set([...manualDates, ...metaDates].map((d) => d.day)),
  ].sort();
  demand(
    dates.length <= 10000,
    "Hay más de 10000 fechas para conservar. Reduce el histórico antes de desvincular.",
    409,
  );
  const patches: {
      aliasId: string;
      country: string;
      currency: string;
      day: string;
      patch: Record<string, unknown>;
    }[] = [],
    fingerprints: unknown[] = [];
  const metrics = linkMetrics(link);
  let index = 0;
  while (index < dates.length) {
    const since = dates[index],
      until = new Date(Date.parse(since) + 30 * 86400000)
        .toISOString()
        .slice(0, 10),
      window: string[] = [];
    while (index < dates.length && dates[index] <= until)
      window.push(dates[index++]);
    const [live, local] = await Promise.all([
      effectiveness(actor, tableId, since, window.at(-1)!, tx),
      effectiveness(actor, tableId, since, window.at(-1)!, tx, [], true),
    ]);
    const localRows = new Map(
      local.rows.map((r) => [pair(r.aliasId, r.country), r]),
    );
    fingerprints.push([
      live.table,
      live.rows.map((r) => [r.aliasId, r.country, r.currency, r.token]).sort(),
    ]);
    for (const row of live.rows)
      for (const day of window) {
        if (!linkCoversDay(link, day)) continue;
        const cell = row.days[day],
          original = localRows.get(pair(row.aliasId, row.country))?.days[day],
          patch: Record<string, unknown> = {};
        for (const m of metrics) {
          if (!hasFact(cell, m) && !hasFact(original, m)) continue;
          const explicitNa =
            cell?.na.includes(m) && !cell.automaticNa.includes(m);
          patch[m] = {
            value: explicitNa ? "NA" : (cell?.[m] ?? 0),
            ...(!explicitNa && (cell?.[m] === null || cell?.[m] === undefined)
              ? { empty: true }
              : {}),
            ...(sheetMetrics.find((x) => x.key === m)!.money
              ? { currency: row.currency }
              : {}),
            sourceTableName: link.source.name,
            ...(cell?.partialMetrics.includes(m) ? { partial: true } : {}),
            ...(cell?.fxPending.includes(m) ? { pending: true } : {}),
          };
        }
        if (Object.keys(patch).length)
          patches.push({
            aliasId: row.aliasId,
            country: row.country,
            currency: row.currency,
            day,
            patch,
          });
      }
    demand(
      patches.length <= 200000,
      "La revisión supera 200000 registros diarios. Reduce el histórico antes de desvincular.",
      409,
    );
  }
  return {
    link,
    patches,
    token: hash([link, dates, fingerprints, patches]),
    summary: {
      days: dates.length,
      rows: new Set(patches.map((p) => pair(p.aliasId, p.country))).size,
      cells: patches.reduce((n, p) => n + Object.keys(p.patch).length, 0),
    },
  };
}
export async function previewUnlinkEffectiveness(
  actor: Actor,
  tableId: string,
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const p = await unlinkPlan(actor, tableId, tx);
      return {
        token: p.token,
        sourceName: p.link.source.name,
        targetName: p.link.target.name,
        summary: p.summary,
      };
    },
    { timeout: 120000 },
  );
}
export async function unlinkEffectiveness(
  actor: Actor,
  b: { tableId: string; token: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const p = await unlinkPlan(actor, b.tableId, tx);
      demand(
        b.token === p.token,
        "Los datos cambiaron desde la revisión. Revisa otra vez antes de desvincular.",
        409,
      );
      const pairs = [
        ...new Map(
          p.patches.map((r) => [
            pair(r.aliasId, r.country),
            {
              aliasId: r.aliasId,
              country: r.country,
              currency: "",
              displayCurrency: r.currency,
            },
          ]),
        ).values(),
      ];
      if (pairs.length)
        await tx.metaEffectivenessRow.createMany({
          data: pairs,
          skipDuplicates: true,
        });
      const stored = await tx.metaEffectivenessRow.findMany({
          where: { alias: { tableId: b.tableId }, legacy: false, currency: "" },
          select: { id: true, aliasId: true, country: true },
        }),
        ids = new Map(stored.map((r) => [pair(r.aliasId, r.country), r.id]));
      for (let i = 0; i < p.patches.length; i += 2000) {
        const values = p.patches.slice(i, i + 2000).map((r) => ({
          rowId: ids.get(pair(r.aliasId, r.country))!,
          day: r.day,
          patch: r.patch,
        }));
        await tx.$executeRaw`INSERT INTO "MetaEffectivenessDay" ("rowId",day,annotations,revision) SELECT x."rowId",x.day,x.patch,1 FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS x("rowId" text,day text,patch jsonb) ON CONFLICT ("rowId",day) DO UPDATE SET annotations="MetaEffectivenessDay".annotations || EXCLUDED.annotations,revision="MetaEffectivenessDay".revision+1`;
      }
      await tx.metaEffectivenessLink.delete({ where: { tableId: b.tableId } });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_COLUMNAS_DESVINCULADAS",
          resourceId: b.tableId,
          detail: {
            sourceTableId: p.link.sourceTableId,
            columns: p.link.columns,
            ...p.summary,
          },
        },
      });
      return { ok: true, summary: p.summary };
    },
    { timeout: 120000 },
  );
}
