import { usageBatchRevisionPayload } from "./inventory-group-usage-batch-policy";
import { groupReplacementMatches } from "./inventory-group-replacement-policy";
import {
  detachedInventoryAliases,
  physicallyHiddenInventoryAliases,
} from "./inventory-membership";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand, AppError } from "../errors";
import { recordActivity } from "../activity";
import {
  ownerOnly,
  financialAccess,
  financialContext,
  scopePermission,
  checkFinancialContext,
} from "./financial-access";
import {
  effectiveness,
  effectivenessLock,
  type EffectivenessCell,
  type EffectivenessSheet,
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
import {
  inventoryGroupUsage,
  groupUsageOverrides,
  groupUsageKey,
} from "./inventory-group-usage";
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
      action: z.literal("USAGE_BATCH"),
      listId: id,
      itemIds: z.array(id).min(1).max(1500),
      countries: z.array(country).min(1).max(20),
      mode: z.enum(["USED", "UNUSED"]),
      expectedUsageRevision: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("USAGE"),
      listId: id,
      itemId: id,
      country,
      mode: z.enum(["AUTO", "USED", "UNUSED"]),
      expectedRevision: z.string().uuid().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("REMOVE_MEMBERS"),
      listId: id,
      groups: z
        .array(
          z
            .object({
              groupId: id,
              revision: z.number().int().positive(),
              itemIds: z.array(id).min(1).max(1500),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("CREATE"),
      requestId: z.string().uuid().optional(),
      listId: id,
      name: z.string().trim().min(1).max(100),
      itemIds: z.array(id).min(1).max(1500),
      countries: z.array(country).min(1).max(20),
      since: day,
      reserve: z.boolean(),
      diverse: z.boolean(),
      rules,
    })
    .strict(),
  z
    .object({
      ...edit,
      action: z.enum(["MEMBERS", "ADD_MEMBERS"]),
      name: z.string().trim().min(1).max(100).optional(),
      itemIds: z.array(id).max(1500),
      since: day,
    })
    .strict(),
  z
    .object({
      ...edit,
      action: z.literal("MOVE_MEMBER"),
      itemId: id,
      targetGroupId: id,
      targetRevision: z.number().int().positive(),
      since: day,
    })
    .strict(),
  z
    .object({
      action: z.literal("REPLACE_MEMBERS"),
      listId: id,
      groupId: id,
      groups: z
        .array(
          z
            .object({ groupId: id, revision: z.number().int().positive() })
            .strict(),
        )
        .min(1)
        .max(100),
      pairs: z
        .array(
          z
            .object({
              itemId: id,
              replacementId: id,
              replacementGroupId: id.nullable(),
            })
            .strict(),
        )
        .min(1)
        .max(100),
      mode: z.enum(["ANY", "SAME", "OTHER", "DIVERSE"]),
      since: day,
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
      slotIds: z.array(id).min(1).max(1500),
      date: day,
    })
    .strict(),
  z
    .object({
      ...edit,
      action: z.literal("DECISION"),
      country,
      slotIds: z.array(id).min(1).max(1500),
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
  if (write) await effectivenessLock(tx, actor);
  else await checkFinancialContext(actor, tx);
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
/** The picker needs overrides and detached IDs, not financial row controls or unrelated settings. */
async function directoryConfiguration(tx:Prisma.TransactionClient,listId:string):Promise<Prisma.JsonValue>{
  const rows=await tx.$queryRaw<{config:Prisma.JsonValue}[]>`
    SELECT jsonb_build_object('inventoryGroupUsage',config->'inventoryGroupUsage',
      'inventoryActivation',jsonb_build_object('detachedAliases',config#>'{inventoryActivation,detachedAliases}')) AS config
    FROM "MetaEffectivenessSheet" WHERE id=${listId}`;
  demand(rows.length,"Inventario no disponible.",404);
  return rows[0].config;
}
async function catalog(
  tx: Prisma.TransactionClient,
  listId: string,
  suppliedConfig?: Prisma.JsonValue,
): Promise<TrialItem[]> {
  const [items, aliases] = await Promise.all([
    tx.metaInventoryItem.findMany({
      where: { sheetId: listId },
      select: {
        id: true,
        name: true,
        categories: {
          where: { category: { sheetId: listId } },
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
        table: { select: { id: true, name: true } },
      },
    }),
  ]);
  const canonicalNames=new Set(items.map(item=>categoryKey(item.name)));
  const legacyIds=aliases.filter(alias=>!canonicalNames.has(categoryKey(alias.name))).map(alias=>alias.id);
  const legacyTags=legacyIds.length ? await tx.metaInventoryCategoryAssignment.findMany({
    where:{aliasId:{in:legacyIds},category:{sheetId:listId}},
    select:{aliasId:true,category:{select:{id:true,name:true,kind:true}}},
  }) : [];
  const tagsByAlias=new Map<string,(typeof legacyTags)[number]["category"][]>();
  for(const tag of legacyTags){const bucket=tagsByAlias.get(tag.aliasId);if(bucket)bucket.push(tag.category);else tagsByAlias.set(tag.aliasId,[tag.category]);}
  const config = suppliedConfig ?? await directoryConfiguration(tx,listId);
  const detached = new Set([
    ...detachedInventoryAliases(config),
    ...(await physicallyHiddenInventoryAliases(
      tx,
      aliases.map((a) => a.id),
    )),
  ]);
  const out = new Map<string, TrialItem>();
  for (const alias of aliases) {
    const k = categoryKey(alias.name),
      tags = tagsByAlias.get(alias.id) ?? [],
      item = out.get(k) ?? {
        id: alias.id,
        name: alias.name,
        primaryIds: [],
        primaryNames: [],
        secondaryNames: [],
        sheets: [],
      };
    for (const c of tags) {
      if (c.kind === "PRIMARY" && !item.primaryIds.includes(c.id)) {
        item.primaryIds.push(c.id);
        item.primaryNames.push(c.name);
      }
      if (c.kind === "SECONDARY" && !item.secondaryNames!.includes(c.name))
        item.secondaryNames!.push(c.name);
    }
    if (
      !detached.has(alias.id) &&
      !item.sheets!.some((t) => t.id === alias.table.id)
    )
      item.sheets!.push(alias.table);
    out.set(k, item);
  }
  for (const item of items) {
    const k = categoryKey(item.name),
      tags = item.categories.map((x) => x.category),
      primary = tags.filter((c) => c.kind === "PRIMARY");
    out.set(k, {
      id: item.id,
      name: item.name,
      primaryIds: primary.map((c) => c.id),
      primaryNames: primary.map((c) => c.name),
      secondaryNames: tags
        .filter((c) => c.kind === "SECONDARY")
        .map((c) => c.name),
      sheets: out.get(k)?.sheets ?? [],
    });
  }
  for (const item of out.values()) {
    item.sheets?.sort((a, b) => a.name.localeCompare(b.name, "es"));
    item.secondaryNames?.sort((a, b) => a.localeCompare(b, "es"));
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
  const b = z.object({listId: id, mode: z.enum(["directory", "usage"]).optional()}).strict().parse(input);
  return db.$transaction(
    async (tx) => {
      const permission = await context(tx, actor, b.listId);
      const metadataConfig=b.mode === "directory" ? await directoryConfiguration(tx,b.listId) : undefined;
      const overrides=metadataConfig ? Object.fromEntries(Object.entries(groupUsageOverrides(metadataConfig)).map(([key,rule])=>[key,{mode:rule.mode,revision:rule.revision,automatic:"UNKNOWN" as const,activationHours:null}])) : {};
      return {
        listId: b.listId,
        canEdit: permission === "EDIT",
        ...(b.mode === "directory" ? { countries: [] as {code:string;name:string}[], usage: overrides as Awaited<ReturnType<typeof inventoryGroupUsage>>["usage"], campaignStates: {} as Awaited<ReturnType<typeof inventoryGroupUsage>>["campaignStates"] } : await inventoryGroupUsage(tx, b.listId)),
        usageReady: b.mode !== "directory",
        catalog: b.mode === "usage" ? [] : await catalog(tx, b.listId, metadataConfig),
        groups: b.mode === "usage" ? [] : (
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
async function exclusiveMembers(
  tx: Prisma.TransactionClient,
  listId: string,
  items: TrialItem[],
  except?: string,
) {
  const others = await tx.metaInventoryTrialGroup.findMany({
    where: {
      sheetId: listId,
      archivedAt: null,
      ...(except ? { id: { not: except } } : {}),
    },
    select: { name: true, payload: true },
  });
  for (const other of others) {
    const members = (other.payload as unknown as TrialPayload).members;
    const conflict = items.find((i) =>
      members.some(
        (m) => m.itemId === i.id || categoryKey(m.name) === categoryKey(i.name),
      ),
    );
    demand(
      !conflict,
      `«${conflict?.name}» ya pertenece a «${other.name}». Retíralo de ese grupo antes de asignarlo a otro.`,
      409,
    );
  }
}
async function uniqueGroupName(
  tx: Prisma.TransactionClient,
  listId: string,
  name: string,
  exceptId?: string,
) {
  const groups = await tx.metaInventoryTrialGroup.findMany({
    where: { sheetId: listId, archivedAt: null },
    select: { id: true, name: true },
  });
  demand(
    !groups.some(
      (group) =>
        group.id !== exceptId && categoryKey(group.name) === categoryKey(name),
    ),
    "Ya existe un grupo con ese nombre. Usa Asignar a grupo para agregar diplomados.",
    409,
  );
}
export async function saveInventoryTrial(actor: Actor, input: unknown) {
  const b = trialChange.parse(input);
  return db.$transaction(
    async (tx) => {
      await context(tx, actor, b.listId, true);
      if (b.action === "REPLACE_MEMBERS") {
        dateCheck(b.since);
        const groups = await tx.metaInventoryTrialGroup.findMany({
          where: { sheetId: b.listId, archivedAt: null },
        });
        const revisions = new Map(
          b.groups.map((entry) => [entry.groupId, entry.revision]),
        );
        demand(revisions.size === b.groups.length, "No repitas grupos.");
        const required = new Set([
          b.groupId,
          ...b.pairs.flatMap((pair) =>
            pair.replacementGroupId ? [pair.replacementGroupId] : [],
          ),
        ]);
        demand(
          required.size === revisions.size &&
            [...required].every((id) => revisions.has(id)),
          "Revisa los grupos de ambos lados del reemplazo.",
          409,
        );
        for (const id of required) {
          const group = groups.find((entry) => entry.id === id);
          demand(
            group && group.revision === revisions.get(id),
            "Un grupo cambió. Revisa los reemplazos antes de aprobar.",
            409,
          );
        }
        const payloads = new Map(
          groups
            .filter((group) => required.has(group.id))
            .map((group) => [
              group.id,
              structuredClone(group.payload) as unknown as TrialPayload,
            ]),
        );
        const source = payloads.get(b.groupId)!;
        const items = await catalog(tx, b.listId);
        const oldIds = new Set(b.pairs.map((pair) => pair.itemId)),
          newIds = new Set(b.pairs.map((pair) => pair.replacementId));
        demand(
          oldIds.size === b.pairs.length &&
            newIds.size === b.pairs.length &&
            ![...newIds].some((id) => oldIds.has(id)),
          "No repitas diplomados en los reemplazos.",
          409,
        );
        const areas = new Set<string>();
        const swaps = b.pairs.map((pair) => {
          const old = source.members.find(
            (member) => member.itemId === pair.itemId,
          );
          const oldItem = items.find((item) => item.id === pair.itemId),
            nextItem = items.find((item) => item.id === pair.replacementId);
          demand(
            old && oldItem && nextItem,
            "Un diplomado cambió. Revisa la propuesta.",
            409,
          );
          demand(
            groupReplacementMatches(oldItem, nextItem, b.mode),
            "Una categoría o propuesta cambió. Propón los reemplazos de nuevo.",
            409,
          );
          if (b.mode === "DIVERSE") {
            demand(
              !nextItem.primaryIds.some((id) => areas.has(id)),
              "La propuesta repite categorías principales.",
              409,
            );
            nextItem.primaryIds.forEach((id) => areas.add(id));
          }
          const memberships = groups.flatMap((group) =>
            (group.payload as unknown as TrialPayload).members
              .filter(
                (member) =>
                  categoryKey(member.name) === categoryKey(nextItem.name),
              )
              .map((member) => ({ group, member })),
          );
          demand(
            memberships.length <= 1 && memberships[0]?.group.id !== b.groupId,
            "El sustituto ya pertenece a este grupo o tiene una asignación ambigua.",
            409,
          );
          demand(
            (memberships[0]?.group.id ?? null) === pair.replacementGroupId,
            "La asignación del sustituto cambió. Revisa ambos grupos.",
            409,
          );
          return {
            old,
            oldItem,
            nextItem,
            other: pair.replacementGroupId,
            otherMember: memberships[0]?.member,
          };
        });
        const replacementSince = b.since;
        function replaceMember(
          payload: TrialPayload,
          oldSlot: string,
          item: TrialItem,
        ) {
          for (const cycle of payload.cycles)
            if (cycle.slotId === oldSlot && !cycle.until) {
              demand(
                replacementSince >= cycle.since,
                "La fecha no puede preceder al ciclo reemplazado.",
                409,
              );
              cycle.until =
                replacementSince === cycle.since
                  ? replacementSince
                  : shift(replacementSince, -1);
            }
          const member = {
            slotId: randomUUID(),
            itemId: item.id,
            name: item.name,
          };
          payload.members = payload.members.map((entry) =>
            entry.slotId === oldSlot ? member : entry,
          );
          if (!payload.reserve)
            for (const country of payload.countries)
              payload.cycles.push({
                id: randomUUID(),
                ...member,
                country,
                since: replacementSince,
                until: null,
                pauses: [],
                decision: "AUTO",
              });
          demand(
            payload.cycles.length <= 100000,
            "Un grupo alcanzó su límite de historial.",
            409,
          );
        }
        for (const swap of swaps) {
          replaceMember(source, swap.old.slotId, swap.nextItem);
          if (swap.other && swap.otherMember)
            replaceMember(
              payloads.get(swap.other)!,
              swap.otherMember.slotId,
              swap.oldItem,
            );
        }
        const updated = [];
        for (const [id, payload] of payloads)
          updated.push(
            await tx.metaInventoryTrialGroup.update({
              where: { id },
              data: { payload: json(payload), revision: { increment: 1 } },
            }),
          );
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "INVENTARIO_GRUPOS_REEMPLAZADOS",
            resourceId: b.listId,
            detail: {
              groupId: b.groupId,
              mode: b.mode,
              since: b.since,
              pairs: b.pairs,
              groups: b.groups,
            },
          },
        });
        return serialize(updated.find((group) => group.id === b.groupId)!);
      }
      if (b.action === "MOVE_MEMBER") {
        demand(b.groupId !== b.targetGroupId, "Elige otro grupo.");
        dateCheck(b.since);
        const sourceGroup = await tx.metaInventoryTrialGroup.findFirst({
          where: { id: b.groupId, sheetId: b.listId, archivedAt: null },
        });
        const targetGroup = await tx.metaInventoryTrialGroup.findFirst({
          where: { id: b.targetGroupId, sheetId: b.listId, archivedAt: null },
        });
        demand(sourceGroup && targetGroup, "Grupo no disponible.", 404);
        demand(
          sourceGroup.revision === b.revision &&
            targetGroup.revision === b.targetRevision,
          "Un grupo cambió. Revisa el traslado de nuevo.",
          409,
        );
        const sourcePayload = structuredClone(
          sourceGroup.payload,
        ) as unknown as TrialPayload;
        const targetPayload = structuredClone(
          targetGroup.payload,
        ) as unknown as TrialPayload;
        const member = sourcePayload.members.find(
          (entry) => entry.itemId === b.itemId,
        );
        demand(member, "El diplomado ya no pertenece al grupo de origen.", 409);
        const candidate = (await catalog(tx, b.listId)).find(
          (item) => item.id === member.itemId,
        );
        demand(candidate, "El diplomado ya no está disponible.", 409);
        demand(
          !targetPayload.members.some(
            (entry) => categoryKey(entry.name) === categoryKey(candidate.name),
          ),
          "El destino ya contiene este diplomado.",
          409,
        );
        demand(
          targetPayload.members.length < 1500,
          "El grupo destino admite hasta1500 diplomados.",
          409,
        );
        for (const cycle of sourcePayload.cycles)
          if (cycle.slotId === member.slotId && !cycle.until) {
            demand(
              b.since >= cycle.since,
              "La fecha no puede preceder al ciclo de origen.",
              409,
            );
            cycle.until =
              b.since === cycle.since ? b.since : shift(b.since, -1);
          }
        sourcePayload.members = sourcePayload.members.filter(
          (entry) => entry.slotId !== member.slotId,
        );
        await tx.metaInventoryTrialGroup.update({
          where: { id: sourceGroup.id },
          data: { payload: json(sourcePayload), revision: { increment: 1 } },
        });
        await exclusiveMembers(tx, b.listId, [candidate], targetGroup.id);
        const nextMember = {
          slotId: randomUUID(),
          itemId: candidate.id,
          name: candidate.name,
        };
        targetPayload.members.push(nextMember);
        if (!targetPayload.reserve)
          for (const country of targetPayload.countries)
            targetPayload.cycles.push({
              id: randomUUID(),
              ...nextMember,
              country,
              since: b.since,
              until: null,
              pauses: [],
              decision: "AUTO",
            });
        demand(
          targetPayload.cycles.length <= 100000,
          "El destino alcanzó su límite de historial.",
          409,
        );
        const updated = await tx.metaInventoryTrialGroup.update({
          where: { id: targetGroup.id },
          data: { payload: json(targetPayload), revision: { increment: 1 } },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "INVENTARIO_DIPLOMADO_TRASLADADO_GRUPO",
            resourceId: b.listId,
            detail: {
              from: sourceGroup.id,
              to: targetGroup.id,
              itemId: candidate.id,
              name: candidate.name,
              since: b.since,
            },
          },
        });
        return serialize(updated);
      }
      if (b.action === "USAGE_BATCH") {
        demand(
          new Set(b.itemIds).size === b.itemIds.length &&
            new Set(b.countries).size === b.countries.length,
          "No repitas diplomados ni países.",
        );
        const source = await catalog(tx, b.listId),
          byId = new Map(source.map((item) => [item.id, item]));
        const items = b.itemIds.map((itemId) => byId.get(itemId));
        demand(
          items.every(Boolean),
          "Un diplomado ya no está disponible. Revisa la selección.",
          409,
        );
        const chosen = items as NonNullable<(typeof items)[number]>[];
        demand(
          new Set(chosen.map((item) => categoryKey(item.name))).size ===
            chosen.length,
          "No repitas diplomados.",
        );
        const matrix = await inventoryGroupUsage(tx, b.listId),
          allowed = new Set(matrix.countries.map((c) => c.code));
        demand(
          b.countries.every((code) => allowed.has(code)),
          "Un país no pertenece a las hojas de este inventario.",
          409,
        );
        const currentRevision = createHash("sha256")
          .update(usageBatchRevisionPayload(chosen, b.countries, matrix.usage))
          .digest("hex");
        demand(
          currentRevision === b.expectedUsageRevision,
          "El uso cambió. Cierra este cuadro y revisa las marcas antes de continuar.",
          409,
        );
        const list = await tx.metaEffectivenessSheet.findUniqueOrThrow({
            where: { id: b.listId },
            select: { config: true },
          }),
          overrides = groupUsageOverrides(list.config),
          revision = randomUUID();
        for (const item of chosen)
          for (const code of b.countries)
            overrides[groupUsageKey(item.name, code)] = {
              mode: b.mode,
              revision,
            };
        await tx.metaEffectivenessSheet.update({
          where: { id: b.listId },
          data: {
            config: {
              ...(list.config as Prisma.JsonObject),
              inventoryGroupUsage: overrides,
            },
            revision: { increment: 1 },
          },
        });
        const cells = chosen.length * b.countries.length;
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "INVENTARIO_USO_MANUAL_LOTE",
            resourceId: b.listId,
            detail: {
              itemIds: b.itemIds,
              countries: b.countries,
              mode: b.mode,
              cells,
            },
          },
        });
        return {
          id: b.listId,
          revision: 0,
          name: "",
          createdAt: new Date().toISOString(),
          members: [],
          countries: [],
          reserve: false,
          cycles: [],
          rules: { zero: 25, perSale: 50 },
          usageBatchUpdate: { mode: b.mode, revision, cells },
        };
      }
      if (b.action === "USAGE") {
        const source = await catalog(tx, b.listId);
        const item = source.find((i) => i.id === b.itemId);
        demand(item, "El diplomado ya no está disponible.", 409);
        const matrix = await inventoryGroupUsage(tx, b.listId);
        demand(
          matrix.countries.some((c) => c.code === b.country),
          "El país no pertenece a las hojas de este inventario.",
          409,
        );
        const list = await tx.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: b.listId },
          select: { config: true },
        });
        const key = groupUsageKey(item.name, b.country),
          overrides = groupUsageOverrides(list.config);
        demand(
          (overrides[key]?.revision ?? null) === b.expectedRevision,
          "El uso cambió. Reabre el grupo antes de guardar.",
          409,
        );
        if (b.mode === "AUTO") delete overrides[key];
        else overrides[key] = { mode: b.mode, revision: randomUUID() };
        await tx.metaEffectivenessSheet.update({
          where: { id: b.listId },
          data: {
            config: {
              ...(list.config as Prisma.JsonObject),
              inventoryGroupUsage: overrides,
            },
            revision: { increment: 1 },
          },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "INVENTARIO_USO_MANUAL",
            resourceId: b.listId,
            detail: {
              itemId: item.id,
              country: b.country,
              before: matrix.usage[key]?.mode ?? "AUTO",
              after: b.mode,
            },
          },
        });
        // Same response shape keeps older group-only API consumers compatible.
        return {
          id: b.listId,
          revision: 0,
          name: "",
          createdAt: new Date().toISOString(),
          members: [],
          countries: [],
          reserve: false,
          cycles: [],
          rules: { zero: 25, perSale: 50 },
          usageUpdate: {
            key,
            cell: {
              ...(matrix.usage[key] ?? {
                automatic: "NEVER" as const,
                activationHours: 0,
              }),
              mode: b.mode,
              revision: overrides[key]?.revision ?? null,
            },
          },
        };
      }
      if (b.action === "REMOVE_MEMBERS") {
        demand(
          new Set(b.groups.map((g) => g.groupId)).size === b.groups.length,
          "No repitas grupos.",
        );
        let removed = 0;
        for (const change of b.groups) {
          const group = await tx.metaInventoryTrialGroup.findFirst({
            where: { id: change.groupId, sheetId: b.listId, archivedAt: null },
          });
          demand(group, "Grupo no disponible.", 404);
          demand(
            group.revision === change.revision,
            "Un grupo cambió. Actualiza antes de quitar asignaciones.",
            409,
          );
          const payload = group.payload as unknown as TrialPayload;
          demand(
            new Set(change.itemIds).size === change.itemIds.length &&
              change.itemIds.every((id) =>
                payload.members.some((m) => m.itemId === id),
              ),
            "Una asignación cambió. Actualiza el inventario.",
            409,
          );
          const slots = new Set(
            payload.members
              .filter((m) => change.itemIds.includes(m.itemId))
              .map((m) => m.slotId),
          );
          for (const cycle of payload.cycles)
            if (!cycle.until && slots.has(cycle.slotId)) {
              demand(
                cycle.since <= today(),
                "La fecha de inicio cambió. Actualiza.",
                409,
              );
              cycle.until =
                cycle.since === today() ? today() : shift(today(), -1);
            }
          payload.members = payload.members.filter((m) => !slots.has(m.slotId));
          await tx.metaInventoryTrialGroup.update({
            where: { id: group.id },
            data: { payload: json(payload), revision: { increment: 1 } },
          });
          removed += slots.size;
        }
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "INVENTARIO_GRUPOS_RETIRADOS",
            resourceId: b.listId,
            detail: { groups: b.groups.length, items: removed },
          },
        });
        return { removed };
      }
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

        await uniqueGroupName(tx, b.listId, b.name);
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
        await exclusiveMembers(tx, b.listId, chosen as TrialItem[]);
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
      if ((b.action === "RENAME" || b.action === "MEMBERS") && b.name)
        await uniqueGroupName(tx, b.listId, b.name, g.id);
      const p = g.payload as unknown as TrialPayload;
      if (b.action === "MEMBERS" || b.action === "ADD_MEMBERS") {
        dateCheck(b.since);
        demand(
          new Set(b.itemIds).size === b.itemIds.length,
          "No repitas diplomados.",
        );
        const source = await catalog(tx, b.listId);
        const memberIds =
          b.action === "ADD_MEMBERS"
            ? [...new Set([...p.members.map((m) => m.itemId), ...b.itemIds])]
            : b.itemIds;
        demand(
          memberIds.length <= 1500,
          "Un grupo admite hasta 1500 diplomados.",
        );
        demand(
          b.action !== "ADD_MEMBERS" || b.itemIds.length > 0,
          "Selecciona al menos un diplomado.",
        );
        const chosen = memberIds.map((id) => source.find((i) => i.id === id));
        demand(
          chosen.every(Boolean),
          "Un diplomado cambió. Actualiza la selección.",
          409,
        );
        await exclusiveMembers(tx, b.listId, chosen as TrialItem[], g.id);
        const next = [];
        for (const candidate of chosen) {
          const item = await canonical(tx, b.listId, candidate!);
          const old = p.members.find((m) => m.itemId === item.id);
          if (old) next.push({ ...old, name: item.name });
          else {
            const member = {
              slotId: randomUUID(),
              itemId: item.id,
              name: item.name,
            };
            next.push(member);
            if (!p.reserve)
              for (const country of p.countries)
                p.cycles.push({
                  id: randomUUID(),
                  ...member,
                  country,
                  since: b.since,
                  until: null,
                  pauses: [],
                  decision: "AUTO",
                });
          }
        }
        const kept = new Set(next.map((m) => m.slotId));
        for (const c of p.cycles)
          if (!c.until && !kept.has(c.slotId)) {
            demand(
              b.since >= c.since,
              "La fecha no puede preceder al ciclo retirado.",
              409,
            );
            c.until = b.since === c.since ? b.since : shift(b.since, -1);
          }
        p.members = next;
      }
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
        p.cycles.length <= 100000,
        "Este grupo alcanzó su límite de historial. Crea un grupo nuevo.",
      );
      const updated = await tx.metaInventoryTrialGroup.update({
        where: { id: g.id },
        data: {
          payload: json(p),
          revision: { increment: 1 },
          ...((b.action === "RENAME" || b.action === "MEMBERS") && b.name
            ? { name: b.name }
            : {}),
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
    (tx) => trialReportInTransaction(tx, actor, b, until),
    { timeout: 120000, isolationLevel: "RepeatableRead" },
  );
}
type TrialSourceCache = {
  since: string;
  sheets: Map<string, Promise<EffectivenessSheet>>;
};
async function trialReportInTransaction(
  tx: Prisma.TransactionClient,
  actor: Actor,
  b: z.infer<typeof trialReportQuery>,
  until: string,
  cache?: TrialSourceCache,
) {
  if (!cache) await context(tx, actor, b.listId);
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
              group.members.some((m) => m.slotId === c.slotId) &&
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
  const sourceSheets = new Map<
    string,
    Map<string, { tableId: string; name: string; active: boolean }>
  >();
  for (const tableId of new Set(aliases.map((a) => a.tableId))) {
    let sheet: EffectivenessSheet;
    if (cache) {
      let pending = cache.sheets.get(tableId);
      if (!pending) {
        pending = effectiveness(actor, tableId, cache.since, until, tx);
        cache.sheets.set(tableId, pending);
      }
      sheet = await pending;
    } else sheet = await effectiveness(actor, tableId, since, until, tx);
    for (const row of sheet.rows) {
      const item = aliasItems.get(row.aliasId);
      if (!item || !group.countries.includes(row.country)) continue;
      const sourceKey = JSON.stringify([item, row.country]);
      if (!sourceSheets.has(sourceKey)) sourceSheets.set(sourceKey, new Map());
      sourceSheets.get(sourceKey)!.set(row.aliasId, {
        tableId: sheet.table.id,
        name: sheet.table.name,
        active: row.active,
      });
      for (const date of trialDays(since, until, [])) {
        const c: EffectivenessCell | undefined = row.days[date];
        for (const metric of ["sales", "budget", "spend"] as const) {
          let amount = c?.[metric] ?? null;
          if (metric !== "sales" && amount !== null)
            amount = convertMoney(amount, row.currency, "PEN", rates.get(date));
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
    if (source.updatedAt && (!v.updatedAt || source.updatedAt < v.updatedAt))
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
        value: known.length ? known.reduce((n, d) => n + d[metric]!, 0) : null,
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
    const sheets = [
      ...(sourceSheets.get(JSON.stringify([c.itemId, c.country]))?.values() ??
        []),
    ];
    const activation: "ACTIVE" | "INACTIVE" | "MIXED" | "UNKNOWN" =
      !sheets.length
        ? "UNKNOWN"
        : sheets.every((s) => s.active)
          ? "ACTIVE"
          : sheets.every((s) => !s.active)
            ? "INACTIVE"
            : "MIXED";
    return {
      sheets,
      activation,
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
        sales.value && spend.value !== null ? spend.value / sales.value : null,
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
}

export type TrialDirectory = Awaited<ReturnType<typeof inventoryTrials>>;
export type TrialReport = Awaited<ReturnType<typeof inventoryTrialReport>>;

const catalogReportQuery = scope
  .extend({ groupIds: z.string().min(1).max(10000), until: day.optional() })
  .strict();
/** Batch read for the inventory grid. Canonical sheets are read once across groups. */
export async function inventoryCatalogTrialReport(
  actor: Actor,
  input: unknown,
) {
  const b = catalogReportQuery.parse(input),
    until = b.until ?? today(),
    ids = b.groupIds.split(",");
  dateCheck(until);
  demand(
    ids.length <= 100 &&
      new Set(ids).size === ids.length &&
      ids.every((i) => i.length > 0 && i.length <= 100),
    "Selecciona grupos válidos.",
  );
  return db.$transaction(
    async (tx) => {
      await context(tx, actor, b.listId);
      const groups = await tx.metaInventoryTrialGroup.findMany({
        where: { sheetId: b.listId, archivedAt: null, id: { in: ids } },
      });
      demand(
        groups.length === ids.length,
        "Un grupo cambió o pertenece a otro inventario.",
        409,
      );
      let since = until;
      for (const group of groups)
        for (const c of (group.payload as unknown as TrialPayload).cycles)
          if (
            c.since <= until &&
            (!c.until || c.until >= until) &&
            c.since < since
          )
            since = c.since;
      const cache: TrialSourceCache = {
        since: since < shift(until, -365) ? shift(until, -365) : since,
        sheets: new Map(),
      };
      const reports: TrialReport[] = [],
        errors: { groupId: string; message: string }[] = [];
      for (const group of groups) {
        if ((group.payload as unknown as TrialPayload).reserve) continue;
        try {
          reports.push(
            await trialReportInTransaction(
              tx,
              actor,
              { listId: b.listId, groupId: group.id },
              until,
              cache,
            ),
          );
        } catch (e) {
          if (e instanceof AppError)
            errors.push({ groupId: group.id, message: e.message });
          else throw e;
        }
      }
      return { reports, errors, until };
    },
    { timeout: 120000, isolationLevel: "RepeatableRead" },
  );
}
export type InventoryCatalogTrialReport = Awaited<
  ReturnType<typeof inventoryCatalogTrialReport>
>;
