import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { accountWhere, type Actor } from "./service";
export async function effectiveness(
  actor: Actor,
  tableId: string,
  since: string,
  until: string,
) {
  ownerOnly(actor);
  const table = await db.metaAliasTable.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      name: true,
      aliases: { select: { id: true, name: true } },
    },
  });
  demand(table, "Tabla no disponible.", 404);
  const campaigns = await db.metaAdObject.findMany({
    where: {
      level: "campaign",
      alias: { tableId },
      aliasCountry: { not: null },
      account: accountWhere(actor),
    },
    select: {
      id: true,
      aliasId: true,
      aliasCountry: true,
      account: { select: { currency: true, timezone: true } },
      daily: {
        where: {
          day: { gte: since, lte: until },
          scope: "7d_click,1d_view|impression",
        },
        select: { day: true, spend: true, actions: true, updatedAt: true },
      },
    },
  });
  const stored = await db.metaEffectivenessRow.findMany({
    where: { alias: { tableId } },
    include: { days: { where: { day: { gte: since, lte: until } } } },
  });
  const rows = new Map<
    string,
    {
      aliasId: string;
      country: string;
      currency: string;
      days: Record<
        string,
        {
          spend: number | null;
          base: number | null;
          campaigns: number;
          updatedAt: string | null;
          sales: number | null;
          fixedCost: number | null;
          revision: number;
        }
      >;
      campaigns: number;
      timezones: string[];
    }
  >();
  const get = (aliasId: string, country: string, currency: string) => {
    const key = JSON.stringify([aliasId, country, currency]);
    let r = rows.get(key);
    if (!r) {
      r = { aliasId, country, currency, days: {}, campaigns: 0, timezones: [] };
      rows.set(key, r);
    }
    return r;
  };
  for (const s of stored) {
    const r = get(s.aliasId, s.country, s.currency);
    for (const d of s.days)
      r.days[d.day] = {
        spend: null,
        base: null,
        campaigns: 0,
        updatedAt: null,
        sales: d.sales,
        fixedCost: d.fixedCost === null ? null : Number(d.fixedCost),
        revision: d.revision,
      };
  }
  for (const c of campaigns) {
    const r = get(c.aliasId!, c.aliasCountry!, c.account.currency);
    r.campaigns++;
    if (!r.timezones.includes(c.account.timezone))
      r.timezones.push(c.account.timezone);
    for (const d of c.daily) {
      const cell = (r.days[d.day] ??= {
        spend: null,
        base: null,
        campaigns: 0,
        updatedAt: null,
        sales: null,
        fixedCost: null,
        revision: 0,
      });
      cell.spend = (cell.spend ?? 0) + Number(d.spend);
      const actions = d.actions as Record<string, unknown>;
      const v = actions["onsite_conversion.messaging_conversation_started_7d"];
      cell.base =
        (cell.base ?? 0) +
        (typeof v === "number" && Number.isFinite(v) ? v : 0);
      cell.campaigns++;
      if (!cell.updatedAt || d.updatedAt.toISOString() > cell.updatedAt)
        cell.updatedAt = d.updatedAt.toISOString();
    }
  }
  return { table, rows: [...rows.values()], since, until };
}
export async function saveEffectiveness(
  actor: Actor,
  b: {
    aliasId: string;
    country: string;
    currency: string;
    day?: string;
    sales?: number | null;
    fixedCost?: number | null;
    revision?: number;
  },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: { id: actor.id, role: "OWNER", status: "APPROVED" },
      }),
      "Sin permiso.",
      403,
    );
    demand(
      await tx.metaAlias.findUnique({ where: { id: b.aliasId } }),
      "Alias no disponible.",
      404,
    );
    const row = await tx.metaEffectivenessRow.upsert({
      where: {
        aliasId_country_currency: {
          aliasId: b.aliasId,
          country: b.country,
          currency: b.currency,
        },
      },
      create: { aliasId: b.aliasId, country: b.country, currency: b.currency },
      update: {},
    });
    if (b.day) {
      const old = await tx.metaEffectivenessDay.findUnique({
        where: { rowId_day: { rowId: row.id, day: b.day } },
      });
      demand(
        (old?.revision ?? 0) === (b.revision ?? 0),
        "Esta celda cambió. Recarga antes de guardar.",
        409,
      );
      await tx.metaEffectivenessDay.upsert({
        where: { rowId_day: { rowId: row.id, day: b.day } },
        create: {
          rowId: row.id,
          day: b.day,
          sales: b.sales ?? null,
          fixedCost: b.fixedCost ?? null,
          revision: 1,
        },
        update: {
          sales: b.sales,
          fixedCost: b.fixedCost,
          revision: { increment: 1 },
        },
      });
    }
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_EFECTIVIDAD_GUARDADA",
        resourceId: row.id,
        detail: { day: b.day ?? null },
      },
    });
    return { ok: true };
  });
}
