import { createHash } from "node:crypto";
import { sheetMetrics, type SheetMetric } from "./period-summary";
import { db } from "../db";
import type { Prisma } from "@prisma/client";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { accountWhere, type Actor } from "./service";
import { convertMoney, type FxRates } from "./exchange-rates";
type Tx = Prisma.TransactionClient;
const key = (a: string, p: string) => JSON.stringify([a, p]);
export async function effectivenessLock(tx: Tx, actor: Actor) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
  demand(
    await tx.user.findFirst({
      where: { id: actor.id, role: "OWNER", status: "APPROVED" },
    }),
    "Sin permiso.",
    403,
  );
}
export async function effectiveness(
  actor: Actor,
  tableId: string,
  since: string,
  until: string,
  client: Prisma.TransactionClient = db,
) {
  ownerOnly(actor);
  const table = await client.metaAliasTable.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      name: true,
      aliasColumnName: true,
      defaultCountry: true,
      defaultCurrency: true,
      aliases: { select: { id: true, name: true } },
    },
  });
  demand(table, "Tabla no disponible.", 404);
  const [campaigns, stored, snapshots, states] = await Promise.all([
    client.metaAdObject.findMany({
      where: {
        level: "campaign",
        alias: { tableId },
        aliasCountry: { not: null },
        account: accountWhere(actor),
      },
      select: {
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
    }),
    client.metaEffectivenessRow.findMany({
      where: { legacy: false, alias: { tableId } },
      include: {
        days: { where: { day: { gte: since, lte: until } } },
        legacySources: {
          where: { hidden: false },
          include: { days: { where: { day: { gte: since, lte: until } } } },
        },
      },
    }),
    client.metaFxDay.findMany({
      where: { day: { gte: since, lte: until } },
      select: {
        day: true,
        rates: true,
        source: true,
        sourceUrl: true,
        fetchedAt: true,
      },
    }),
    client.metaEffectivenessState.findMany({
      where: { alias: { tableId } },
      select: {
        aliasId: true,
        country: true,
        active: true,
        revision: true,
        events: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { createdAt: true, active: true },
        },
      },
    }),
  ]);
  const hidden = new Set(
      stored.filter((s) => s.hidden).map((s) => key(s.aliasId, s.country)),
    ),
    fx = new Map(snapshots.map((s) => [s.day, s]));
  type Amount = { currency: string; amount: number };
  type InternalCell = {
    budget: number | null;
    spend: number | null;
    base: number | null;
    sales: number | null;
    fixedCost: number | null;
    campaigns: number;
    updatedAt: string | null;
    revision: number;
    sourceSpend: Amount[];
    sourceFixedCost: Amount[];
    fxMissing: boolean;
    na: SheetMetric[];
    manual: SheetMetric[];
    synced: Partial<Record<SheetMetric, string>>;
    partialMetrics: SheetMetric[];
    fx: {
      from: string;
      to: string;
      rate: number;
      date: string;
      source: string;
      url: string;
    }[];
  };
  const rows = new Map<
    string,
    {
      aliasId: string;
      country: string;
      currency: string;
      rowRevision: number;
      days: Record<string, InternalCell>;
      campaigns: number;
      timezones: string[];
      active: boolean;
      stateRevision: number;
      lastStateChange: string | null;
      token: string;
    }
  >();
  const get = (a: string, p: string) => {
    const k = key(a, p);
    let r = rows.get(k);
    if (!r) {
      r = {
        aliasId: a,
        country: p,
        currency: table!.defaultCurrency,
        rowRevision: 0,
        days: {},
        campaigns: 0,
        timezones: [],
        active:
          states.find((s) => s.aliasId === a && s.country === p)?.active ??
          true,
        stateRevision:
          states.find((s) => s.aliasId === a && s.country === p)?.revision ?? 0,
        lastStateChange:
          states
            .find((s) => s.aliasId === a && s.country === p)
            ?.events[0]?.createdAt.toISOString() ?? null,
        token: "",
      };
      rows.set(k, r);
    }
    return r;
  };
  const cell = (r: ReturnType<typeof get>, day: string) =>
    (r.days[day] ??= {
      budget: null,
      spend: null,
      base: null,
      sales: null,
      fixedCost: null,
      campaigns: 0,
      updatedAt: null,
      revision: 0,
      sourceSpend: [],
      sourceFixedCost: [],
      fxMissing: false,
      fx: [],
      na: [],
      manual: [],
      synced: {},
      partialMetrics: [],
    });
  for (const s of stored) {
    if (s.hidden) continue;
    const r = get(s.aliasId, s.country);
    r.currency = s.displayCurrency;
    r.rowRevision = s.revision;
    for (const legacy of s.legacySources)
      for (const d of legacy.days) {
        const c = cell(r, d.day);
        if (d.sales !== null) c.sales = (c.sales ?? 0) + d.sales;
        if (d.fixedCost !== null)
          c.sourceFixedCost.push({
            currency: d.fixedCostCurrency ?? legacy.currency,
            amount: Number(d.fixedCost),
          });
      }
    for (const d of s.days) {
      const c = cell(r, d.day);
      c.revision = d.revision;
      if (d.salesOverridden) c.sales = d.sales;
      if (d.fixedCostOverridden)
        c.sourceFixedCost =
          d.fixedCost === null
            ? []
            : [
                {
                  currency: d.fixedCostCurrency ?? s.displayCurrency,
                  amount: Number(d.fixedCost),
                },
              ];
    }
  }
  for (const c of campaigns) {
    if (hidden.has(key(c.aliasId!, c.aliasCountry!))) continue;
    const r = get(c.aliasId!, c.aliasCountry!);
    r.campaigns++;
    if (!r.timezones.includes(c.account.timezone))
      r.timezones.push(c.account.timezone);
    for (const d of c.daily) {
      const x = cell(r, d.day);
      x.sourceSpend.push({
        currency: c.account.currency,
        amount: Number(d.spend),
      });
      const actions = d.actions as Record<string, unknown>,
        v = actions["onsite_conversion.messaging_conversation_started_7d"];
      x.base =
        (x.base ?? 0) + (typeof v === "number" && Number.isFinite(v) ? v : 0);
      x.campaigns++;
      if (!x.updatedAt || d.updatedAt.toISOString() > x.updatedAt)
        x.updatedAt = d.updatedAt.toISOString();
    }
  }
  for (const a of table!.aliases)
    if (![...rows.values()].some((r) => r.aliasId === a.id))
      get(a.id, table!.defaultCountry);
  const missing = new Set<string>();
  const annotations = new Map(
    stored.map((s) => [
      key(s.aliasId, s.country),
      new Map(
        s.days.map((d) => [
          d.day,
          d.annotations as Record<
            string,
            {
              value: number | "NA";
              currency?: string;
              sourceTableName?: string;
              partial?: boolean;
            }
          >,
        ]),
      ),
    ]),
  );
  for (const r of rows.values())
    for (const [day, c] of Object.entries(r.days)) {
      const snapshot = fx.get(day),
        rates = snapshot?.rates as FxRates | undefined;
      const project = (amounts: Amount[]) => {
        if (!amounts.length || !r.currency) return null;
        let total = 0;
        for (const a of amounts) {
          const v = convertMoney(a.amount, a.currency, r.currency, rates);
          if (v === null) {
            c.fxMissing = true;
            missing.add(day);
            return null;
          }
          total += v;
          if (
            a.currency !== r.currency &&
            a.amount !== 0 &&
            snapshot &&
            !c.fx.some((f) => f.from === a.currency)
          )
            c.fx.push({
              from: a.currency,
              to: r.currency,
              rate: rates![r.currency] / rates![a.currency],
              date: day,
              source: snapshot.source,
              url: snapshot.sourceUrl,
            });
        }
        return total;
      };
      const overrides =
        annotations.get(key(r.aliasId, r.country))?.get(day) ?? {};
      c.spend = overrides.spend ? null : project(c.sourceSpend);
      c.fixedCost = overrides.fixedCost ? null : project(c.sourceFixedCost);
      for (const m of sheetMetrics) {
        const override = overrides[m.key];
        if (!override) continue;
        c.manual.push(m.key);
        if (override.partial) c.partialMetrics.push(m.key);
        if (override.sourceTableName)
          c.synced[m.key] = override.sourceTableName;
        if (override.value === "NA") {
          c[m.key] = null;
          c.na.push(m.key);
        } else
          c[m.key] =
            m.money && override.value !== 0
              ? project([
                  { amount: override.value, currency: override.currency || "" },
                ])
              : override.value;
      }
    }
  for (const r of rows.values())
    r.token = createHash("sha256")
      .update(
        JSON.stringify([
          r.aliasId,
          r.country,
          r.currency,
          r.rowRevision,
          since,
          until,
          Object.entries(r.days)
            .map(([day, c]) => [day, c.revision])
            .sort(),
        ]),
      )
      .digest("hex")
      .slice(0, 32);
  return {
    table,
    rows: [...rows.values()],
    since,
    until,
    missingFxDays: [...missing].sort(),
  };
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
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaAlias.findUnique({ where: { id: b.aliasId } }),
      "Alias no disponible.",
      404,
    );
    const old = await tx.metaEffectivenessRow.findUnique({
      where: {
        aliasId_country_currency: {
          aliasId: b.aliasId,
          country: b.country,
          currency: "",
        },
      },
    });
    demand(
      !old?.hidden,
      "La fila cambió de país. Recarga antes de guardar.",
      409,
    );
    demand(
      b.rowRevision === undefined || b.rowRevision === (old?.revision ?? 0),
      "La fila cambió. Recarga antes de guardar.",
      409,
    );
    demand(
      b.fixedCost === undefined || b.fixedCost === null || !!b.currency,
      "Elige una moneda antes de registrar costos fijos.",
    );
    if (old && b.fixedCost !== undefined)
      demand(
        old.displayCurrency === b.currency,
        "La moneda cambió. Recarga antes de guardar.",
        409,
      );
    const row =
      old ??
      (await tx.metaEffectivenessRow.create({
        data: {
          aliasId: b.aliasId,
          country: b.country,
          currency: "",
          displayCurrency: b.currency,
        },
      }));
    if (b.day) {
      const prior = await tx.metaEffectivenessDay.findUnique({
        where: { rowId_day: { rowId: row.id, day: b.day } },
      });
      demand(
        (prior?.revision ?? 0) === (b.revision ?? 0),
        "Esta celda cambió. Recarga antes de guardar.",
        409,
      );
      const annotations = {
        ...((prior?.annotations as Record<string, Prisma.JsonValue>) ?? {}),
      };
      if (b.sales !== undefined) delete annotations.sales;
      if (b.fixedCost !== undefined) delete annotations.fixedCost;
      const data = {
        annotations: annotations as Prisma.InputJsonValue,
        ...(b.sales !== undefined
          ? { sales: b.sales, salesOverridden: true }
          : {}),
        ...(b.fixedCost !== undefined
          ? {
              fixedCost: b.fixedCost,
              fixedCostOverridden: true,
              fixedCostCurrency: b.currency || null,
            }
          : {}),
      };
      await tx.metaEffectivenessDay.upsert({
        where: { rowId_day: { rowId: row.id, day: b.day } },
        create: { rowId: row.id, day: b.day, ...data, revision: 1 },
        update: { ...data, revision: { increment: 1 } },
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
async function emptyHiddenDestination(
  tx: Tx,
  aliasId: string,
  country: string,
) {
  const target = await tx.metaEffectivenessRow.findUnique({
    where: { aliasId_country_currency: { aliasId, country, currency: "" } },
    include: {
      _count: { select: { days: true } },
      legacySources: { select: { _count: { select: { days: true } } } },
    },
  });
  if (target) {
    demand(
      target.hidden &&
        !target._count.days &&
        target.legacySources.every((s) => !s._count.days),
      "Ya existe una fila de este alias y país. No se sobrescribieron sus datos.",
      409,
    );
    await tx.metaEffectivenessRow.delete({ where: { id: target.id } });
  }
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
    await effectivenessLock(tx, actor);
    const a = await tx.metaAlias.findUnique({
      where: { id: b.aliasId },
      include: { table: true },
    });
    demand(a, "Alias no disponible.", 404);
    const old = await tx.metaEffectivenessRow.findUnique({
      where: {
        aliasId_country_currency: {
          aliasId: b.aliasId,
          country: b.fromCountry,
          currency: "",
        },
      },
    });
    demand(
      !old?.hidden && (old?.revision ?? 0) === b.revision,
      "La fila cambió. Recarga antes de editar.",
      409,
    );
    if (b.country !== b.fromCountry)
      await emptyHiddenDestination(tx, b.aliasId, b.country);
    const row = old
      ? await tx.metaEffectivenessRow.update({
          where: { id: old.id },
          data: {
            country: b.country,
            displayCurrency: b.currency,
            revision: { increment: 1 },
          },
        })
      : await tx.metaEffectivenessRow.create({
          data: {
            aliasId: b.aliasId,
            country: b.country,
            currency: "",
            displayCurrency: b.currency,
            revision: 1,
          },
        });
    if (b.country !== b.fromCountry)
      await tx.metaEffectivenessRow.create({
        data: {
          aliasId: b.aliasId,
          country: b.fromCountry,
          currency: "",
          hidden: true,
          revision: b.revision + 1,
        },
      });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_EFECTIVIDAD_FILA_EDITADA",
        resourceId: row.id,
        detail: {
          fromCountry: b.fromCountry,
          country: b.country,
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
      await effectivenessLock(tx, actor);
      demand(
        await tx.metaAliasTable.findUnique({ where: { id: tableId } }),
        "Tabla no disponible.",
        404,
      );
      const aliases = await tx.metaAlias.findMany({
          select: { id: true, name: true, tableId: true },
        }),
        byName = new Map(
          aliases
            .filter((a) => a.tableId === tableId)
            .map((a) => [a.name.toLocaleLowerCase("es"), a]),
        );
      const fresh = new Map<string, string>();
      for (const e of entries) {
        const k = e.name.toLocaleLowerCase("es"),
          a = byName.get(k);
        demand(
          !a || a.tableId === tableId,
          `El alias «${e.name}» ya pertenece a otra tabla.`,
          409,
        );
        if (!a && !fresh.has(k)) fresh.set(k, e.name);
      }
      demand(
        aliases.length + fresh.size <= 1000,
        "El catálogo admite hasta 1000 alias.",
      );
      if (fresh.size)
        await tx.metaAlias.createMany({
          data: [...fresh.values()].map((name) => ({ name, tableId })),
        });
      const catalogue = await tx.metaAlias.findMany({
          where: { tableId },
          select: { id: true, name: true },
        }),
        ids = new Map(
          catalogue.map((a) => [a.name.toLocaleLowerCase("es"), a.id]),
        );
      const unique = new Map<
        string,
        {
          aliasId: string;
          country: string;
          currency: string;
          displayCurrency: string;
        }
      >();
      for (const e of entries) {
        const aliasId = ids.get(e.name.toLocaleLowerCase("es"))!,
          k = key(aliasId, e.country);
        demand(
          !unique.has(k) || unique.get(k)!.displayCurrency === e.currency,
          "El mismo alias y país no puede tener dos monedas de visualización en un lote.",
        );
        unique.set(k, {
          aliasId,
          country: e.country,
          currency: "",
          displayCurrency: e.currency,
        });
      }
      const imported = [...unique.values()];
      await tx.metaEffectivenessRow.createMany({
        data: imported,
        skipDuplicates: true,
      });
      const units = new Set(imported.map((r) => r.displayCurrency));
      for (const unit of units)
        await tx.metaEffectivenessRow.updateMany({
          where: {
            legacy: false,
            hidden: true,
            OR: imported
              .filter((r) => r.displayCurrency === unit)
              .map((r) => ({ aliasId: r.aliasId, country: r.country })),
          },
          data: {
            hidden: false,
            displayCurrency: unit,
            revision: { increment: 1 },
          },
        });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_IMPORTADA",
          resourceId: tableId,
          detail: { rows: unique.size, created: fresh.size },
        },
      });
      return { ok: true, rows: unique.size, created: fresh.size };
    },
    { timeout: 30000 },
  );
}
export async function setEffectivenessColumns(
  actor: Actor,
  b: {
    tableId: string;
    aliasColumnName?: string;
    country?: string;
    currency?: string;
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const table = await tx.metaAliasTable.findUnique({
        where: { id: b.tableId },
        include: { aliases: { select: { id: true } } },
      });
      demand(table, "Tabla no disponible.", 404);
      const stored = await tx.metaEffectivenessRow.findMany({
        where: { legacy: false, alias: { tableId: b.tableId } },
      });
      const hidden = new Set(
        stored.filter((r) => r.hidden).map((r) => key(r.aliasId, r.country)),
      );
      const rows = new Map(
        stored
          .filter((r) => !r.hidden)
          .map((r) => [
            key(r.aliasId, r.country),
            {
              aliasId: r.aliasId,
              country: r.country,
              displayCurrency: r.displayCurrency,
              id: r.id,
            },
          ]),
      );
      const sources = await tx.metaAdObject.findMany({
        where: {
          level: "campaign",
          alias: { tableId: b.tableId },
          aliasCountry: { not: null },
        },
        select: { aliasId: true, aliasCountry: true },
        distinct: ["aliasId", "aliasCountry"],
      });
      for (const s of sources) {
        const k = key(s.aliasId!, s.aliasCountry!);
        if (!hidden.has(k) && !rows.has(k))
          rows.set(k, {
            aliasId: s.aliasId!,
            country: s.aliasCountry!,
            displayCurrency: table!.defaultCurrency,
            id: "",
          });
      }
      for (const a of table!.aliases)
        if (![...rows.values()].some((r) => r.aliasId === a.id))
          rows.set(key(a.id, table!.defaultCountry), {
            aliasId: a.id,
            country: table!.defaultCountry,
            displayCurrency: table!.defaultCurrency,
            id: "",
          });
      if (b.country !== undefined) {
        const seen = new Set<string>();
        for (const r of rows.values()) {
          demand(
            !seen.has(r.aliasId),
            "Hay varias filas del mismo alias con distintos países. Edita esos países por fila para evitar combinar sus datos.",
            409,
          );
          seen.add(r.aliasId);
        }
        for (const r of rows.values())
          if (r.country !== b.country)
            await emptyHiddenDestination(tx, r.aliasId, b.country);
        const persisted = [...rows.values()].filter((r) => r.id);
        if (persisted.length)
          await tx.metaEffectivenessRow.updateMany({
            where: { id: { in: persisted.map((r) => r.id) } },
            data: {
              country: b.country,
              revision: { increment: 1 },
              ...(b.currency !== undefined
                ? { displayCurrency: b.currency }
                : {}),
            },
          });
        const virtual = [...rows.values()].filter((r) => !r.id);
        if (virtual.length)
          await tx.metaEffectivenessRow.createMany({
            data: virtual.map((r) => ({
              aliasId: r.aliasId,
              country: b.country!,
              currency: "",
              displayCurrency: b.currency ?? r.displayCurrency,
              revision: 1,
            })),
          });
        const markers = [...rows.values()]
          .filter((r) => r.country !== b.country)
          .map((r) => ({
            aliasId: r.aliasId,
            country: r.country,
            currency: "",
            hidden: true,
            revision: 1,
          }));
        if (markers.length)
          await tx.metaEffectivenessRow.createMany({
            data: markers,
            skipDuplicates: true,
          });
      } else if (b.currency !== undefined) {
        await tx.metaEffectivenessRow.createMany({
          data: [...rows.values()]
            .filter((r) => !r.id)
            .map((r) => ({
              aliasId: r.aliasId,
              country: r.country,
              currency: "",
              displayCurrency: b.currency!,
            })),
          skipDuplicates: true,
        });
        await tx.metaEffectivenessRow.updateMany({
          where: {
            legacy: false,
            hidden: false,
            alias: { tableId: b.tableId },
          },
          data: { displayCurrency: b.currency, revision: { increment: 1 } },
        });
      }
      const row = await tx.metaAliasTable.update({
        where: { id: b.tableId },
        data: {
          ...(b.aliasColumnName !== undefined
            ? { aliasColumnName: b.aliasColumnName }
            : {}),
          ...(b.country !== undefined ? { defaultCountry: b.country } : {}),
          ...(b.currency !== undefined ? { defaultCurrency: b.currency } : {}),
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_COLUMNAS",
          resourceId: b.tableId,
          detail: {
            country: b.country ?? null,
            currency: b.currency ?? null,
            aliasColumnName: b.aliasColumnName ?? null,
          },
        },
      });
      return { ok: true, table: row };
    },
    { timeout: 60000 },
  );
}
