import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import {
  ownerOnly,
  financialAccess,
  financialContext,
  scopePermission,
} from "./financial-access";
import {
  effectiveness,
  effectivenessLock,
  type EffectivenessCell,
} from "./effectiveness";
import { convertMoney, type FxRates } from "./exchange-rates";
import { linkCoversDay, linkMetrics } from "./column-link-policy";
import { limaDay } from "./advisor-attribution";
import { categoryKey } from "./category-paste";
import {
  trialAssessment,
  trialDays,
  type TrialPayload,
  type TrialItem,
  type TrialCycle,
} from "./inventory-trial-policy";
import { isCountryCode } from "./countries";
import type { Actor } from "./service";
const id = z.string().min(1).max(100),
  day = z.string().date(),
  country = z.string().refine(isCountryCode, "País no válido."),
  rules = z
    .object({
      zero: z.number().positive().max(1000000),
      perSale: z.number().positive().max(1000000),
    })
    .strict();
const scope = z.object({ listId: id }).strict();
export const trialQuery = scope;
export const trialReportQuery = scope
  .extend({
    groupId: id,
    until: day.optional(),
    slotId: id.optional(),
    country: country.optional(),
  })
  .strict();
const edit = { listId: id, groupId: id, revision: z.number().int().positive() };
export const trialChange = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE"),
      requestId: z.string().uuid().optional(),
      listId: id,
      name: z.string().trim().min(1).max(100),
      itemIds: z.array(id).min(1).max(100),
      countries: z.array(country).min(1).max(20),
      since: day,
      reserve: z.boolean(),
      diverse: z.boolean(),
      rules,
    })
    .strict(),
  z.object({ ...edit, action: z.literal("RULES"), rules }).strict(),
  z
    .object({
      ...edit,
      action: z.literal("COUNTRIES"),
      countries: z.array(country).min(1).max(20),
      since: day,
    })
    .strict(),
  z
    .object({
      ...edit,
      action: z.literal("RENAME"),
      name: z.string().trim().min(1).max(100),
    })
    .strict(),
  z.object({ ...edit, action: z.literal("ARCHIVE") }).strict(),
  z
    .object({
      ...edit,
      action: z.enum(["PAUSE", "RESUME", "RESTART", "START_DATE"]),
      country,
      slotIds: z.array(id).min(1).max(100),
      date: day,
    })
    .strict(),
  z
    .object({
      ...edit,
      action: z.literal("DECISION"),
      country,
      slotIds: z.array(id).min(1).max(100),
      decision: z.enum(["AUTO", "KEEP", "REPLACE"]),
    })
    .strict(),
  z
    .object({
      ...edit,
      action: z.literal("REPLACE"),
      country,
      date: day,
      replacements: z
        .array(z.object({ slotId: id, itemId: id }).strict())
        .min(1)
        .max(100),
    })
    .strict(),
]);
const json = (p: TrialPayload) => p as unknown as Prisma.InputJsonValue;
const today = () => limaDay(new Date());
const shift = (d: string, n: number) =>
  new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
function dateCheck(d: string) {
  demand(
    d <= today() && d >= shift(today(), -365),
    "Elige una fecha de los últimos 366 días, hasta hoy.",
  );
}
async function context(
  tx: Prisma.TransactionClient,
  actor: Actor,
  listId: string,
  write = false,
) {
  ownerOnly(actor);
  await effectivenessLock(tx, actor);
  const access = await financialAccess(actor, tx),
    cap = financialContext(actor),
    permission = scopePermission(access, cap?.scope ?? "ALL");
  demand(
    permission && (!write || permission === "EDIT"),
    "No tienes permiso para editar estos grupos.",
    403,
  );
  demand(
    access.isOwner ||
      scopePermission(access, "ALL") ||
      cap?.scope === "TAB:" + listId,
    "El inventario no coincide con el documento compartido.",
    403,
  );
  demand(
    await tx.metaEffectivenessSheet.findFirst({
      where: { id: listId, kind: "INVENTORY", archivedAt: null },
      select: { id: true },
    }),
    "Inventario no disponible.",
    404,
  );
  return permission;
}
async function catalog(
  tx: Prisma.TransactionClient,
  listId: string,
): Promise<TrialItem[]> {
  const [items, aliases] = await Promise.all([
    tx.metaInventoryItem.findMany({
      where: { sheetId: listId },
      select: {
        id: true,
        name: true,
        categories: {
          select: {
            category: { select: { id: true, name: true, kind: true } },
          },
        },
      },
    }),
    tx.metaAlias.findMany({
      where: { inventorySheetId: listId },
      select: {
        id: true,
        name: true,
        categoryAssignments: {
          select: {
            category: { select: { id: true, name: true, kind: true } },
          },
        },
      },
    }),
  ]);
  const out = new Map<string, TrialItem>();
  for (const a of aliases) {
    const k = categoryKey(a.name),
      old = out.get(k),
      tags = a.categoryAssignments
        .map((x) => x.category)
        .filter((c) => c.kind === "PRIMARY");
    if (!old)
      out.set(k, {
        id: a.id,
        name: a.name,
        primaryIds: tags.map((c) => c.id),
        primaryNames: tags.map((c) => c.name),
      });
    else
      for (const t of tags)
        if (!old.primaryIds.includes(t.id)) {
          old.primaryIds.push(t.id);
          old.primaryNames.push(t.name);
        }
  }
  for (const a of items) {
    const tags = a.categories
      .map((x) => x.category)
      .filter((c) => c.kind === "PRIMARY");
    out.set(categoryKey(a.name), {
      id: a.id,
      name: a.name,
      primaryIds: tags.map((c) => c.id),
      primaryNames: tags.map((c) => c.name),
    });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
async function canonical(
  tx: Prisma.TransactionClient,
  listId: string,
  item: TrialItem,
) {
  const existing = await tx.metaInventoryItem.findFirst({
    where: { id: item.id, sheetId: listId },
    select: { id: true, name: true },
  });
  if (existing) return existing;
  const alias = await tx.metaAlias.findFirst({
    where: { id: item.id, inventorySheetId: listId },
    include: { categoryAssignments: { select: { categoryId: true } } },
  });
  demand(alias, "Un diplomado ya no está disponible.", 409);
  return tx.metaInventoryItem.upsert({
    where: { sheetId_name: { sheetId: listId, name: alias.name } },
    update: {},
    create: {
      sheetId: listId,
      name: alias.name,
      categories: {
        create: alias.categoryAssignments.map((c) => ({
          categoryId: c.categoryId,
        })),
      },
    },
    select: { id: true, name: true },
  });
}
function serialize(g: {
  id: string;
  name: string;
  revision: number;
  payload: Prisma.JsonValue;
  createdAt: Date;
}) {
  return {
    id: g.id,
    name: g.name,
    revision: g.revision,
    createdAt: g.createdAt.toISOString(),
    ...(g.payload as unknown as TrialPayload),
  };
}
export type TrialGroup = ReturnType<typeof serialize>;
export async function inventoryTrials(actor: Actor, input: unknown) {
  const b = scope.parse(input);
  return db.$transaction(
    async (tx) => {
      const permission = await context(tx, actor, b.listId);
      return {
        listId: b.listId,
        canEdit: permission === "EDIT",
        catalog: await catalog(tx, b.listId),
        groups: (
          await tx.metaInventoryTrialGroup.findMany({
            where: { sheetId: b.listId, archivedAt: null },
            orderBy: { createdAt: "asc" },
          })
        ).map(serialize),
      };
    },
    { timeout: 30000 },
  );
}
export async function saveInventoryTrial(actor: Actor, input: unknown) {
  const b = trialChange.parse(input);
  return db.$transaction(
    async (tx) => {
      await context(tx, actor, b.listId, true);
      if (b.action === "CREATE") {
        const requestHash = createHash("sha256")
          .update(JSON.stringify(b))
          .digest("hex");
        if (b.requestId) {
          const prior = await tx.metaInventoryTrialGroup.findUnique({
            where: { id: b.requestId },
          });
          if (prior) {
            demand(
              prior.sheetId === b.listId &&
                (prior.payload as unknown as TrialPayload).requestHash ===
                  requestHash,
              "Esta solicitud ya creó un grupo. Actualiza para revisarlo.",
              409,
            );
            return serialize(prior);
          }
        }

        dateCheck(b.since);
        demand(
          new Set(b.itemIds).size === b.itemIds.length &&
            new Set(b.countries).size === b.countries.length,
          "No repitas diplomados ni países.",
        );
        demand(
          (await tx.metaInventoryTrialGroup.count({
            where: { sheetId: b.listId, archivedAt: null },
          })) < 100,
          "Archiva un grupo antes de crear más.",
        );
        const source = await catalog(tx, b.listId),
          chosen = b.itemIds.map((id) => source.find((i) => i.id === id));
        demand(
          chosen.every(Boolean),
          "Un diplomado cambió. Actualiza la selección.",
          409,
        );
        if (b.diverse) {
          const used = new Set<string>();
          for (const i of chosen) {
            demand(
              i!.primaryIds.length && !i!.primaryIds.some((id) => used.has(id)),
              "La propuesta repite categorías principales o incluye una sin categoría. Revísala.",
              409,
            );
            i!.primaryIds.forEach((id) => used.add(id));
          }
        }
        const members = [];
        for (const i of chosen) {
          const item = await canonical(tx, b.listId, i!);
          members.push({
            slotId: randomUUID(),
            itemId: item.id,
            name: item.name,
          });
        }
        const p: TrialPayload = {
          requestHash,
          members,
          countries: b.countries,
          reserve: b.reserve,
          rules: b.rules,
          cycles: b.reserve
            ? []
            : members.flatMap((m) =>
                b.countries.map((country) => ({
                  id: randomUUID(),
                  ...m,
                  country,
                  since: b.since,
                  until: null,
                  pauses: [],
                  decision: "AUTO" as const,
                })),
              ),
        };
        const g = await tx.metaInventoryTrialGroup.create({
          data: {
            ...(b.requestId ? { id: b.requestId } : {}),
            sheetId: b.listId,
            name: b.name,
            payload: json(p),
          },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "INVENTARIO_GRUPO_CREADO",
            resourceId: g.id,
            detail: { items: members.length, countries: b.countries.length },
          },
        });
        return serialize(g);
      }
      const g = await tx.metaInventoryTrialGroup.findFirst({
        where: { id: b.groupId, sheetId: b.listId, archivedAt: null },
      });
      demand(g, "Grupo no disponible.", 404);
      demand(
        g.revision === b.revision,
        "El grupo cambió. Actualiza antes de guardar.",
        409,
      );
      const p = g.payload as unknown as TrialPayload;
      if (b.action === "RULES") p.rules = b.rules;
      if (b.action === "COUNTRIES") {
        dateCheck(b.since);
        demand(
          new Set(b.countries).size === b.countries.length,
          "No repitas países.",
        );
        if (!p.reserve)
          for (const code of b.countries)
            if (!p.cycles.some((c) => c.country === code && !c.until))
              for (const m of p.members)
                p.cycles.push({
                  id: randomUUID(),
                  ...m,
                  country: code,
                  since: b.since,
                  until: null,
                  pauses: [],
                  decision: "AUTO",
                });
        p.countries = b.countries;
      }

      if ("country" in b) {
        demand(
          p.countries.includes(b.country),
          "Este país no pertenece al grupo.",
        );
        demand(
          !p.reserve,
          "El grupo de reserva no tiene evaluaciones activas.",
        );
      }
      if ("slotIds" in b) {
        demand(
          new Set(b.slotIds).size === b.slotIds.length &&
            b.slotIds.every((s) => p.members.some((m) => m.slotId === s)),
          "Selecciona filas válidas del grupo.",
        );
        for (const slot of b.slotIds) {
          const c = p.cycles.find(
            (c) => c.slotId === slot && c.country === b.country && !c.until,
          );
          demand(c, "Evaluación no disponible.", 409);
          if (b.action === "DECISION") c.decision = b.decision;
          else {
            dateCheck(b.date);
            demand(
              b.action === "START_DATE" || b.date >= c.since,
              "La fecha no puede ser anterior al inicio del ciclo.",
            );
            const pause = c.pauses.find((p) => !p.until);
            if (b.action === "START_DATE") {
              const previous = p.cycles
                .filter(
                  (x) =>
                    x.id !== c.id &&
                    x.slotId === c.slotId &&
                    x.country === c.country &&
                    x.until,
                )
                .sort((a, b) => b.until!.localeCompare(a.until!))[0];
              demand(
                !previous ||
                  (previous.itemId === c.itemId
                    ? b.date > previous.until!
                    : b.date >= previous.until!),
                "El inicio no puede cruzarse con un ciclo anterior.",
              );
              c.since = b.date;
            }
            if (b.action === "PAUSE") {
              demand(!pause, "Ya está pausado.", 409);
              c.pauses.push({ since: b.date, until: null });
            }
            if (b.action === "RESUME") {
              demand(pause, "No hay pausa abierta.", 409);
              demand(
                b.date >= pause.since,
                "La reanudación no puede preceder a la pausa.",
              );
              if (b.date === pause.since)
                c.pauses = c.pauses.filter((x) => x !== pause);
              else pause.until = shift(b.date, -1);
            }
            if (b.action === "RESTART") {
              demand(
                b.date > c.since,
                "El nuevo ciclo debe empezar después del actual.",
              );
              c.until = shift(b.date, -1);
              p.cycles.push({
                ...c,
                id: randomUUID(),
                since: b.date,
                until: null,
                pauses: [],
                decision: "AUTO",
              });
            }
          }
        }
      }
      if (b.action === "REPLACE") {
        dateCheck(b.date);
        demand(
          new Set(b.replacements.map((r) => r.slotId)).size ===
            b.replacements.length,
          "No repitas filas.",
        );
        const source = await catalog(tx, b.listId),
          others = await tx.metaInventoryTrialGroup.findMany({
            where: { sheetId: b.listId, archivedAt: null, id: { not: g.id } },
            select: { payload: true },
          });
        const used = new Set(
          others.flatMap((x) =>
            (x.payload as unknown as TrialPayload).cycles
              .filter((c) => c.country === b.country)
              .map((c) => c.itemId),
          ),
        );
        const replacing = new Set(b.replacements.map((r) => r.slotId));
        for (const c of p.cycles)
          if (c.country === b.country && (c.until || !replacing.has(c.slotId)))
            used.add(c.itemId);
        for (const r of b.replacements) {
          const c = p.cycles.find(
            (c) => c.slotId === r.slotId && c.country === b.country && !c.until,
          );
          demand(
            c && b.date >= c.since,
            "La fila o su fecha no son válidas.",
            409,
          );
          const candidate = source.find((i) => i.id === r.itemId);
          demand(candidate, "Un reemplazo ya no está disponible.", 409);
          const item = await canonical(tx, b.listId, candidate);
          demand(
            !used.has(item.id) && item.id !== c.itemId,
            "Un reemplazo ya se está evaluando en este país.",
            409,
          );
          used.add(item.id);
          c.until = b.date;
          p.cycles.push({
            id: randomUUID(),
            slotId: c.slotId,
            itemId: item.id,
            name: item.name,
            country: b.country,
            since: b.date,
            until: null,
            pauses: [],
            decision: "AUTO",
          });
        }
      }
      demand(
        p.cycles.length <= 10000,
        "Este grupo alcanzó su límite de historial. Crea un grupo nuevo.",
      );
      const updated = await tx.metaInventoryTrialGroup.update({
        where: { id: g.id },
        data: {
          payload: json(p),
          revision: { increment: 1 },
          ...(b.action === "RENAME" ? { name: b.name } : {}),
          ...(b.action === "ARCHIVE" ? { archivedAt: new Date() } : {}),
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "INVENTARIO_GRUPO_ACTUALIZADO",
          resourceId: g.id,
          detail: { action: b.action },
        },
      });
      return serialize(updated);
    },
    { timeout: 60000 },
  );
}

type Metric = "sales" | "budget" | "spend";
type SourceDay = {
  sales: number | null;
  budget: number | null;
  spend: number | null;
  complete: Record<Metric, boolean>;
  updatedAt: string | null;
};
export async function inventoryTrialReport(actor: Actor, input: unknown) {
  const b = trialReportQuery.parse(input),
    until = b.until ?? today();
  dateCheck(until);
  return db.$transaction(
    async (tx) => {
      await context(tx, actor, b.listId);
      const g = await tx.metaInventoryTrialGroup.findFirst({
        where: { id: b.groupId, sheetId: b.listId, archivedAt: null },
      });
      demand(g, "Grupo no disponible.", 404);
      const group = serialize(g),
        cycles = [
          ...new Map(
            group.cycles
              .filter(
                (c) =>
                  group.countries.includes(c.country) &&
                  c.since <= until &&
                  (!c.until || c.until >= until),
              )
              .map((c) => [JSON.stringify([c.slotId, c.country]), c]),
          ).values(),
        ];
      const relevantCycles = cycles.filter(
        (c) =>
          (!b.slotId || c.slotId === b.slotId) &&
          (!b.country || c.country === b.country),
      );
      const items = await tx.metaInventoryItem.findMany({
          where: {
            sheetId: b.listId,
            id: { in: [...new Set(relevantCycles.map((c) => c.itemId))] },
          },
          select: { id: true, name: true },
        }),
        byName = new Map(items.map((i) => [categoryKey(i.name), i.id]));
      const aliases = await tx.metaAlias.findMany({
          where: {
            inventorySheetId: b.listId,
            name: { in: items.map((i) => i.name) },
          },
          select: { id: true, name: true, tableId: true },
        }),
        aliasItems = new Map(
          aliases.map((a) => [a.id, byName.get(categoryKey(a.name))!]),
        );
      const since = relevantCycles.reduce(
        (d, c) => (c.since < d ? c.since : d),
        until,
      );
      demand(
        since >= shift(until, -365),
        "El ciclo supera 366 días. Inicia uno nuevo para evaluar.",
      );
      const fx = await tx.metaFxDay.findMany({
          where: { day: { gte: since, lte: until } },
          select: { day: true, rates: true },
        }),
        rates = new Map(fx.map((r) => [r.day, r.rates as FxRates]));
      const links = await tx.metaEffectivenessLink.findMany(),
        linkMap = new Map(links.map((l) => [l.tableId, l]));
      function origin(table: string, metric: Metric, day: string) {
        const seen = new Set<string>();
        let current = table;
        while (!seen.has(current)) {
          seen.add(current);
          const link = linkMap.get(current);
          if (
            !link ||
            !linkCoversDay(link, day) ||
            !linkMetrics(link).includes(metric)
          )
            break;
          current = link.sourceTableId;
        }
        return current;
      }
      const campaignHealth = await tx.metaAdObject.findMany({
        where: { level: "campaign", aliasId: { in: aliases.map((a) => a.id) } },
        select: {
          aliasId: true,
          aliasCountry: true,
          account: {
            select: {
              syncedAt: true,
              syncError: true,
              connection: { select: { disconnectedAt: true } },
            },
          },
        },
      });
      const fresh = new Map<string, boolean>();
      for (const a of aliases)
        for (const code of group.countries) {
          const matches = campaignHealth.filter(
            (c) => c.aliasId === a.id && c.aliasCountry === code,
          );
          fresh.set(
            JSON.stringify([a.id, code]),
            !!matches.length &&
              matches.every(
                (c) =>
                  c.account.syncedAt &&
                  !c.account.syncError &&
                  !c.account.connection.disconnectedAt &&
                  (until === today()
                    ? Date.now() - c.account.syncedAt.getTime() <= 3600000
                    : c.account.syncedAt.getTime() >=
                      Date.parse(until + "T23:59:59-05:00")),
              ),
          );
        }
      const values = new Map<string, SourceDay>(),
        seenMetric = new Map<
          string,
          {
            value: number | null;
            complete: boolean;
            conflict: boolean;
            metric: Metric;
            item: string;
            country: string;
            date: string;
            updatedAt: string | null;
          }
        >();
      const dayKey = (item: string, country: string, day: string) =>
        JSON.stringify([item, country, day]);
      for (const tableId of new Set(aliases.map((a) => a.tableId))) {
        const sheet = await effectiveness(actor, tableId, since, until, tx);
        for (const row of sheet.rows) {
          const item = aliasItems.get(row.aliasId);
          if (!item || !group.countries.includes(row.country)) continue;
          for (const date of trialDays(since, until, [])) {
            const c: EffectivenessCell | undefined = row.days[date];
            for (const metric of ["sales", "budget", "spend"] as const) {
              let amount = c?.[metric] ?? null;
              if (metric !== "sales" && amount !== null)
                amount = convertMoney(
                  amount,
                  row.currency,
                  "PEN",
                  rates.get(date),
                );
              const complete =
                amount !== null &&
                !c?.na.includes(metric) &&
                !c?.partialMetrics.includes(metric) &&
                !c?.fxPending.includes(metric) &&
                (metric !== "spend" ||
                  (row.campaigns > 0 &&
                    c?.campaigns === row.campaigns &&
                    (!c?.manual.includes("spend") || !!c.linked.spend) &&
                    !!fresh.get(JSON.stringify([row.aliasId, row.country]))));
              const root = origin(tableId, metric, date),
                dedup = JSON.stringify([item, row.country, date, metric, root]),
                previous = seenMetric.get(dedup);
              if (previous) {
                if (
                  amount !== null &&
                  previous.value !== null &&
                  Math.abs(amount - previous.value) > 0.000001
                )
                  previous.conflict = true;
                if (previous.value === null && amount !== null) {
                  previous.value = amount;
                  previous.complete = complete;
                } else if (amount !== null) previous.complete ||= complete;
                if (
                  c?.updatedAt &&
                  (!previous.updatedAt || c.updatedAt < previous.updatedAt)
                )
                  previous.updatedAt = c.updatedAt;
              } else
                seenMetric.set(dedup, {
                  value: amount,
                  complete,
                  conflict: false,
                  metric,
                  item,
                  country: row.country,
                  date,
                  updatedAt: c?.updatedAt ?? null,
                });
            }
          }
        }
      }
      for (const source of seenMetric.values()) {
        const k = dayKey(source.item, source.country, source.date),
          v = values.get(k) ?? {
            sales: null,
            budget: null,
            spend: null,
            complete: { sales: true, budget: true, spend: true },
            updatedAt: null,
          };
        if (source.value !== null)
          v[source.metric] = (v[source.metric] ?? 0) + source.value;
        v.complete[source.metric] &&= source.complete && !source.conflict;
        if (
          source.updatedAt &&
          (!v.updatedAt || source.updatedAt < v.updatedAt)
        )
          v.updatedAt = source.updatedAt;
        values.set(k, v);
      }
      const rows = relevantCycles.map((c) => {
        const dates = trialDays(c.since, until, c.pauses),
          daily = dates.map((day) => ({
            day,
            ...(values.get(dayKey(c.itemId, c.country, day)) ?? {
              sales: null,
              budget: null,
              spend: null,
              complete: { sales: false, budget: false, spend: false },
              updatedAt: null,
            }),
          }));
        const total = (metric: Metric) => {
          const known = daily.filter((d) => d[metric] !== null);
          return {
            value: known.length
              ? known.reduce((n, d) => n + d[metric]!, 0)
              : null,
            complete:
              daily.length > 0 &&
              known.length === daily.length &&
              daily.every((d) => d.complete[metric]),
          };
        };
        const sales = total("sales"),
          budget = total("budget"),
          spend = total("spend"),
          paused = c.pauses.some(
            (p) => p.since <= until && (!p.until || p.until >= until),
          ),
          available = items.some((i) => i.id === c.itemId);
        return {
          cycleId: c.id,
          slotId: c.slotId,
          itemId: c.itemId,
          name: items.find((i) => i.id === c.itemId)?.name ?? c.name,
          country: c.country,
          since: c.since,
          activeDays: dates.length,
          paused,
          available,
          decision: c.decision,
          sales: sales.value,
          budget: budget.value,
          spend: spend.value,
          complete: {
            sales: sales.complete,
            budget: budget.complete,
            spend: spend.complete,
          },
          budgetEvaluation: trialAssessment(
            sales.value,
            budget.value,
            available && sales.complete && budget.complete,
            group.rules,
          ),
          metaEvaluation: trialAssessment(
            sales.value,
            spend.value,
            available && sales.complete && spend.complete,
            group.rules,
          ),
          salesPerDay:
            sales.value === null || !dates.length
              ? null
              : sales.value / dates.length,
          budgetPerSale:
            sales.value && budget.value !== null
              ? budget.value / sales.value
              : null,
          spendPerSale:
            sales.value && spend.value !== null
              ? spend.value / sales.value
              : null,
          daily: b.slotId ? daily : [],
        };
      });
      return {
        groupId: g.id,
        revision: g.revision,
        until,
        currency: "PEN",
        rows,
        generatedAt: new Date().toISOString(),
      };
    },
    { timeout: 120000, isolationLevel: "RepeatableRead" },
  );
}
export type TrialDirectory = Awaited<ReturnType<typeof inventoryTrials>>;
export type TrialReport = Awaited<ReturnType<typeof inventoryTrialReport>>;
