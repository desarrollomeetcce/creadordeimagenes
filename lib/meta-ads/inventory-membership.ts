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
  await tx.metaEffectivenessSheet.update({
    where: { id: listId },
    data: {
      config: {
        ...config,
        inventoryActivation: { ...activation, detachedAliases: [...current] },
      },
      revision: { increment: 1 },
    },
  });
  await tx.metaEffectivenessRow.updateMany({
    where: { aliasId: { in: ids }, alias: { inventorySheetId: listId } },
    data: { hidden: detached, revision: { increment: 1 } },
  });
  return true;
}
