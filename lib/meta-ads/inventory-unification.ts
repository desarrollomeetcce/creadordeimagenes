import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { checkFinancialContext, financialAccess } from "./financial-access";
import { effectivenessLock } from "./effectiveness";
import { categoryKey } from "./category-paste";
import { syllabiSchema } from "./inventory-syllabi-policy";
import type { TrialPayload } from "./inventory-trial-policy";
import type { Actor } from "./service";
type Tx = Prisma.TransactionClient;
const id = z.string().min(1).max(100);
const selection = z
  .object({ listId: id, sourceIds: z.array(id).min(1).max(100), targetId: id })
  .strict();
const confirmation = selection.extend({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().uuid(),
});
function stable(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  )
    return stable(value.toJSON());
  if (Array.isArray(value)) return value.map(stable);
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, stable(v)]),
      )
    : value;
}
const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
async function authorize(tx: Tx, actor: Actor, listId: string) {
  await checkFinancialContext(actor, tx);
  demand(
    (await financialAccess(actor, tx)).isOwner,
    "Solo OWNER puede unificar diplomados.",
    403,
  );
  const list = await tx.metaEffectivenessSheet.findFirst({
    where: { id: listId, kind: "INVENTORY", archivedAt: null },
  });
  demand(list, "Inventario no disponible.", 404);
  return list;
}
async function plan(tx: Tx, actor: Actor, b: z.infer<typeof selection>) {
  const list = await authorize(tx, actor, b.listId);
  demand(
    new Set(b.sourceIds).size === b.sourceIds.length &&
      !b.sourceIds.includes(b.targetId),
    "Elige duplicados y un oficial diferente.",
  );
  const [records, items] = await Promise.all([
    tx.metaAlias.findMany({
      where: { inventorySheetId: b.listId },
      orderBy: { id: "asc" },
      select: { id: true, name: true, tableId: true },
    }),
    tx.metaInventoryItem.findMany({
      where: { sheetId: b.listId },
      orderBy: { id: "asc" },
      include: {
        categories: {
          orderBy: { categoryId: "asc" },
          include: { category: true },
        },
        advisors: { orderBy: { advisorId: "asc" } },
      },
    }),
  ]);
  const candidates = [...records, ...items],
    target = candidates.find((item) => item.id === b.targetId);
  demand(target, "El diplomado oficial no pertenece a este inventario.", 404);
  const chosen = b.sourceIds.map((id) =>
    candidates.find((item) => item.id === id),
  );
  demand(
    chosen.every(Boolean),
    "Un duplicado ya no está disponible. Actualiza la selección.",
    409,
  );
  const targetKey = categoryKey(target.name),
    sourceKeys = new Set(chosen.map((item) => categoryKey(item!.name)));
  demand(
    !sourceKeys.has(targetKey),
    "El oficial no puede estar entre los duplicados.",
  );
  const keys = new Set([...sourceKeys, targetKey]);
  const participants = records.filter((alias) =>
    keys.has(categoryKey(alias.name)),
  );
  demand(
    participants.length <= 200,
    "Elige menos duplicados; hay demasiadas hojas vinculadas.",
  );
  const aliases = await tx.metaAlias.findMany({
    where: { id: { in: participants.map((alias) => alias.id) } },
    orderBy: { id: "asc" },
    include: {
      table: { select: { name: true } },
      categoryAssignments: {
        orderBy: { categoryId: "asc" },
        include: { category: true },
      },
      effectivenessRows: {
        orderBy: { id: "asc" },
        include: {
          days: { orderBy: { day: "asc" } },
          salesApprovals: { orderBy: { day: "asc" } },
        },
      },
      effectivenessStates: {
        orderBy: { id: "asc" },
        include: { events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      },
      advisorAssignments: { orderBy: { id: "asc" } },
      supports: { orderBy: { id: "asc" } },
      objects: {
        orderBy: { id: "asc" },
        select: { id: true, aliasCountry: true, advisorId: true, level: true },
      },
    },
  });
  const includedItems = items.filter((item) =>
      keys.has(categoryKey(item.name)),
    ),
    targetItems = includedItems.filter(
      (item) => categoryKey(item.name) === targetKey,
    ),
    sources = includedItems.filter((item) =>
      sourceKeys.has(categoryKey(item.name)),
    );
  const reasons: string[] = [];
  if (targetItems.length > 1)
    reasons.push(
      "El oficial tiene varias fichas de catálogo. Revisa esas fichas antes de unificar.",
    );
  const collisions = await tx.metaAlias.findMany({
    where: { tableId: { in: aliases.map((alias) => alias.tableId) } },
    orderBy: { id: "asc" },
    select: { id: true, name: true, tableId: true, inventorySheetId: true },
  });
  for (const alias of aliases) {
    if (
      aliases.filter((other) => other.tableId === alias.tableId).length > 1 ||
      collisions.some(
        (other) =>
          other.tableId === alias.tableId &&
          other.id !== alias.id &&
          categoryKey(other.name) === targetKey,
      )
    )
      reasons.push(
        `La hoja «${alias.table.name}» tiene más de una asociación para unificar. Requiere conciliación sin sobrescribir datos.`,
      );
  }
  const tags = [
    ...new Map(
      [
        ...includedItems.flatMap((item) =>
          item.categories.map((entry) => entry.category),
        ),
        ...aliases.flatMap((alias) =>
          alias.categoryAssignments.map((entry) => entry.category),
        ),
      ].map((category) => [category.id, category]),
    ).values(),
  ];
  const officialTags = [
    ...targetItems.flatMap((item) =>
      item.categories.map((entry) => entry.category),
    ),
    ...aliases
      .filter((alias) => categoryKey(alias.name) === targetKey)
      .flatMap((alias) =>
        alias.categoryAssignments.map((entry) => entry.category),
      ),
  ];
  const primary = new Set(
    officialTags.filter((tag) => tag.kind === "PRIMARY").map((tag) => tag.id),
  );
  if (
    primary.size &&
    tags.some((tag) => tag.kind === "PRIMARY" && !primary.has(tag.id))
  )
    reasons.push(
      "Una categoría principal difiere de la del oficial. Revisa la categoría antes de unificar.",
    );
  const syllabi = new Map<string, z.infer<typeof syllabiSchema>[number]>();
  for (const item of [...targetItems, ...sources])
    for (const entry of syllabiSchema.parse(item.syllabi)) {
      const old = syllabi.get(entry.id);
      if (old && digest(old) !== digest(entry))
        reasons.push(
          "Hay temarios con el mismo identificador y contenido diferente.",
        );
      else syllabi.set(entry.id, entry);
    }
  if (!syllabiSchema.safeParse([...syllabi.values()]).success)
    reasons.push("Los temarios juntos superan el límite; requieren revisión.");
  const groups = await tx.metaInventoryTrialGroup.findMany({
    where: { sheetId: b.listId },
    orderBy: { id: "asc" },
  });
  const affectedGroups = groups.filter((group) => {
    const payload = group.payload as unknown as TrialPayload;
    return [...payload.members, ...payload.cycles].some((entry) =>
      keys.has(categoryKey(entry.name)),
    );
  });
  const memberships = affectedGroups.flatMap((group) =>
    group.archivedAt
      ? []
      : (group.payload as unknown as TrialPayload).members
          .filter((member) => keys.has(categoryKey(member.name)))
          .map((member) => ({ group, member })),
  );
  if (memberships.length > 1)
    reasons.push(
      "Hay varios miembros o grupos activos para estos nombres. Revisa la pertenencia antes de unificar.",
    );
  for (const group of affectedGroups) {
    const payload = group.payload as unknown as TrialPayload;
    if (
      payload.members.filter((member) => keys.has(categoryKey(member.name)))
        .length > 1
    )
      reasons.push(
        `«${group.name}» conserva varios miembros de estos diplomados; requiere conciliación.`,
      );
    const cycles = payload.cycles.filter((cycle) =>
      keys.has(categoryKey(cycle.name)),
    );
    if (
      cycles.some((cycle, index) =>
        cycles
          .slice(index + 1)
          .some(
            (other) =>
              categoryKey(cycle.name) !== categoryKey(other.name) &&
              cycle.country === other.country &&
              cycle.since <= (other.until ?? "9999-12-31") &&
              other.since <= (cycle.until ?? "9999-12-31"),
          ),
      )
    )
      reasons.push(
        `Hay ciclos superpuestos en «${group.name}». Se conservan sin cambios hasta revisarlos.`,
      );
  }
  const config = { ...(list.config as Prisma.JsonObject) },
    raw = config.inventoryGroupUsage;
  const usage =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  for (const [key, value] of Object.entries(usage)) {
    let name: string, country: string;
    try {
      [name, country] = JSON.parse(key);
    } catch {
      continue;
    }
    if (!sourceKeys.has(name)) continue;
    const destination = JSON.stringify([targetKey, country]),
      existing = usage[destination];
    if (
      existing &&
      value &&
      typeof existing === "object" &&
      typeof value === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(value) &&
      existing.mode !== value.mode
    )
      reasons.push(
        `Hay marcas manuales de uso diferentes en ${country}. Revisa el estado antes de unificar.`,
      );
    else if (!existing) usage[destination] = value;
    delete usage[key];
  }
  config.inventoryGroupUsage = usage;
  const token = digest({
    selection: { ...b, sourceIds: [...b.sourceIds].sort() },
    list: {
      revision: list.revision,
      categoryRevision: list.categoryRevision,
      config: list.config,
    },
    aliases,
    items: includedItems,
    collisions: collisions.filter((alias) => keys.has(categoryKey(alias.name))),
    groups: affectedGroups,
  });
  return {
    b,
    list,
    target,
    targetKey,
    sourceKeys,
    chosen: chosen.map((item) => item!),
    aliases,
    sources,
    targetItem: targetItems[0],
    tags,
    syllabi: [...syllabi.values()],
    affectedGroups,
    config,
    token,
    reasons: [...new Set(reasons)],
  };
}
function view(p: Awaited<ReturnType<typeof plan>>) {
  return {
    token: p.token,
    ready: !p.reasons.length,
    reasons: p.reasons,
    target: { id: p.target.id, name: p.target.name },
    sources: p.chosen.map((item) => ({ id: item.id, name: item.name })),
    sheets: p.aliases
      .filter((alias) => p.sourceKeys.has(categoryKey(alias.name)))
      .map((alias) => ({
        name: alias.table.name,
        from: alias.name,
        to: p.target.name,
        countries: [
          ...new Set([
            ...alias.effectivenessRows.map((row) => row.country),
            ...alias.effectivenessStates.map((state) => state.country),
            ...alias.objects
              .map((object) => object.aliasCountry)
              .filter((country): country is string => !!country),
          ]),
        ],
        rows: alias.effectivenessRows.length,
        days: alias.effectivenessRows.reduce(
          (sum, row) => sum + row.days.length,
          0,
        ),
        campaigns: alias.objects.length,
      })),
    historyPreserved: true,
  };
}
export type InventoryUnificationPreview = ReturnType<typeof view>;
export async function previewInventoryUnification(
  actor: Actor,
  input: unknown,
) {
  const b = selection.parse(input);
  return db.$transaction(async (tx) => view(await plan(tx, actor, b)), {
    timeout: 60000,
    isolationLevel: "RepeatableRead",
  });
}
export async function unifyInventoryDiplomas(actor: Actor, input: unknown) {
  const b = confirmation.parse(input);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      await authorize(tx, actor, b.listId);
      const requestHash = digest(b),
        prior = await tx.auditEvent.findFirst({
          where: {
            actorId: actor.id,
            resourceId: b.listId,
            action: "META_INVENTARIO_UNIFICADO",
            detail: { path: ["requestId"], equals: b.requestId },
          },
        });
      if (prior) {
        const detail = prior.detail as {
          requestHash?: string;
          result?: {
            targetId: string;
            targetName: string;
            sourceIds: string[];
            historyPreserved: boolean;
          };
        };
        demand(
          detail.requestHash === requestHash && detail.result,
          "Esta solicitud ya se utilizó. Revisa el inventario.",
          409,
        );
        return detail.result;
      }
      const p = await plan(tx, actor, {
        listId: b.listId,
        sourceIds: b.sourceIds,
        targetId: b.targetId,
      });
      demand(
        p.token === b.token,
        "Los datos o vínculos cambiaron. Revisa de nuevo antes de unificar.",
        409,
      );
      demand(!p.reasons.length, p.reasons.join(" "), 409);
      const target =
        p.targetItem ??
        (await tx.metaInventoryItem.create({
          data: { sheetId: b.listId, name: p.target.name },
        }));
      const categories = p.tags.map((tag) => tag.id);
      if (categories.length)
        await tx.metaInventoryItemCategory.createMany({
          data: categories.map((categoryId) => ({
            itemId: target.id,
            categoryId,
          })),
          skipDuplicates: true,
        });
      const advisors = [
        ...new Set(
          [
            ...(p.targetItem?.advisors ?? []),
            ...p.sources.flatMap((item) => item.advisors),
          ].map((entry) => entry.advisorId),
        ),
      ];
      if (advisors.length)
        await tx.metaInventoryAdvisor.createMany({
          data: advisors.map((advisorId) => ({ itemId: target.id, advisorId })),
          skipDuplicates: true,
        });
      await tx.metaInventoryItem.update({
        where: { id: target.id },
        data: {
          syllabi: p.syllabi,
          syllabusRevision: { increment: 1 },
          advisorRevision: { increment: 1 },
        },
      });
      for (const alias of p.aliases) {
        if (alias.name !== p.target.name)
          await tx.metaAlias.update({
            where: { id: alias.id },
            data: { name: p.target.name },
          });
        if (categories.length)
          await tx.metaInventoryCategoryAssignment.createMany({
            data: categories.map((categoryId) => ({
              aliasId: alias.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
      }
      for (const group of p.affectedGroups) {
        const payload = structuredClone(
          group.payload,
        ) as unknown as TrialPayload;
        for (const entry of [...payload.members, ...payload.cycles])
          if (
            p.sourceKeys.has(categoryKey(entry.name)) ||
            categoryKey(entry.name) === p.targetKey
          ) {
            entry.itemId = target.id;
            entry.name = p.target.name;
          }
        await tx.metaInventoryTrialGroup.update({
          where: { id: group.id },
          data: {
            payload: payload as unknown as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
        });
      }
      await tx.metaInventoryItem.deleteMany({
        where: { id: { in: p.sources.map((item) => item.id) } },
      });
      await tx.metaEffectivenessSheet.update({
        where: { id: b.listId },
        data: {
          config: p.config,
          revision: { increment: 1 },
          categoryRevision: { increment: 1 },
        },
      });
      const result = {
        targetId: target.id,
        targetName: p.target.name,
        sourceIds: b.sourceIds,
        historyPreserved: true,
      };
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_INVENTARIO_UNIFICADO",
          resourceId: b.listId,
          detail: {
            requestId: b.requestId,
            requestHash,
            result,
            sourceNames: p.chosen.map((item) => item.name),
            aliases: p.aliases.map((alias) => ({
              id: alias.id,
              tableId: alias.tableId,
              from: alias.name,
              to: p.target.name,
            })),
            groups: p.affectedGroups.map((group) => ({
              id: group.id,
              before: group.payload,
            })),
            sheetConfigBefore: p.list.config,
          },
        },
      });
      return result;
    },
    { timeout: 60000 },
  );
}
