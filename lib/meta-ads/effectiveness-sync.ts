import { createHash } from "node:crypto";
import { db } from "../db";
import type { Prisma } from "@prisma/client";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectiveness, effectivenessLock } from "./effectiveness";
import { sheetMetrics, type SheetMetric } from "./period-summary";
import type { Actor } from "./service";
export type SyncColumn = "alias" | SheetMetric;
export type SyncInput = {
  tableId: string;
  sourceTableId: string;
  since: string;
  until: string;
  columns: SyncColumn[];
};
const pair = (alias: string, country: string) =>
  JSON.stringify([alias, country]);
async function planSync(
  actor: Actor,
  b: SyncInput,
  tx: Prisma.TransactionClient,
) {
  demand(
    b.tableId !== b.sourceTableId,
    "El origen y el destino deben ser tablas diferentes.",
  );
  const [source, target, config, count] = await Promise.all([
    effectiveness(actor, b.sourceTableId, b.since, b.until, tx),
    effectiveness(actor, b.tableId, b.since, b.until, tx),
    tx.metaEffectivenessSync.findUnique({ where: { tableId: b.tableId } }),
    tx.metaAlias.count(),
  ]);
  demand(
    source.rows.length <= 1000,
    "Sincroniza hasta 1000 filas por operación.",
  );
  const columns = [...b.columns].sort();
  const targetNames = new Map(target.table.aliases.map((a) => [a.name, a]));
  const sourceNames = new Map(source.table.aliases.map((a) => [a.id, a.name]));
  const targetRows = new Map(
    target.rows.map((r) => [
      pair(
        target.table.aliases.find((a) => a.id === r.aliasId)!.name,
        r.country,
      ),
      r,
    ]),
  );
  const newAliases = b.columns.includes("alias")
    ? source.table.aliases
        .filter((a) => !targetNames.has(a.name))
        .map((a) => a.name)
    : [];
  for (const name of newAliases)
    demand(
      !target.table.aliases.some(
        (a) => a.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"),
      ),
      `El alias «${name}» difiere solo en mayúsculas del destino. Corrige el nombre para coincidir exactamente.`,
      409,
    );
  demand(
    count + newAliases.length <= 1000,
    "La sincronización excede el límite de 1000 alias.",
  );
  const newRows: { name: string; country: string; currency: string }[] = [],
    patches: {
      name: string;
      country: string;
      currency: string;
      day: string;
      patch: Record<
        string,
        {
          value: number | "NA";
          currency?: string;
          sourceTableName?: string;
          sourceTableId?: string;
          partial?: boolean;
        }
      >;
    }[] = [];
  let unmatched = 0,
    missing = 0,
    skippedCountry = 0;
  const dates: string[] = [];
  for (let d = Date.parse(b.since); d <= Date.parse(b.until); d += 86400000)
    dates.push(new Date(d).toISOString().slice(0, 10));
  const metrics = sheetMetrics.filter((m) => b.columns.includes(m.key));
  for (const r of source.rows) {
    const name = sourceNames.get(r.aliasId)!,
      key = pair(name, r.country),
      destination = targetRows.get(key);
    if (!targetNames.has(name) && !b.columns.includes("alias")) {
      unmatched++;
      continue;
    }
    if (!destination && !b.columns.includes("alias")) {
      unmatched++;
      continue;
    }
    if (!destination)
      newRows.push({ name, country: r.country, currency: r.currency });
    if (!r.country) {
      if (metrics.length) skippedCountry++;
      continue;
    }
    for (const day of dates) {
      const cell = r.days[day],
        patch: Record<
          string,
          {
            value: number | "NA";
            currency?: string;
            sourceTableName?: string;
            sourceTableId?: string;
            partial?: boolean;
          }
        > = {};
      for (const m of metrics) {
        if (cell?.automaticNa.includes(m.key)) {
          missing++;
          continue;
        }
        const value = cell?.[m.key];
        if (cell?.na.includes(m.key)) patch[m.key] = { value: "NA" };
        else if (
          typeof value === "number" &&
          Number.isFinite(value) &&
          (!m.money || value === 0 || r.currency)
        )
          patch[m.key] = {
            value,
            ...(m.money ? { currency: r.currency } : {}),
          };
        else missing++;
      }
      for (const [metric, entry] of Object.entries(patch)) {
        if (
          cell?.partialMetrics.includes(metric as SheetMetric) ||
          ((metric === "base" || metric === "spend") &&
            !cell?.manual.includes(metric as SheetMetric) &&
            (cell?.campaigns ?? 0) < r.campaigns)
        )
          entry.partial = true;
        entry.sourceTableId = b.sourceTableId;
        entry.sourceTableName = source.table.name;
      }
      if (Object.keys(patch).length)
        patches.push({
          name,
          country: r.country,
          currency: destination?.currency ?? r.currency,
          day,
          patch,
        });
    }
  }
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        b.tableId,
        b.sourceTableId,
        b.since,
        b.until,
        columns,
        config?.revision ?? 0,
        [...source.table.aliases].sort((a, b) => a.id.localeCompare(b.id)),
        [...target.table.aliases].sort((a, b) => a.id.localeCompare(b.id)),
        source.rows.map((r) => [r.aliasId, r.country, r.token]).sort(),
        target.rows.map((r) => [r.aliasId, r.country, r.token]).sort(),
        [...newRows].sort((a, b) =>
          pair(a.name, a.country).localeCompare(pair(b.name, b.country)),
        ),
        [...patches].sort((a, b) =>
          (pair(a.name, a.country) + a.day).localeCompare(
            pair(b.name, b.country) + b.day,
          ),
        ),
      ]),
    )
    .digest("hex");
  return {
    source,
    target,
    config,
    newAliases,
    newRows,
    patches,
    token: fingerprint,
    summary: {
      aliasesAdded: newAliases.length,
      rowsAdded: newRows.length,
      cells: patches.reduce((n, p) => n + Object.keys(p.patch).length, 0),
      unmatched,
      missing,
      skippedCountry,
    },
  };
}
export async function effectivenessSyncConfig(actor: Actor, tableId: string) {
  ownerOnly(actor);
  demand(
    await db.metaAliasTable.findUnique({ where: { id: tableId } }),
    "Tabla no disponible.",
    404,
  );
  return db.metaEffectivenessSync.findUnique({ where: { tableId } });
}
export async function previewEffectivenessSync(actor: Actor, b: SyncInput) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const p = await planSync(actor, b, tx);
      return {
        token: p.token,
        summary: p.summary,
        sourceName: p.source.table.name,
        targetName: p.target.table.name,
      };
    },
    { timeout: 60000 },
  );
}
export async function applyEffectivenessSync(
  actor: Actor,
  b: SyncInput & { token: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const p = await planSync(actor, b, tx);
      demand(
        p.token === b.token,
        "El origen o destino cambió. Vuelve a revisar la sincronización.",
        409,
      );
      demand(
        p.summary.cells + p.summary.aliasesAdded + p.summary.rowsAdded > 0,
        "No hay coincidencias ni datos para sincronizar.",
      );
      if (p.newAliases.length)
        await tx.metaAlias.createMany({
          data: p.newAliases.map((name) => ({ name, tableId: b.tableId })),
        });
      const aliases = await tx.metaAlias.findMany({
          where: { tableId: b.tableId },
          select: { id: true, name: true },
        }),
        ids = new Map(aliases.map((a) => [a.name, a.id]));
      const wanted = new Map(
        [...p.newRows, ...p.patches].map((r) => [
          pair(r.name, r.country),
          {
            aliasId: ids.get(r.name)!,
            country: r.country,
            currency: "",
            displayCurrency: r.currency,
          },
        ]),
      );
      if (wanted.size)
        await tx.metaEffectivenessRow.createMany({
          data: [...wanted.values()],
          skipDuplicates: true,
        });
      // Reactivate only the explicit alias+country pairs selected by the source; preserve all other rows.
      if (p.newRows.length)
        await tx.metaEffectivenessRow.updateMany({
          where: {
            legacy: false,
            hidden: true,
            OR: p.newRows.map((r) => ({
              aliasId: ids.get(r.name)!,
              country: r.country,
            })),
          },
          data: { hidden: false, revision: { increment: 1 } },
        });
      const rows = await tx.metaEffectivenessRow.findMany({
          where: { legacy: false, alias: { tableId: b.tableId }, currency: "" },
          select: { id: true, aliasId: true, country: true },
        }),
        rowIds = new Map(rows.map((r) => [pair(r.aliasId, r.country), r.id]));
      const values = p.patches.map((r) => ({
        rowId: rowIds.get(pair(ids.get(r.name)!, r.country))!,
        day: r.day,
        patch: r.patch,
      }));
      if (values.length)
        await tx.$executeRaw`INSERT INTO "MetaEffectivenessDay" ("rowId",day,annotations,revision) SELECT x."rowId",x.day,x.patch,1 FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS x("rowId" text,day text,patch jsonb) ON CONFLICT ("rowId",day) DO UPDATE SET annotations="MetaEffectivenessDay".annotations || EXCLUDED.annotations,revision="MetaEffectivenessDay".revision+1`;
      const config = await tx.metaEffectivenessSync.upsert({
        where: { tableId: b.tableId },
        create: {
          tableId: b.tableId,
          sourceTableId: b.sourceTableId,
          columns: b.columns,
        },
        update: {
          sourceTableId: b.sourceTableId,
          columns: b.columns,
          revision: { increment: 1 },
          lastSyncAt: new Date(),
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_SINCRONIZADA",
          resourceId: b.tableId,
          detail: {
            sourceTableId: b.sourceTableId,
            since: b.since,
            until: b.until,
            columns: b.columns,
            ...p.summary,
          },
        },
      });
      return { ok: true, summary: p.summary, lastSyncAt: config.lastSyncAt };
    },
    { timeout: 60000 },
  );
}
