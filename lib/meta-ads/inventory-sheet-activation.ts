import { z } from "zod";
import { inventoryUsage } from "./inventory-usage";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import {
  effectivenessLock,
  inventoryEffectivenessSource,
  type EffectivenessRow,
} from "./effectiveness";
import {
  ownerOnly,
  financialAccess,
  financialContext,
  scopePermission,
  checkFinancialContext,
} from "./financial-access";
import { categoryKey } from "./category-paste";
import { isCountryCode } from "./countries";
import { resolveCountry } from "./effectiveness-paste";
import { limaDay } from "./advisor-attribution";
import {
  defaultInventoryLimits,
  inventoryFactorAssessment,
} from "./inventory-factor-policy";
import { trialAssessment, trialDays } from "./inventory-trial-policy";
import { convertMoney, type FxRates } from "./exchange-rates";
import type { Actor } from "./service";
type Tx = Prisma.TransactionClient;
const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(150);
export type InventoryCampaignTask = "NONE" | "CREATE" | "STOP";
type Control = {
  pinned: boolean;
  campaignTask?: InventoryCampaignTask;
  pendingAssignmentAt?: string;
};
type Settings = {
  detachedAliases: string[];
  sheets: string[];
  countries: Record<string, string[]>;
  rows: Record<string, Control>;
  limits: number[];
};
export const activationSettings = (config: Prisma.JsonValue): Settings => {
  const v = (config as Record<string, unknown>)?.inventoryActivation as
    Partial<Settings> | undefined;
  return {
    detachedAliases: Array.isArray(v?.detachedAliases)
      ? v.detachedAliases.filter((x) => typeof x === "string")
      : [],
    countries:
      v?.countries &&
      typeof v.countries === "object" &&
      !Array.isArray(v.countries)
        ? Object.fromEntries(
            Object.entries(v.countries)
              .filter(([, value]) => Array.isArray(value))
              .map(([key, value]) => [
                key,
                [...new Set(value.filter(isCountryCode))],
              ]),
          )
        : {},
    limits:
      Array.isArray(v?.limits) &&
      v.limits.length > 0 &&
      v.limits.every(
        (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
      )
        ? v.limits.slice(0, 101)
        : defaultInventoryLimits(),
    sheets: Array.isArray(v?.sheets)
      ? v.sheets.filter((x) => typeof x === "string")
      : [],
    rows:
      v?.rows && typeof v.rows === "object" && !Array.isArray(v.rows)
        ? v.rows
        : {},
  };
};
const rowKey = (aliasId: string, country: string) => aliasId + "|" + country;
async function context(tx: Tx, actor: Actor, listId: string, write = false) {
  ownerOnly(actor);
  await effectivenessLock(tx, actor);
  const access = await financialAccess(actor, tx),
    cap = financialContext(actor);
  demand(
    access.isOwner ||
      scopePermission(access, "ALL") ||
      cap?.scope === "TAB:" + listId,
    "Inventario fuera del documento compartido.",
    403,
  );
  const permission = scopePermission(access, cap?.scope ?? "ALL");
  demand(
    permission && (!write || permission === "EDIT"),
    "Sin permiso de edición.",
    403,
  );
  const list = await tx.metaEffectivenessSheet.findFirst({
    where: { id: listId, kind: "INVENTORY", archivedAt: null },
  });
  demand(list, "Inventario no disponible.", 404);
  return { list, access, canEdit: permission === "EDIT" };
}
async function items(tx: Tx, listId: string) {
  const [catalog, aliases] = await Promise.all([
    tx.metaInventoryItem.findMany({
      where: { sheetId: listId },
      select: { name: true },
    }),
    tx.metaAlias.findMany({
      where: { inventorySheetId: listId },
      select: { name: true },
    }),
  ]);
  return new Map(
    [...aliases, ...catalog].map((i) => [categoryKey(i.name), i.name]),
  );
}
export async function inventoryActivationDirectory(
  actor: Actor,
  input: unknown,
) {
  const q = z.object({ listId: id }).strict().parse(input);
  return db.$transaction(async (tx) => {
    const { list, canEdit, access } = await context(tx, actor, q.listId),
      settings = activationSettings(list.config);
    const linked = await tx.metaAlias.findMany({
        where: { inventorySheetId: q.listId },
        select: {
          tableId: true,
          effectivenessRows: {
            where: { legacy: false },
            select: { country: true },
          },
          effectivenessStates: { select: { country: true } },
        },
      }),
      visible = new Set([...settings.sheets, ...linked.map((a) => a.tableId)]);
    const tables = await tx.metaAliasTable.findMany({
      where:
        access.isOwner || scopePermission(access, "ALL")
          ? {}
          : { id: { in: [...visible] } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultCountry: true,
        defaultCurrency: true,
      },
    });
    return {
      revision: list.revision,
      limits: settings.limits,
      canEdit,
      canCreate:
        canEdit &&
        (access.isOwner || scopePermission(access, "ALL") === "EDIT"),
      tables,
      selected: tables.filter((t) => visible.has(t.id)).map((t) => t.id),
      columns: tables
        .filter((t) => visible.has(t.id))
        .flatMap((t) => {
          const countryList = [
            ...new Set([
              ...(settings.countries[t.id] ?? []),
              ...linked
                .filter((a) => a.tableId === t.id)
                .flatMap((a) =>
                  [...a.effectivenessRows, ...a.effectivenessStates].map(
                    (r) => r.country,
                  ),
                ),
              ...(isCountryCode(t.defaultCountry) ? [t.defaultCountry] : []),
            ]),
          ].filter(isCountryCode);
          if (!countryList.length) {
            const code = resolveCountry(t.name);
            if (code) countryList.push(code);
          }
          return countryList.length
            ? countryList.map((country) => ({
                id: t.id + ":" + country,
                tableId: t.id,
                country,
                name: t.name,
              }))
            : [{ id: t.id, tableId: t.id, country: "", name: t.name }];
        }),
    };
  });
}
export async function saveInventoryFactorLimits(actor: Actor, input: unknown) {
  const b = z
    .object({
      listId: id,
      revision: z.number().int().positive(),
      limits: z
        .array(z.number().finite().min(0.01).max(10000000))
        .min(1)
        .max(101),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    const { list } = await context(tx, actor, b.listId, true);
    demand(
      list.revision === b.revision,
      "La configuración cambió. Cierra y vuelve a abrir Factor antes de guardar.",
      409,
    );
    const settings = activationSettings(list.config);
    settings.limits = b.limits;
    const updated = await tx.metaEffectivenessSheet.update({
      where: { id: list.id },
      data: {
        config: {
          ...(list.config as Record<string, Prisma.JsonValue>),
          inventoryActivation: settings as unknown as Prisma.InputJsonValue,
        },
        revision: { increment: 1 },
      },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "INVENTARIO_LIMITES_FX",
        resourceId: list.id,
        detail: { salesRows: b.limits.length },
      },
    });
    return { revision: updated.revision, limits: b.limits };
  });
}
export async function inventoryActivationAddSheet(
  actor: Actor,
  input: unknown,
) {
  const b = z
    .object({
      listId: id,
      tableId: id.optional(),
      name: name.optional(),
      country: z.string().refine(isCountryCode).optional(),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    const { list, access } = await context(tx, actor, b.listId, true);
    const config = (list.config ?? {}) as Record<string, Prisma.JsonValue>,
      settings = activationSettings(list.config);
    let table;
    if (b.tableId) {
      table = await tx.metaAliasTable.findUnique({ where: { id: b.tableId } });
      demand(table, "Hoja no disponible.", 404);
      demand(
        access.isOwner ||
          scopePermission(access, "ALL") === "EDIT" ||
          scopePermission(access, "TABLE:" + table.id) === "EDIT",
        "La hoja de destino no está compartida con edición.",
        403,
      );
    } else {
      demand(
        access.isOwner || scopePermission(access, "ALL") === "EDIT",
        "Crear hojas requiere acceso de edición a toda Efectividad.",
        403,
      );
      demand(b.name && b.country, "Indica nombre y país.");
      demand((await tx.metaAliasTable.count()) < 100, "Máximo100 hojas.");
      demand(
        !(await tx.metaAliasTable.findFirst({
          where: { name: { equals: b.name, mode: "insensitive" } },
        })),
        "Ya existe esa hoja. Elígela en la lista.",
        409,
      );
      table = await tx.metaAliasTable.create({
        data: {
          name: b.name,
          defaultCountry: b.country,
          defaultCurrency:
            b.country === "PE"
              ? "PEN"
              : b.country === "BO"
                ? "BOB"
                : b.country === "CO"
                  ? "COP"
                  : b.country === "EC"
                    ? "USD"
                    : "",
        },
      });
    }
    if (b.country)
      settings.countries[table.id] = [
        ...new Set([...(settings.countries[table.id] ?? []), b.country]),
      ];
    settings.sheets = [...new Set([...settings.sheets, table.id])];
    await tx.metaEffectivenessSheet.update({
      where: { id: list.id },
      data: {
        config: {
          ...config,
          inventoryActivation: settings as unknown as Prisma.InputJsonValue,
        },
        revision: { increment: 1 },
      },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "INVENTARIO_HOJA_EVALUACION",
        resourceId: list.id,
        detail: { tableId: table.id, created: !b.tableId },
      },
    });
    return table;
  });
}
/** Shared by Inventory and the financial sheet controls. Only explicitly managed rows change visibility. */
export async function syncInventoryActivationVisibility(
  tx: Tx,
  targets: { aliasId: string; country: string; active: boolean }[],
  removed = false,
) {
  const aliases = await tx.metaAlias.findMany({
    where: { id: { in: targets.map((t) => t.aliasId) } },
    select: {
      id: true,
      name: true,
      inventorySheetId: true,
      categoryAssignments: { select: { categoryId: true } },
      inventorySheet: { select: { id: true, config: true } },
    },
  });
  const lists = new Map(
    aliases.map((a) => [a.inventorySheet.id, a.inventorySheet]),
  );
  for (const list of lists.values()) {
    const settings = activationSettings(list.config);
    const own = aliases.filter((a) => a.inventorySheetId === list.id);
    for (const t of targets.filter((t) =>
      own.some((a) => a.id === t.aliasId),
    )) {
      const key = rowKey(t.aliasId, t.country),
        control = settings.rows[key];
      settings.rows[key] = {
        ...control,
        pinned: removed ? false : !t.active ? true : (control?.pinned ?? false),
        campaignTask: "NONE",
      };
      await tx.metaEffectivenessRow.updateMany({
        where: { aliasId: t.aliasId, country: t.country },
        data: {
          hidden: removed || settings.detachedAliases.includes(t.aliasId),
          revision: { increment: 1 },
        },
      });
    }
    if (removed)
      for (const a of own) {
        const item = await tx.metaInventoryItem.upsert({
          where: { sheetId_name: { sheetId: list.id, name: a.name } },
          create: { sheetId: list.id, name: a.name },
          update: {},
        });
        if (a.categoryAssignments.length)
          await tx.metaInventoryItemCategory.createMany({
            data: a.categoryAssignments.map((c) => ({
              itemId: item.id,
              categoryId: c.categoryId,
            })),
            skipDuplicates: true,
          });
        const visible = await tx.metaEffectivenessRow.count({
          where: { aliasId: a.id, legacy: false, hidden: false },
        });
        if (!visible && !settings.detachedAliases.includes(a.id))
          settings.detachedAliases.push(a.id);
      }
    await tx.metaEffectivenessSheet.update({
      where: { id: list.id },
      data: {
        config: {
          ...(list.config as Prisma.JsonObject),
          inventoryActivation: settings as unknown as Prisma.InputJsonValue,
        },
        revision: { increment: 1 },
      },
    });
  }
}
const target = z
  .object({
    aliasId: id,
    country: z.string().refine(isCountryCode),
    revision: z.number().int().nonnegative(),
  })
  .strict();
async function activationChange(actor: Actor, input: unknown, sharedTx?: Tx) {
  const b = z
    .object({
      listId: id,
      tableId: id,
      country: z.string().refine(isCountryCode).optional(),
      items: z
        .array(z.object({ name, targets: z.array(target).max(250) }).strict())
        .min(1)
        .max(1500),
      active: z.boolean().optional(),
      pinned: z.boolean().optional(),
      campaignTask: z.enum(["NONE", "CREATE", "STOP"]).optional(),
    })
    .strict()
    .refine(
      (v) =>
        v.active !== undefined ||
        v.pinned !== undefined ||
        v.campaignTask !== undefined,
      "Elige activación o fijación.",
    )
    .refine(
      (v) => !(v.active === false && v.campaignTask === "CREATE"),
      "Por hacer campaña requiere activación de la hoja.",
    )
    .parse(input);
  const run = async (tx: Tx) => {
    const { list, access } = await context(tx, actor, b.listId, true),
      settings = activationSettings(list.config),
      catalog = await items(tx, b.listId);
    const table = await tx.metaAliasTable.findUnique({
      where: { id: b.tableId },
    });
    demand(table, "Hoja no disponible.", 404);
    const linked = await tx.metaAlias.findFirst({
      where: { tableId: table.id, inventorySheetId: list.id },
      select: { id: true },
    });
    demand(
      linked ||
        settings.sheets.includes(table.id) ||
        access.isOwner ||
        scopePermission(access, "ALL") === "EDIT" ||
        scopePermission(access, "TABLE:" + table.id) === "EDIT",
      "La hoja de destino no está autorizada.",
      403,
    );
    demand(
      new Set(b.items.map((i) => categoryKey(i.name))).size === b.items.length,
      "Inventario repetido.",
    );
    // Validate the entire selection and every state revision before any mutation.
    const plans = [];
    const tableAliases = await tx.metaAlias.findMany({
      where: { tableId: table.id },
      include: {
        effectivenessStates: true,
        effectivenessRows: { where: { legacy: false } },
      },
    });
    if (b.country)
      demand(
        (settings.countries[table.id] ?? []).includes(b.country) ||
          table.defaultCountry === b.country ||
          resolveCountry(table.name) === b.country ||
          tableAliases.some((a) =>
            [...a.effectivenessRows, ...a.effectivenessStates].some(
              (r) => r.country === b.country,
            ),
          ),
        "Agrega primero este país a la hoja de evaluación.",
        403,
      );
    for (const item of b.items) {
      const real = catalog.get(categoryKey(item.name));
      demand(real, "Un inventario cambió. Actualiza.", 409);
      const matches = tableAliases.filter(
        (a) => categoryKey(a.name) === categoryKey(real),
      );
      demand(
        matches.length <= 1,
        "Hay variantes del diplomado en esta hoja. Revisa las asignaciones antes de continuar.",
        409,
      );
      const alias = matches[0] ?? null;
      demand(
        !alias || alias.inventorySheetId === list.id,
        "El diplomado pertenece a otro Inventario en esta hoja.",
        409,
      );
      const countries = b.country
        ? [b.country]
        : alias
          ? [
              ...new Set([
                ...alias.effectivenessRows.map((r) => r.country),
                ...alias.effectivenessStates.map((s) => s.country),
              ]),
            ]
          : [];
      if (!countries.length) {
        // A sheet explicitly named for a country already supplies that choice.
        // Preserve an explicit default and existing row countries; never use Meta targeting.
        const sheetCountry = isCountryCode(table.defaultCountry)
          ? table.defaultCountry
          : resolveCountry(table.name);
        if (sheetCountry) countries.push(sheetCountry);
      }
      demand(
        countries.length > 0 && countries.every(isCountryCode),
        "No se pudo identificar el país de esta hoja. Usa el nombre del país o su código en la hoja.",
      );
      const current = countries.map((country) => ({
        aliasId: alias?.id ?? "",
        country,
        revision:
          alias?.effectivenessStates.find((s) => s.country === country)
            ?.revision ?? 0,
      }));
      demand(
        (current.length === item.targets.length &&
          current.every((t) =>
            item.targets.some(
              (x) =>
                x.aliasId === t.aliasId &&
                x.country === t.country &&
                x.revision === t.revision,
            ),
          )) ||
          (!item.targets.length &&
            (!alias ||
              countries.every(
                (country) =>
                  !alias.effectivenessStates.some(
                    (s) => s.country === country,
                  ) &&
                  !alias.effectivenessRows.some((r) => r.country === country),
              ))),
        "La activación cambió. Actualiza antes de guardar.",
        409,
      );
      plans.push({ real, alias, countries });
    }
    let changed = 0;
    for (const plan of plans) {
      if (!plan.alias && b.active === false) continue;
      let alias = plan.alias;
      if (!alias) {
        const created = await tx.metaAlias.create({
          data: {
            tableId: table.id,
            inventorySheetId: list.id,
            name: plan.real,
          },
        });
        alias = {
          ...created,
          effectivenessStates: [],
          effectivenessRows: [],
        };
        const source = await tx.metaInventoryItem.findFirst({
          where: { sheetId: list.id, name: plan.real },
          include: { categories: true },
        });
        if (source?.categories.length)
          await tx.metaInventoryCategoryAssignment.createMany({
            data: source.categories.map((c) => ({
              aliasId: created.id,
              categoryId: c.categoryId,
            })),
            skipDuplicates: true,
          });
      }
      const wasDetached = settings.detachedAliases.includes(alias.id);
      if (b.active === true || b.campaignTask === "CREATE" || b.pinned === true)
        settings.detachedAliases = settings.detachedAliases.filter(
          (id) => id !== alias.id,
        );
      for (const country of plan.countries) {
        const old = alias.effectivenessStates.find(
            (s) => s.country === country,
          ),
          key = rowKey(alias.id, country),
          control = settings.rows[key];
        const active =
            b.campaignTask === "CREATE"
              ? true
              : (b.active ?? old?.active ?? (plan.alias ? true : false)),
          pinned = b.pinned ?? control?.pinned ?? false,
          campaignTask =
            b.campaignTask ??
            (b.active !== undefined
              ? "NONE"
              : (control?.campaignTask ?? "NONE"));
        if (
          old &&
          !wasDetached &&
          old.active === active &&
          control?.pinned === pinned &&
          (control?.campaignTask ?? "NONE") === campaignTask
        )
          continue;
        const state = await tx.metaEffectivenessState.upsert({
          where: { aliasId_country: { aliasId: alias.id, country } },
          create: { aliasId: alias.id, country, active, revision: 1 },
          update: { active, revision: { increment: 1 } },
        });
        const needsAssignment =
          active &&
          (b.active === true || b.campaignTask === "CREATE") &&
          (!alias.effectivenessRows.some(
            (row) => row.country === country && row.advisorId,
          ) ||
            !alias.effectivenessRows.some(
              (row) => row.country === country && row.displayCurrency,
            ));
        settings.rows[key] = {
          ...control,
          pinned,
          campaignTask,
          ...(needsAssignment
            ? {
                pendingAssignmentAt:
                  control?.pendingAssignmentAt ?? new Date().toISOString(),
              }
            : {}),
        };
        await tx.metaEffectivenessRow.upsert({
          where: {
            aliasId_country_currency: {
              aliasId: alias.id,
              country,
              currency: "",
            },
          },
          create: {
            aliasId: alias.id,
            country,
            currency: "",
            displayCurrency: table.defaultCurrency,
            hidden:
              settings.detachedAliases.includes(alias.id) ||
              (!active && !pinned),
          },
          update: {
            hidden:
              settings.detachedAliases.includes(alias.id) ||
              (!active && !pinned),
          },
        });
        await tx.metaEffectivenessRow.updateMany({
          where: { aliasId: alias.id, country, legacy: false },
          data: {
            hidden:
              settings.detachedAliases.includes(alias.id) ||
              (!active && !pinned),
          },
        });
        await tx.metaEffectivenessEvent.create({
          data: {
            stateId: state.id,
            actorId: actor.id,
            active,
            snapshot: {
              source: "INVENTORY_SHEET",
              action:
                b.active !== undefined
                  ? "ACTIVATION"
                  : b.pinned !== undefined
                    ? "PIN"
                    : "CAMPAIGN_TASK",
              campaignTask,
              pinned,
              priorActive: old?.active ?? (plan.alias ? true : false),
            },
          },
        });
        changed++;
      }
    }
    for (const aliasId of new Set(
      plans.flatMap((plan) => (plan.alias ? [plan.alias.id] : [])),
    )) {
      const visible = await tx.metaEffectivenessRow.count({
        where: { aliasId, legacy: false, hidden: false },
      });
      if (!visible && !settings.detachedAliases.includes(aliasId)) {
        settings.detachedAliases.push(aliasId);
        const alias = await tx.metaAlias.findUniqueOrThrow({
          where: { id: aliasId },
          include: { categoryAssignments: true },
        });
        const item = await tx.metaInventoryItem.upsert({
          where: { sheetId_name: { sheetId: list.id, name: alias.name } },
          create: { sheetId: list.id, name: alias.name },
          update: {},
        });
        if (alias.categoryAssignments.length)
          await tx.metaInventoryItemCategory.createMany({
            data: alias.categoryAssignments.map((c) => ({
              itemId: item.id,
              categoryId: c.categoryId,
            })),
            skipDuplicates: true,
          });
      }
    }
    settings.sheets = [...new Set([...settings.sheets, table.id])];
    await tx.metaEffectivenessSheet.update({
      where: { id: list.id },
      data: {
        config: {
          ...(list.config as Record<string, Prisma.JsonValue>),
          inventoryActivation: settings as unknown as Prisma.InputJsonValue,
        },
        revision: { increment: 1 },
      },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "INVENTARIO_ACTIVACION_HOJA",
        resourceId: list.id,
        detail: {
          tableId: table.id,
          items: b.items.length,
          changed,
          active: b.active ?? null,
          pinned: b.pinned ?? null,
        },
      },
    });
    return { changed };
  };
  return sharedTx ? run(sharedTx) : db.$transaction(run, { timeout: 120000 });
}
export async function inventoryActivationChange(actor: Actor, input: unknown) {
  return activationChange(actor, input);
}
/** Pair replacement is atomic: retiring item stays on until its campaign is actually stopped. */
async function activationReplace(actor: Actor, input: unknown, sharedTx?: Tx) {
  const choice = z.object({ name, targets: z.array(target).max(250) }).strict();
  const b = z
    .object({
      listId: id,
      tableId: id,
      country: z.string().refine(isCountryCode),
      from: choice,
      to: choice,
      mode: z.enum(["MANUAL", "SAME", "OTHER"]),
    })
    .strict()
    .parse(input);
  demand(
    categoryKey(b.from.name) !== categoryKey(b.to.name),
    "Elige otro diplomado para reemplazar.",
  );
  const run = async (tx: Tx) => {
    const { list } = await context(tx, actor, b.listId, true),
      settings = activationSettings(list.config),
      catalog = await items(tx, b.listId);
    const from = catalog.get(categoryKey(b.from.name)),
      to = catalog.get(categoryKey(b.to.name));
    demand(from && to, "El catálogo cambió. Actualiza y elige de nuevo.", 409);
    const candidates = await tx.metaAlias.findMany({
      where: { tableId: b.tableId },
      include: {
        effectivenessStates: true,
        effectivenessRows: { where: { legacy: false } },
      },
    });
    const candidate = candidates.find(
      (a) => categoryKey(a.name) === categoryKey(to),
    );
    const state = candidate?.effectivenessStates.find(
      (s) => s.country === b.country,
    );
    const pending = candidate
      ? settings.rows[rowKey(candidate.id, b.country)]?.campaignTask
      : "NONE";
    demand(
      !(
        state?.active ??
        candidate?.effectivenessRows.some((r) => r.country === b.country)
      ) &&
        (!pending || pending === "NONE"),
      "El reemplazo ya está activo o tiene una campaña pendiente en este país. Elige otro.",
      409,
    );
    if (b.mode !== "MANUAL") {
      const [canonical, aliases] = await Promise.all([
        tx.metaInventoryItem.findMany({
          where: { sheetId: b.listId, name: { in: [from, to] } },
          include: { categories: { include: { category: true } } },
        }),
        tx.metaAlias.findMany({
          where: { inventorySheetId: b.listId, name: { in: [from, to] } },
          include: { categoryAssignments: { include: { category: true } } },
        }),
      ]);
      const primary = (n: string) =>
        new Set([
          ...canonical
            .filter((i) => i.name === n)
            .flatMap((i) =>
              i.categories
                .filter((c) => c.category.kind === "PRIMARY")
                .map((c) => c.categoryId),
            ),
          ...aliases
            .filter((i) => i.name === n)
            .flatMap((i) =>
              i.categoryAssignments
                .filter((c) => c.category.kind === "PRIMARY")
                .map((c) => c.categoryId),
            ),
        ]);
      const old = primary(from),
        next = primary(to),
        shared = [...next].some((c) => old.has(c));
      demand(
        b.mode === "SAME" ? shared : next.size > 0 && !shared,
        "Las categorías cambiaron. Vuelve a proponer un reemplazo.",
        409,
      );
    }
    await activationChange(
      actor,
      {
        listId: b.listId,
        tableId: b.tableId,
        country: b.country,
        items: [b.from],
        campaignTask: "STOP",
      },
      tx,
    );
    await activationChange(
      actor,
      {
        listId: b.listId,
        tableId: b.tableId,
        country: b.country,
        items: [b.to],
        active: true,
        campaignTask: "CREATE",
      },
      tx,
    );
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "INVENTARIO_REEMPLAZO_PAIS",
        resourceId: b.listId,
        detail: {
          tableId: b.tableId,
          country: b.country,
          from,
          to,
          mode: b.mode,
        },
      },
    });
    return { from, to, country: b.country };
  };
  return sharedTx ? run(sharedTx) : db.$transaction(run, { timeout: 120000 });
}
export async function inventoryActivationReplace(actor: Actor, input: unknown) {
  return activationReplace(actor, input);
}
export async function inventoryActivationReplaceBatch(
  actor: Actor,
  input: unknown,
) {
  const choice = z.object({ name, targets: z.array(target).max(250) }).strict();
  const b = z
    .object({
      listId: id,
      tableId: id,
      country: z.string().refine(isCountryCode),
      replacements: z
        .array(
          z
            .object({
              from: choice,
              to: choice,
              mode: z.enum(["MANUAL", "SAME", "OTHER"]),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict()
    .parse(input);
  const origins = new Set(b.replacements.map((r) => categoryKey(r.from.name)));
  const destinations = new Set(
    b.replacements.map((r) => categoryKey(r.to.name)),
  );
  demand(
    origins.size === b.replacements.length &&
      destinations.size === b.replacements.length &&
      ![...destinations].some((n) => origins.has(n)),
    "No repitas diplomados ni uses uno del bloque que vas a reemplazar.",
  );
  return db.$transaction(
    async (tx) => {
      const results = [];
      for (const replacement of b.replacements)
        results.push(
          await activationReplace(
            actor,
            {
              listId: b.listId,
              tableId: b.tableId,
              country: b.country,
              ...replacement,
            },
            tx,
          ),
        );
      return { replaced: results.length, results };
    },
    { timeout: 120000 },
  );
}
export type SheetInterval = {
  /** Inclusive daily sales window: activation start through the day before the next activation, or today. */
  salesUntil: string | null;
  metaSpend?: number | null;
  metaComplete?: boolean;
  metaAssessment?: ReturnType<typeof trialAssessment>;
  hours?: number | null;
  since: string | null;
  until: string | null;
  days: number | null;
  sales: number | null;
  budget: number | null;
  complete: boolean;
  assessment: ReturnType<typeof trialAssessment>;
  country: string;
  partialDays: boolean;
};
function periods(
  events: { active: boolean; createdAt: Date; snapshot: Prisma.JsonValue }[],
  active: boolean,
) {
  const result: { since: string | null; until: string | null }[] = [];
  let start: string | null = null,
    on = events.length
      ? (((events[0].snapshot as Record<string, unknown>)?.priorActive as
          boolean | undefined) ?? !events[0].active)
      : active;
  for (const e of events) {
    if (e.active === on) continue;
    const time = e.createdAt.toISOString();
    if (e.active) start = time;
    else result.push({ since: start, until: time });
    on = e.active;
  }
  if (on) result.push({ since: start, until: null });
  return result.reverse();
}
async function activationReport(
  actor: Actor,
  input: unknown,
  authorizedTable?: string,
  sharedTx?: Tx,
) {
  const q = z
    .object({
      listId: id,
      tableIds: z.string().max(2500),
      byCountry: z.literal("true").optional(),
      country: z.string().refine(isCountryCode).optional(),
      historyName: name.optional(),
      historyTableId: id.optional(),
    })
    .strict()
    .parse(input);
  const tableIds = q.tableIds.split(",").filter(Boolean);
  demand(
    tableIds.length <= 20 && new Set(tableIds).size === tableIds.length,
    "Elige hasta20 hojas diferentes.",
  );
  const run = async (tx: Tx) => {
    if (authorizedTable)
      demand(
        tableIds.length === 1 && tableIds[0] === authorizedTable,
        "Hoja fuera del documento.",
        403,
      );
    const authorizedList = authorizedTable
      ? await tx.metaEffectivenessSheet.findFirst({
          where: { id: q.listId, kind: "INVENTORY", archivedAt: null },
        })
      : null;
    if (authorizedTable)
      demand(authorizedList, "Inventario no disponible.", 404);
    const { list, canEdit } = authorizedList
        ? { list: authorizedList, canEdit: false }
        : await context(tx, actor, q.listId),
      settings = activationSettings(list.config),
      catalog = await items(tx, list.id);
    if (q.historyName)
      demand(
        catalog.has(categoryKey(q.historyName)),
        "Inventario no disponible.",
        404,
      );
    const aliases = await tx.metaAlias.findMany({
      where: {
        inventorySheetId: list.id,
        tableId: { in: tableIds },
        ...(q.historyName
          ? { name: catalog.get(categoryKey(q.historyName)) }
          : {}),
      },
      include: {
        effectivenessRows: {
          where: { legacy: false },
          select: { country: true, hidden: true },
        },
        effectivenessStates: {
          include: {
            events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          },
        },
      },
    });
    const allowed = new Set([
      ...settings.sheets,
      ...(
        await tx.metaAlias.findMany({
          where: { inventorySheetId: list.id },
          select: { tableId: true },
        })
      ).map((a) => a.tableId),
    ]);
    demand(
      tableIds.every((id) => allowed.has(id)),
      "Una hoja no pertenece a este Inventario.",
      403,
    );
    const today = limaDay(new Date()),
      floor = new Date(Date.parse(today) - 365 * 86400000)
        .toISOString()
        .slice(0, 10),
      rates = await tx.metaFxDay.findMany({
        where: { day: { gte: floor, lte: today } },
      }),
      fx = new Map(rates.map((r) => [r.day, r.rates as FxRates]));
    const output = [];
    for (const tableId of tableIds) {
      const tableAliases = aliases.filter((a) => a.tableId === tableId);
      const relevantPeriods = tableAliases.flatMap((alias) =>
        alias.effectivenessStates.flatMap((state) =>
          periods(state.events, state.active).slice(0, q.historyName ? 100 : 1),
        ),
      );
      const starts = relevantPeriods
        .flatMap((period) =>
          period.since ? [limaDay(new Date(period.since))] : [],
        )
        .filter((day) => day >= floor && day <= today)
        .sort();
      const sourceSince = starts[0] ?? today;
      // Payments can arrive after stopping. Only the next activation closes the sales window.
      const sourceUntil = today;
      const source = await inventoryEffectivenessSource(
        actor,
        tableId,
        sourceSince,
        sourceUntil,
        tx,
      );
      for (const alias of tableAliases) {
        const states = alias.effectivenessStates,
          allRows = source.rows.filter(
            (r) =>
              r.aliasId === alias.id &&
              (!q.country || r.country === q.country) &&
              (states.some((state) => state.country === r.country) ||
                alias.effectivenessRows.some(
                  (row) => row.country === r.country,
                )),
          );
        for (const rows of q.byCountry
          ? allRows.map((row) => [row])
          : [allRows]) {
          const targets = rows.map((r) => ({
            aliasId: alias.id,
            country: r.country,
            revision:
              states.find((s) => s.country === r.country)?.revision ?? 0,
          }));
          const history: SheetInterval[] = [];
          for (const row of rows) {
            const state = states.find((s) => s.country === row.country),
              ranges = periods(state?.events ?? [], row.active);
            for (const period of ranges.slice(0, q.historyName ? 100 : 1)) {
              const since = period.since
                  ? limaDay(new Date(period.since))
                  : null,
                until = period.until ? limaDay(new Date(period.until)) : today;
              const dates =
                since && since >= floor ? trialDays(since, until, []) : [];
              const next = ranges[ranges.indexOf(period) - 1];
              const salesUntil = next?.since
                ? new Date(Date.parse(limaDay(new Date(next.since))) - 86400000)
                    .toISOString()
                    .slice(0, 10)
                : today;
              const salesDates =
                since && since >= floor && salesUntil >= since
                  ? trialDays(since, salesUntil, [])
                  : [];
              let salesComplete = !!salesDates.length;

              const overlapping = ranges.some(
                (other) =>
                  other !== period &&
                  dates.some(
                    (day) =>
                      (!other.since || limaDay(new Date(other.since)) <= day) &&
                      (!other.until || limaDay(new Date(other.until)) >= day),
                  ),
              );
              let sales: number | null = null,
                budget: number | null = null,
                complete = !!dates.length && !overlapping;
              let metaSpend: number | null = null,
                metaComplete = !!dates.length && !overlapping;
              for (const day of dates) {
                const d = row.days[day];
                if (q.historyName) {
                  const parts = d?.sourceSpend ?? [];
                  if (!parts.length || d?.partialMetrics.includes("spend"))
                    metaComplete = false;
                  for (const part of parts) {
                    const value = convertMoney(
                      part.amount,
                      part.currency,
                      "PEN",
                      fx.get(day),
                    );
                    if (value === null) metaComplete = false;
                    else metaSpend = (metaSpend ?? 0) + value;
                  }
                }
                const p =
                  d?.budget === null || d?.budget === undefined
                    ? null
                    : convertMoney(d.budget, row.currency, "PEN", fx.get(day));
                if (p !== null) budget = (budget ?? 0) + p;
                if (
                  p === null ||
                  d?.na.includes("budget") ||
                  d?.partialMetrics.includes("budget")
                )
                  complete = false;
              }
              for (const day of salesDates) {
                const d = row.days[day],
                  v = d?.sales ?? null;
                if (v !== null) sales = (sales ?? 0) + v;
                if (
                  v === null ||
                  d?.na.includes("sales") ||
                  d?.partialMetrics.includes("sales")
                )
                  salesComplete = false;
              }
              complete = complete && salesComplete;
              history.push({
                ...period,
                salesUntil: since ? salesUntil : null,
                ...(q.historyName
                  ? {
                      metaSpend,
                      metaComplete,
                      metaAssessment: inventoryFactorAssessment(
                        sales,
                        metaSpend,
                        metaComplete && salesComplete,
                        settings.limits,
                      ),
                      hours: period.since
                        ? Math.max(
                            0,
                            (new Date(
                              period.until ?? new Date().toISOString(),
                            ).getTime() -
                              new Date(period.since).getTime()) /
                              3600000,
                          )
                        : null,
                    }
                  : {}),
                days: dates.length || null,
                sales,
                budget,
                complete,
                assessment: inventoryFactorAssessment(
                  sales,
                  budget,
                  complete,
                  settings.limits,
                ),
                country: row.country,
                partialDays:
                  !!period.since &&
                  !!period.until &&
                  limaDay(new Date(period.since)) === until,
              });
            }
          }
          const current = rows.map((r) =>
              history.find((h) => h.country === r.country),
            ),
            sales = current.some(
              (h) => h?.sales !== null && h?.sales !== undefined,
            )
              ? current.reduce((n, h) => n + (h?.sales ?? 0), 0)
              : null,
            budget = current.some(
              (h) => h?.budget !== null && h?.budget !== undefined,
            )
              ? current.reduce((n, h) => n + (h?.budget ?? 0), 0)
              : null,
            complete = current.length > 0 && current.every((h) => h?.complete);
          const campaignTasks = [
            ...new Set(
              targets.map((t) =>
                !states.some((s) => s.country === t.country) &&
                alias.effectivenessRows.some(
                  (r) => r.country === t.country && r.hidden,
                )
                  ? "NONE"
                  : (settings.rows[rowKey(t.aliasId, t.country)]
                      ?.campaignTask ?? "NONE"),
              ),
            ),
          ].filter((task) => task !== "NONE");
          output.push({
            ...inventoryUsage(
              rows.flatMap((row) =>
                periods(
                  states.find((s) => s.country === row.country)?.events ?? [],
                  row.active,
                ),
              ),
            ),
            ...(rows.some(
              (row) =>
                !states.some((s) => s.country === row.country) &&
                alias.effectivenessRows.some(
                  (r) => r.country === row.country && r.hidden,
                ),
            )
              ? { usage: "UNKNOWN" as const, activationHours: null }
              : {}),
            country: q.byCountry ? rows[0]?.country : undefined,
            campaignTasks,
            campaignTask:
              campaignTasks.length > 1 ? "MIXED" : (campaignTasks[0] ?? "NONE"),
            countryAssessments: rows.map((r) => ({
              country: r.country,
              assessment:
                history.find((h) => h.country === r.country)?.assessment ??
                inventoryFactorAssessment(null, null, false, settings.limits),
            })),
            name: alias.name,
            tableId,
            targets,
            activation: !rows.length
              ? "UNKNOWN"
              : rows.every((r) => r.active)
                ? "ACTIVE"
                : rows.every((r) => !r.active)
                  ? "INACTIVE"
                  : "MIXED",
            pinned:
              targets.length > 0 &&
              targets.every(
                (t) => settings.rows[rowKey(t.aliasId, t.country)]?.pinned,
              ),
            assessment: inventoryFactorAssessment(
              sales,
              budget,
              complete,
              settings.limits,
            ),
            sales,
            budget,
            complete,
            since: current[0]?.since ?? null,
            activeDays: current[0]?.days ?? null,
            history: q.historyName ? history : undefined,
          });
        }
      }
    }
    return { canEdit, rows: output, today };
  };
  return sharedTx
    ? run(sharedTx)
    : db.$transaction(run, {
        timeout: 120000,
        isolationLevel: "RepeatableRead",
      });
}
export async function inventoryActivationReport(actor: Actor, input: unknown) {
  return activationReport(actor, input);
}
/** Aggregate-only read of aliases on the currently authorized financial table. */
export async function financialCatalogStatus(actor: Actor, input: unknown) {
  const q = z.object({ tableId: id }).strict().parse(input);
  return db.$transaction(
    async (tx) => {
      ownerOnly(actor);
      await effectivenessLock(tx, actor);
      await checkFinancialContext(actor, tx);
      const access = await financialAccess(actor, tx),
        cap = financialContext(actor);
      demand(
        access.isOwner ||
          scopePermission(access, "ALL") ||
          (cap?.tableIds.includes(q.tableId) &&
            scopePermission(access, cap.scope)),
        "Hoja fuera del documento compartido.",
        403,
      );
      const aliases = await tx.metaAlias.findMany({
        where: { tableId: q.tableId },
        select: { id: true, inventorySheetId: true },
      });
      const lists = [
        ...new Set(
          aliases
            .map((a) => a.inventorySheetId)
            .filter((v): v is string => !!v),
        ),
      ];
      const rows = [];
      for (const listId of lists) {
        const list = await tx.metaEffectivenessSheet.findFirst({
          where: { id: listId, kind: "INVENTORY", archivedAt: null },
          select: { id: true },
        });
        if (!list) continue;
        const report = await activationReport(
          actor,
          { listId, tableIds: q.tableId },
          q.tableId,
          tx,
        );
        for (const row of report.rows)
          for (const target of row.targets) {
            if (!aliases.some((a) => a.id === target.aliasId)) continue;
            rows.push({
              aliasId: target.aliasId,
              country: target.country,
              assessment:
                row.countryAssessments.find((c) => c.country === target.country)
                  ?.assessment ?? row.assessment,
            });
          }
      }
      return { tableId: q.tableId, rows };
    },
    { timeout: 120000, isolationLevel: "RepeatableRead" },
  );
}
export type FinancialCatalogStatus = Awaited<
  ReturnType<typeof financialCatalogStatus>
>;
export type InventorySheetActivationReport = Awaited<
  ReturnType<typeof inventoryActivationReport>
>;
export type InventorySheetActivationDirectory = Awaited<
  ReturnType<typeof inventoryActivationDirectory>
>;
