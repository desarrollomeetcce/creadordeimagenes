import type { Prisma } from "@prisma/client";
export function detachedInventoryAliases(config: Prisma.JsonValue): string[] {
  const ids = (
    config as { inventoryActivation?: { detachedAliases?: unknown } }
  )?.inventoryActivation?.detachedAliases;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}
/** Caller holds884411. Membership is separate from financial rows, activations and history. */
export async function setInventoryMembership(
  tx: Prisma.TransactionClient,
  listId: string,
  ids: string[],
  detached: boolean,
  restoreRows = true,
) {
  const list = await tx.metaEffectivenessSheet.findUniqueOrThrow({
    where: { id: listId },
  });
  const current = new Set(detachedInventoryAliases(list.config));
  let changed = false;
  for (const id of ids)
    if (detached ? !current.has(id) : current.has(id)) {
      changed = true;
      if (detached) current.add(id);
      else current.delete(id);
    }
  if (!changed) return false;
  const config = list.config as Prisma.JsonObject;
  const activation = config.inventoryActivation as
    Prisma.JsonObject | undefined;
  const controls = { ...((activation?.rows as Prisma.JsonObject) ?? {}) };
  if (!detached && restoreRows) {
    const inactive = await tx.metaEffectivenessState.findMany({
      where: { aliasId: { in: ids }, active: false },
      select: { aliasId: true, country: true },
    });
    for (const row of inactive) {
      const key = row.aliasId + "|" + row.country;
      controls[key] = {
        ...((controls[key] as Prisma.JsonObject) ?? {}),
        pinned: true,
        campaignTask: "NONE",
      };
    }
  }
  await tx.metaEffectivenessSheet.update({
    where: { id: listId },
    data: {
      config: {
        ...config,
        inventoryActivation: {
          ...activation,
          rows: controls,
          detachedAliases: [...current],
        },
      },
      revision: { increment: 1 },
    },
  });
  if (detached || restoreRows)
    await tx.metaEffectivenessRow.updateMany({
      where: { aliasId: { in: ids }, alias: { inventorySheetId: listId } },
      data: { hidden: detached, revision: { increment: 1 } },
    });
  return true;
}

/** Existing hidden financial identities are not current sheet membership, even in older configs. */
export async function physicallyHiddenInventoryAliases(
  tx: Pick<Prisma.TransactionClient, "metaEffectivenessRow">,
  ids: string[],
) {
  if (!ids.length) return [];
  const rows = await tx.metaEffectivenessRow.findMany({
    where: { aliasId: { in: ids }, legacy: false },
    select: { aliasId: true, hidden: true },
  });
  const known = new Set(rows.map((r) => r.aliasId)),
    visible = new Set(rows.filter((r) => !r.hidden).map((r) => r.aliasId));
  return [...known].filter((id) => !visible.has(id));
}
