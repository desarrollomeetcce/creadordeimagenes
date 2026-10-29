import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import {
  categoryAssignmentTags,
  removeCategoryTagPairs,
} from "./inventory-category-policy";
import { categoryIdentity } from "./category-paste";
import { effectivenessLock } from "./effectiveness";
import {
  syllabiSchema,
  catalogPackageSchema,
  catalogNameKey,
  type InventoryCatalogPackage,
} from "./inventory-syllabi-policy";
import type { Actor } from "./service";
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const sheetKey = (v: string) => catalogNameKey(v).replace(/\s/g, "");
export async function readSyllabi(actor: Actor, listId: string, name: string) {
  ownerOnly(actor);
  demand(
    await db.metaEffectivenessSheet.findFirst({
      where: { id: listId, kind: "INVENTORY", archivedAt: null },
    }),
    "Inventario no disponible.",
    404,
  );
  const item = await db.metaInventoryItem.findFirst({
    where: { sheetId: listId, name },
  });
  demand(
    item ||
      (await db.metaAlias.findFirst({
        where: { inventorySheetId: listId, name },
      })),
    "Inventario no disponible.",
    404,
  );
  return {
    name,
    revision: item?.syllabusRevision ?? 0,
    syllabi: syllabiSchema.parse(item?.syllabi ?? []),
  };
}
export async function saveSyllabi(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = z
    .object({
      listId: z.string().min(1).max(100),
      name: z.string().trim().min(1).max(150),
      revision: z.number().int().nonnegative(),
      syllabi: syllabiSchema,
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaEffectivenessSheet.findFirst({
        where: { id: b.listId, kind: "INVENTORY", archivedAt: null },
      }),
      "Inventario no disponible.",
      404,
    );
    const item = await tx.metaInventoryItem.findFirst({
        where: { sheetId: b.listId, name: b.name },
      }),
      aliases = await tx.metaAlias.findMany({
        where: { inventorySheetId: b.listId, name: b.name },
        select: { id: true },
      });
    demand(
      item || aliases.length,
      "El inventario cambió. Recarga antes de guardar.",
      409,
    );
    demand(
      (item?.syllabusRevision ?? 0) === b.revision,
      "Los temarios cambiaron. Actualiza antes de guardar.",
      409,
    );
    const row = item
      ? await tx.metaInventoryItem.update({
          where: { id: item.id },
          data: { syllabi: b.syllabi, syllabusRevision: { increment: 1 } },
        })
      : await tx.metaInventoryItem.create({
          data: {
            sheetId: b.listId,
            name: b.name,
            syllabi: b.syllabi,
            syllabusRevision: 1,
          },
        });
    if (!item && aliases.length) {
      const tags = await tx.metaInventoryCategoryAssignment.findMany({
        where: {
          aliasId: { in: aliases.map((a) => a.id) },
          category: { sheetId: b.listId },
        },
        select: { categoryId: true },
      });
      const inherited = categoryAssignmentTags(
        await tx.metaInventoryCategory.findMany({
          where: { sheetId: b.listId },
        }),
        [],
        tags.map((t) => t.categoryId),
      );
      await tx.metaInventoryItemCategory.createMany({
        data: inherited.map((categoryId) => ({
          itemId: row.id,
          categoryId,
        })),
        skipDuplicates: true,
      });
    }
    await tx.metaEffectivenessSheet.update({
      where: { id: b.listId },
      data: { categoryRevision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "INVENTARIO_TEMARIOS_GUARDADOS",
        resourceId: row.id,
        detail: { listId: b.listId, count: b.syllabi.length },
      },
    });
    return {
      revision: row.syllabusRevision,
      syllabi: syllabiSchema.parse(row.syllabi),
    };
  });
}
async function snapshot(
  tx: Prisma.TransactionClient,
  p: InventoryCatalogPackage,
) {
  const candidates = await tx.metaEffectivenessSheet.findMany({
      where: { kind: "INVENTORY", archivedAt: null },
    }),
    matches = candidates.filter(
      (s) => sheetKey(s.name) === sheetKey(p.targetName),
    );
  demand(
    matches.length <= 1,
    "Hay más de un inventario con ese nombre. Renómbralos antes de importar.",
    409,
  );
  const target = matches[0] ?? null;
  const contents = target
    ? await Promise.all([
        tx.metaInventoryItem.findMany({
          where: { sheetId: target.id },
          select: {
            id: true,
            name: true,
            syllabusRevision: true,
            categories: {
              select: { categoryId: true },
              orderBy: { categoryId: "asc" },
            },
          },
          orderBy: { id: "asc" },
        }),
        tx.metaAlias.findMany({
          where: { inventorySheetId: target.id },
          select: {
            id: true,
            name: true,
            categoryAssignments: {
              select: { categoryId: true },
              orderBy: { categoryId: "asc" },
            },
          },
          orderBy: { id: "asc" },
        }),
        tx.metaInventoryCategory.findMany({
          where: { sheetId: target.id },
          select: { id: true, name: true, kind: true, key: true },
          orderBy: { id: "asc" },
        }),
      ])
    : [];
  return {
    target,
    token: digest({
      package: p,
      contents,
      target: target
        ? { id: target.id, revision: target.categoryRevision }
        : null,
    }),
  };
}
export async function previewCatalogPackage(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const p = catalogPackageSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const { target, token } = await snapshot(tx, p),
        items = target
          ? await tx.metaInventoryItem.findMany({
              where: { sheetId: target.id },
              select: { name: true },
            })
          : [];
      const existing = new Set(items.map((i) => catalogNameKey(i.name)));
      return {
        targetId: target?.id ?? null,
        targetName: target?.name ?? p.targetName,
        token,
        items: p.items.length,
        newItems: p.items.filter((i) => !existing.has(catalogNameKey(i.name)))
          .length,
        existingItems: p.items.filter((i) =>
          existing.has(catalogNameKey(i.name)),
        ).length,
        syllabi: p.items.reduce((n, i) => n + i.syllabi.length, 0),
        categories: [
          ...new Set(
            p.categories.concat(
              p.items.flatMap((i) => [i.primary, ...i.secondary]),
            ),
          ),
        ],
        createTarget: !target,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function importCatalogPackage(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = z
      .object({
        package: catalogPackageSchema,
        token: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(input),
    p = b.package;
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const snap = await snapshot(tx, p);
      demand(
        snap.token === b.token,
        "El destino cambió. Revisa la importación de nuevo.",
        409,
      );
      const target =
        snap.target ??
        (await tx.metaEffectivenessSheet.create({
          data: { kind: "INVENTORY", name: p.targetName },
        }));
      const [items, aliases, definitions] = await Promise.all([
        tx.metaInventoryItem.findMany({
          where: { sheetId: target.id },
          include: { categories: { select: { categoryId: true } } },
        }),
        tx.metaAlias.findMany({
          where: { inventorySheetId: target.id },
          include: { categoryAssignments: { select: { categoryId: true } } },
        }),
        tx.metaInventoryCategory.findMany({ where: { sheetId: target.id } }),
      ]);
      const uniqueMap = <T extends { name: string }>(rows: T[]) => {
        const m = new Map<string, T>();
        for (const row of rows) {
          const k = catalogNameKey(row.name);
          demand(
            !m.has(k),
            `Existen nombres equivalentes en el destino: ${row.name}. Revísalos antes de importar.`,
            409,
          );
          m.set(k, row);
        }
        return m;
      };
      const itemMap = uniqueMap(items),
        categoryMap = new Map<string, (typeof definitions)[number]>();
      for (const c of definitions) {
        const k = c.kind + "|" + catalogNameKey(c.name);
        demand(
          !categoryMap.has(k),
          `Hay categorías equivalentes: ${c.name}. Revísalas antes de importar.`,
          409,
        );
        categoryMap.set(k, c);
      }
      const newDefs: typeof definitions = [];
      const category = (kind: string, name: string) => {
        const k = kind + "|" + catalogNameKey(name);
        let c = categoryMap.get(k);
        if (!c) {
          name = categoryIdentity(name);
          c = {
            id: randomUUID(),
            sheetId: target.id,
            kind,
            name,
            key: categoryIdentity(name),
          };
          categoryMap.set(k, c);
          newDefs.push(c);
        }
        return c;
      };
      for (const name of p.categories) category("PRIMARY", name);
      for (const i of p.items) {
        category("PRIMARY", i.primary);
        for (const s of i.secondary) category("SECONDARY", s);
      }
      demand(categoryMap.size <= 1000, "El destino supera 1000 categorías.");
      if (newDefs.length)
        await tx.metaInventoryCategory.createMany({ data: newDefs });
      const newItems: {
          id: string;
          sheetId: string;
          name: string;
          syllabi: Prisma.InputJsonValue;
          syllabusRevision: number;
        }[] = [],
        tags: { itemId: string; categoryId: string }[] = [],
        aliasTags: { aliasId: string; categoryId: string }[] = [],
        relations: { primaryId: string; secondaryId: string }[] = [];
      let addedSyllabi = 0,
        reused = 0;
      for (const incoming of p.items) {
        const old = itemMap.get(catalogNameKey(incoming.name)),
          group = aliases.filter(
            (a) => catalogNameKey(a.name) === catalogNameKey(incoming.name),
          );
        const groupNames = [...new Set(group.map((a) => a.name))];
        demand(
          groupNames.length <= 1,
          `Hay inventarios equivalentes con escritura distinta: ${incoming.name}.`,
          409,
        );
        const name = old?.name ?? groupNames[0] ?? incoming.name,
          id = old?.id ?? randomUUID();
        const previous = syllabiSchema.parse(old?.syllabi ?? []),
          merged = [...previous];
        for (const syllabus of incoming.syllabi) {
          if (
            merged.some(
              (s) =>
                s.id === syllabus.id ||
                (s.scope === syllabus.scope && s.content === syllabus.content),
            )
          )
            continue;
          merged.push(syllabus);
          addedSyllabi++;
        }
        syllabiSchema.parse(merged);
        if (old) {
          reused++;
          if (merged.length !== previous.length)
            await tx.metaInventoryItem.update({
              where: { id },
              data: { syllabi: merged, syllabusRevision: { increment: 1 } },
            });
        } else
          newItems.push({
            id,
            sheetId: target.id,
            name,
            syllabi: merged,
            syllabusRevision: merged.length ? 1 : 0,
          });
        const oldTags = [
            ...new Set([
              ...(old?.categories.map((c) => c.categoryId) ?? []),
              ...group.flatMap((a) =>
                a.categoryAssignments.map((c) => c.categoryId),
              ),
            ]),
          ],
          primary = oldTags.filter((id) =>
            definitions.some((c) => c.id === id && c.kind === "PRIMARY"),
          );
        const primaryIds = primary.length
            ? primary
            : [category("PRIMARY", incoming.primary).id],
          secondary = incoming.secondary.map(
            (n) => category("SECONDARY", n).id,
          ),
          chosen = categoryAssignmentTags(categoryMap.values(), oldTags, [
            ...primaryIds,
            ...secondary,
          ]);
        await removeCategoryTagPairs(
          tx,
          (old?.categories ?? [])
            .filter((c) => !chosen.includes(c.categoryId))
            .map((c) => ({ itemId: id, categoryId: c.categoryId })),
          group.flatMap((a) =>
            a.categoryAssignments
              .filter((c) => !chosen.includes(c.categoryId))
              .map((c) => ({ aliasId: a.id, categoryId: c.categoryId })),
          ),
        );
        for (const categoryId of chosen) {
          tags.push({ itemId: id, categoryId });
          for (const a of group) aliasTags.push({ aliasId: a.id, categoryId });
        }
        for (const primaryId of primaryIds)
          for (const secondaryId of secondary)
            if (
              chosen.includes(primaryId) &&
              chosen.includes(secondaryId) &&
              primaryId !== secondaryId
            )
              relations.push({ primaryId, secondaryId });
      }
      demand(
        items.length + newItems.length <= 1500,
        "El inventario supera 1500 ítems.",
      );
      if (newItems.length)
        await tx.metaInventoryItem.createMany({ data: newItems });
      if (tags.length)
        await tx.metaInventoryItemCategory.createMany({
          data: tags,
          skipDuplicates: true,
        });
      if (aliasTags.length)
        await tx.metaInventoryCategoryAssignment.createMany({
          data: aliasTags,
          skipDuplicates: true,
        });
      if (relations.length)
        await tx.metaInventoryCategoryRelation.createMany({
          data: relations,
          skipDuplicates: true,
        });
      await tx.metaEffectivenessSheet.update({
        where: { id: target.id },
        data: { categoryRevision: { increment: 1 } },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "INVENTARIO_CATALOGO_CARGADO",
          resourceId: target.id,
          detail: {
            created: newItems.length,
            reused,
            addedSyllabi,
            categories: newDefs.length,
            packageHash: digest(p),
          },
        },
      });
      return {
        listId: target.id,
        name: target.name,
        created: newItems.length,
        reused,
        addedSyllabi,
      };
    },
    { timeout: 120000 },
  );
}
