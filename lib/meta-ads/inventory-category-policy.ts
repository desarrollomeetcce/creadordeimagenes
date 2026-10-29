import { Prisma } from "@prisma/client";
import { demand } from "../errors";
import { categoryKey } from "./category-paste";
type Category = { id: string; name: string; kind: string };
/** Explicit incoming choices win over old uses. If one request includes both levels, principal wins. Untouched legacy names are preserved. */
export function categoryAssignmentTags(
  definitions: Iterable<Category>,
  existing: Iterable<string>,
  incoming: Iterable<string>,
) {
  const byId = new Map([...definitions].map((c) => [c.id, c])),
    chosen = new Map<string, Category>();
  for (const id of incoming) {
    const c = byId.get(id);
    demand(c, "Categoría no disponible.", 404);
    const key = categoryKey(c.name),
      old = chosen.get(key);
    if (!old || (c.kind === "PRIMARY" && old.kind !== "PRIMARY"))
      chosen.set(key, c);
  }
  const kept = [...existing].filter((id) => {
    const c = byId.get(id);
    demand(c, "Categoría no disponible.", 404);
    return !chosen.has(categoryKey(c.name));
  });
  return [...new Set([...kept, ...[...chosen.values()].map((c) => c.id)])];
}
/** Remove only obsolete assignment pairs of edited items, in bounded parameterized batches. */
export async function removeCategoryTagPairs(
  tx: Prisma.TransactionClient,
  items: { itemId: string; categoryId: string }[],
  aliases: { aliasId: string; categoryId: string }[],
) {
  for (let start = 0; start < items.length; start += 5000) {
    const payload = JSON.stringify(items.slice(start, start + 5000));
    await tx.$executeRaw(
      Prisma.sql`DELETE FROM "MetaInventoryItemCategory" t USING jsonb_to_recordset(${payload}::jsonb) AS r("itemId" text,"categoryId" text) WHERE t."itemId"=r."itemId" AND t."categoryId"=r."categoryId"`,
    );
  }
  for (let start = 0; start < aliases.length; start += 5000) {
    const payload = JSON.stringify(aliases.slice(start, start + 5000));
    await tx.$executeRaw(
      Prisma.sql`DELETE FROM "MetaInventoryCategoryAssignment" t USING jsonb_to_recordset(${payload}::jsonb) AS r("aliasId" text,"categoryId" text) WHERE t."aliasId"=r."aliasId" AND t."categoryId"=r."categoryId"`,
    );
  }
}
