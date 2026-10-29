import {
  manualBaseValue,
  manualBaseAllocationsSchema,
} from "./manual-base-policy";
import { activeWorkbookSheetId } from "./workbook-scope";
import { db } from "../db";
import {ownerOnly} from "./financial-access";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectiveness, effectivenessLock } from "./effectiveness";
import { sumEffectivenessDay } from "./effectiveness-total-values";
import type { Actor } from "./service";
import type { Prisma } from "@prisma/client";
export async function effectivenessTotals(
  actor: Actor,
  tableId: string,
  since: string,
  until: string,
  sheetId?: string,
) {
  ownerOnly(actor);
  sheetId ??= (
    await db.metaEffectivenessSheet.findFirst({
      where: { kind: "TOTALS", archivedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
  )?.id;
  demand(sheetId, "Hoja de totales no disponible.", 404);
  demand(
    await db.metaEffectivenessSheet.findFirst({
      where: { id: sheetId, kind: "TOTALS", archivedAt: null },
    }),
    "Hoja de totales no disponible.",
    404,
  );
  const [sheet, stored, manualBase, advisorBase] = await Promise.all([
    effectiveness(actor, tableId, since, until),
    db.metaEffectivenessTotalDay.findMany({
      where: { sheetId, tableId, day: { gte: since, lte: until } },
    }),
    db.metaManualBaseDay.findMany({
      where: { tableId, day: { gte: since, lte: until } },
    }),
    db.metaAdvisorBaseDay.findMany({
      where: { tableId, day: { gte: since, lte: until } },
    }),
  ]);
  const assigned = new Map(
    manualBase.map((r) => [JSON.stringify([r.country, r.day]), r]),
  );
  const assignedBA = new Map(
    advisorBase.map((r) => [JSON.stringify([r.country, r.day]), r]),
  );
  const groups = new Map<
    string,
    { country: string; currency: string; rows: typeof sheet.rows }
  >();
  const group = (country: string, currency: string) => {
    const key = JSON.stringify([country, currency]);
    if (!groups.has(key)) groups.set(key, { country, currency, rows: [] });
    return groups.get(key)!;
  };
  for (const r of sheet.rows) group(r.country, r.currency).rows.push(r);
  for (const r of stored) group(r.country, r.currency);
  for (const r of [...manualBase, ...advisorBase])
    if (![...groups.values()].some((g) => g.country === r.country))
      group(r.country, sheet.table.defaultCurrency || "");
  const saved = new Map(
    stored.map((r) => [JSON.stringify([r.country, r.currency, r.day]), r]),
  );
  const days: string[] = [];
  for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
    days.push(new Date(d).toISOString().slice(0, 10));
  return {
    tableId,
    name: sheet.table.name,
    missingFxDays: sheet.missingFxDays,
    groups: [...groups.values()].map((g) => ({
      country: g.country,
      currency: g.currency,
      days: Object.fromEntries(
        days.map((day) => {
          const entry = saved.get(JSON.stringify([g.country, g.currency, day]));
          const base = assigned.get(JSON.stringify([g.country, day]));
          const manual = {
            ...((entry?.values as Record<string, number | "NA">) ?? {}),
          };
          if (base) {
            const value = manualBaseValue(
              base.state,
              manualBaseAllocationsSchema.parse(base.allocations),
            );
            if (value === null) delete manual.baseManual;
            else manual.baseManual = value;
          }
          delete manual.advisorBase;
          const ba = assignedBA.get(JSON.stringify([g.country, day]));
          if (ba) {
            const value = manualBaseValue(
              ba.state,
              manualBaseAllocationsSchema.parse(ba.allocations),
            );
            if (value === null) delete manual.advisorBase;
            else manual.advisorBase = value;
          }
          return [
            day,
            {
              sums: sumEffectivenessDay(g.rows, day),
              manual,
              sharedManualBase: !!base,
              revision: entry?.revision ?? 0,
            },
          ];
        }),
      ),
    })),
  };
}
export async function saveEffectivenessTotal(
  actor: Actor,
  b: {
    sheetId?: string;
    tableId: string;
    country: string;
    currency: string;
    day: string;
    metric: "baseManual" | "totalSpend" | "fixedCost";
    value: number | "NA" | null;
    revision: number;
  },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaAliasTable.findUnique({ where: { id: b.tableId } }),
      "Tabla no disponible.",
      404,
    );
    demand(
      typeof b.value !== "number" ||
        b.value === 0 ||
        b.metric === "baseManual" ||
        b.currency,
      "Elige moneda antes de registrar importes.",
    );
    const sheetId = await activeWorkbookSheetId(tx, "TOTALS", b.sheetId);
    demand(
      await tx.metaEffectivenessSheet.findFirst({
        where: { id: sheetId, kind: "TOTALS", archivedAt: null },
      }),
      "Hoja de totales no disponible.",
      404,
    );
    if (b.metric === "baseManual")
      demand(
        !(await tx.metaManualBaseDay.findUnique({
          where: {
            tableId_country_day: {
              tableId: b.tableId,
              country: b.country,
              day: b.day,
            },
          },
        })),
        "BM ya tiene un reparto compartido. Edita sus asesores en el recuadro BM.",
        409,
      );
    const key = {
      sheetId,
      tableId: b.tableId,
      country: b.country,
      currency: b.currency,
      day: b.day,
    };
    const old = await tx.metaEffectivenessTotalDay.findUnique({
      where: { sheetId_tableId_country_currency_day: key },
    });
    demand(
      (old?.revision ?? 0) === b.revision,
      "El total cambió. Recarga antes de guardar.",
      409,
    );
    const values = {
      ...((old?.values as Record<string, number | "NA">) ?? {}),
    };
    if (b.value === null) delete values[b.metric];
    else values[b.metric] = b.value;
    await tx.metaEffectivenessTotalDay.upsert({
      where: { sheetId_tableId_country_currency_day: key },
      create: { ...key, values: values as Prisma.InputJsonValue },
      update: {
        values: values as Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_EFECTIVIDAD_TOTAL_MANUAL",
        resourceId: b.tableId,
        detail: {
          country: b.country,
          currency: b.currency,
          day: b.day,
          metric: b.metric,
        },
      },
    });
    return { ok: true, revision: b.revision + 1 };
  });
}
