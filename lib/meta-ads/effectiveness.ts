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
      rowRevision: number;
      campaigns: number;
      timezones: string[];
    }
  >();
  const get = (aliasId: string, country: string, currency: string) => {
    const key = JSON.stringify([aliasId, country, currency]);
    let r = rows.get(key);
    if (!r) {
      r = {
        aliasId,
        country,
        currency,
        days: {},
        campaigns: 0,
        rowRevision: 0,
        timezones: [],
      };
      rows.set(key, r);
    }
    return r;
  };
  const key = (a: string, p: string, m: string) => JSON.stringify([a, p, m]);
  const hidden = new Set(
    stored
      .filter((s) => s.hidden)
      .map((s) => key(s.aliasId, s.country, s.currency)),
  );
  for (const s of stored) {
    if (s.hidden) continue;
    const r = get(s.aliasId, s.country, s.currency);
    r.rowRevision = s.revision;
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
    if (hidden.has(key(c.aliasId!, c.aliasCountry!, c.account.currency)))
      continue;
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
  for (const a of table!.aliases)
    if (![...rows.values()].some((r) => r.aliasId === a.id))
      get(a.id, "", "PEN");
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
    rowRevision?: number;
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
    const previous = await tx.metaEffectivenessRow.findUnique({
      where: {
        aliasId_country_currency: {
          aliasId: b.aliasId,
          country: b.country,
          currency: b.currency,
        },
      },
    });
    if (b.day) {
      demand(
        !previous?.hidden,
        "La fila cambió de país o moneda. Recarga antes de guardar.",
        409,
      );
      demand(
        b.rowRevision === undefined ||
          b.rowRevision === (previous?.revision ?? 0),
        "La fila cambió. Recarga antes de guardar.",
        409,
      );
    }
    const row = await tx.metaEffectivenessRow.upsert({
      where: {
        aliasId_country_currency: {
          aliasId: b.aliasId,
          country: b.country,
          currency: b.currency,
        },
      },
      create: { aliasId: b.aliasId, country: b.country, currency: b.currency },
      update: b.day
        ? {}
        : {
            hidden: false,
            ...(previous?.hidden ? { revision: { increment: 1 } } : {}),
          },
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

export async function changeEffectivenessIdentity(
  actor: Actor,
  b: {
    aliasId: string;
    fromCountry: string;
    fromCurrency: string;
    country: string;
    currency: string;
    revision: number;
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
    const oldKey = {
      aliasId: b.aliasId,
      country: b.fromCountry,
      currency: b.fromCurrency,
    };
    const old = await tx.metaEffectivenessRow.findUnique({
      where: { aliasId_country_currency: oldKey },
    });
    demand(
      !old?.hidden && (old?.revision ?? 0) === b.revision,
      "La fila cambió. Recarga antes de editar.",
      409,
    );
    if (b.country === b.fromCountry && b.currency === b.fromCurrency)
      return { ok: true };
    const nextKey = {
      aliasId: b.aliasId,
      country: b.country,
      currency: b.currency,
    };
    const existing = await tx.metaEffectivenessRow.findUnique({
      where: { aliasId_country_currency: nextKey },
    });
    demand(
      !existing || existing.hidden,
      "Ya existe una fila de este diplomado, país y moneda. No se sobrescribieron sus datos.",
      409,
    );
    const next = await tx.metaEffectivenessRow.upsert({
      where: { aliasId_country_currency: nextKey },
      create: nextKey,
      update: { hidden: false, revision: { increment: 1 } },
    });
    if (old) {
      await tx.metaEffectivenessDay.updateMany({
        where: { rowId: old.id },
        data: { rowId: next.id, revision: { increment: 1 } },
      });
      await tx.metaEffectivenessRow.update({
        where: { id: old.id },
        data: { hidden: true, revision: { increment: 1 } },
      });
    } else
      await tx.metaEffectivenessRow.create({
        data: { ...oldKey, hidden: true, revision: 1 },
      });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_EFECTIVIDAD_FILA_EDITADA",
        resourceId: next.id,
        detail: {
          fromCountry: b.fromCountry,
          country: b.country,
          fromCurrency: b.fromCurrency,
          currency: b.currency,
        },
      },
    });
    return { ok: true };
  });
}
export async function importEffectiveness(
  actor: Actor,
  tableId: string,
  entries: { name: string; country: string; currency: string }[],
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
      demand(
        await tx.user.findFirst({
          where: { id: actor.id, role: "OWNER", status: "APPROVED" },
        }),
        "Sin permiso.",
        403,
      );
      demand(
        await tx.metaAliasTable.findUnique({ where: { id: tableId } }),
        "Tabla no disponible.",
        404,
      );
      const aliases = await tx.metaAlias.findMany({
        select: { id: true, name: true, tableId: true },
      });
      const byName = new Map(
        aliases.map((a) => [a.name.toLocaleLowerCase("es"), a]),
      );
      const newNames = new Set(
        entries
          .filter((e) => !byName.has(e.name.toLocaleLowerCase("es")))
          .map((e) => e.name.toLocaleLowerCase("es")),
      );
      demand(
        aliases.length + newNames.size <= 1000,
        "El catálogo admite hasta 1000 alias.",
      );
      for (const e of entries) {
        const a = byName.get(e.name.toLocaleLowerCase("es"));
        demand(
          !a || a.tableId === tableId,
          `El diplomado «${e.name}» ya pertenece a otra tabla.`,
          409,
        );
      }
      const namesToCreate = new Map<string, string>();
      for (const e of entries) {
        const key = e.name.toLocaleLowerCase("es");
        if (!byName.has(key) && !namesToCreate.has(key))
          namesToCreate.set(key, e.name);
      }
      if (namesToCreate.size)
        await tx.metaAlias.createMany({
          data: [...namesToCreate.values()].map((name) => ({ name, tableId })),
        });
      const catalogue = await tx.metaAlias.findMany({
        where: { tableId },
        select: { id: true, name: true },
      });
      const resolved = new Map(
        catalogue.map((a) => [a.name.toLocaleLowerCase("es"), a.id]),
      );
      const unique = new Map<
        string,
        { aliasId: string; country: string; currency: string }
      >();
      for (const e of entries) {
        const row = {
          aliasId: resolved.get(e.name.toLocaleLowerCase("es"))!,
          country: e.country,
          currency: e.currency,
        };
        unique.set(
          JSON.stringify([row.aliasId, row.country, row.currency]),
          row,
        );
      }
      const imported = [...unique.values()];
      await tx.metaEffectivenessRow.createMany({
        data: imported,
        skipDuplicates: true,
      });
      await tx.metaEffectivenessRow.updateMany({
        where: { hidden: true, OR: imported },
        data: { hidden: false, revision: { increment: 1 } },
      });
      const created = namesToCreate.size,
        seen = unique;
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_IMPORTADA",
          resourceId: tableId,
          detail: { rows: seen.size, created },
        },
      });
      return { ok: true, rows: seen.size, created };
    },
    { timeout: 30000 },
  );
}
