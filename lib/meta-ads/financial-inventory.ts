import type { Prisma } from "@prisma/client";
import { demand } from "../errors";
import { activeWorkbookSheetId } from "./workbook-scope";
import {
  resolveInventoryName,
  type InventoryNameDecision,
} from "./inventory-duplicates";
import { writeInventoryTags } from "./inventory-categories";
import { setInventoryMembership } from "./inventory-membership";

/** Caller holds the financial write lock. Linking a catalog never transfers another list's data. */
export async function linkFinancialInventory(
  tx: Prisma.TransactionClient,
  tableId: string,
  listId: string,
  entries: { name: string; country: string; currency: string }[],
  decisions: InventoryNameDecision[] = [],
) {
  await activeWorkbookSheetId(tx, "INVENTORY", listId);
  const items = await tx.metaInventoryItem.findMany({
    where: { sheetId: listId },
  });
  const aliases = await tx.metaAlias.findMany({
    select: { id: true, name: true, tableId: true, inventorySheetId: true },
  });
  const names = [
    ...items.map((i) => i.name),
    ...aliases.filter((a) => a.inventorySheetId === listId).map((a) => a.name),
  ];
  const resolved = entries.map((e) => {
    const name = resolveInventoryName("INVENTORY", e.name, names, decisions);
    names.push(name);
    return { ...e, name };
  });
  let created = 0;
  for (const name of new Set(resolved.map((e) => e.name))) {
    let alias = aliases.find((a) => a.tableId === tableId && a.name === name);
    demand(
      !alias || alias.inventorySheetId === listId,
      `«${name}» ya está vinculado a esta hoja desde otro inventario. Selecciona ese inventario.`,
      409,
    );
    let item = items.find((i) => i.name === name);
    if (!item) {
      demand(items.length < 1500, "Máximo 1500 ítems por lista de inventario.");
      item = await tx.metaInventoryItem.create({
        data: { sheetId: listId, name },
      });
      items.push(item);
    }
    if (!alias) {
      demand(
        aliases.length < 1500,
        "El catálogo admite hasta 1500 asignaciones a hojas.",
      );
      alias = await tx.metaAlias.create({
        data: { tableId, inventorySheetId: listId, name },
      });
      aliases.push(alias);
      created++;
    } else if (await setInventoryMembership(tx, listId, [alias.id], false))
      created++;
    const group = aliases.filter(
      (a) => a.inventorySheetId === listId && a.name === name,
    );
    const assignments = await tx.metaInventoryCategoryAssignment.findMany({
      where: { aliasId: { in: group.map((a) => a.id) } },
    });
    const own = await tx.metaInventoryItemCategory.findMany({
      where: { itemId: item.id },
    });
    const ids = [...new Set([...assignments, ...own].map((c) => c.categoryId))];
    const categories = await tx.metaInventoryCategory.findMany({
      where: { id: { in: ids } },
    });
    demand(
      categories.every((c) => c.sheetId === listId),
      "Las categorías cambiaron. Recarga.",
      409,
    );
    for (const kind of ["PRIMARY", "SECONDARY"])
      demand(
        categories.filter((c) => c.kind === kind).length <= 20,
        "Máximo 20 categorías por nivel e ítem.",
      );
    await writeInventoryTags(tx, [item.id, ...group.map((a) => a.id)], ids);
  }
  await tx.metaEffectivenessSheet.update({
    where: { id: listId },
    data: { categoryRevision: { increment: 1 } },
  });
  return { entries: resolved, created };
}
