import type { TrialItem } from "./inventory-trial-policy";
import { categoryKey } from "./category-paste";
export function categoryAdditionSections(items: TrialItem[], category: string) {
  const key = categoryKey(category),
    unique = [...new Map(items.map((item) => [item.id, item])).values()];
  const primary = unique.filter(
    (item) =>
      !key || item.primaryNames.some((name) => categoryKey(name) === key),
  );
  const primaryIds = new Set(primary.map((item) => item.id));
  const secondary = key
    ? unique.filter(
        (item) =>
          !primaryIds.has(item.id) &&
          item.secondaryNames?.some((name) => categoryKey(name) === key),
      )
    : [];
  return { primary, secondary };
}
export function randomInventoryAdditions(
  items: TrialItem[],
  count: number,
  excluded: string[] = [],
  random = Math.random,
) {
  const removed = new Set(excluded),
    pool = [...new Map(items.map((item) => [item.id, item])).values()].filter(
      (item) => !removed.has(item.id),
    );
  const limit = Number.isFinite(count)
    ? Math.max(0, Math.min(100, Math.floor(count)))
    : 0;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}
export function randomCategoryAdditions(
  items: TrialItem[],
  category: string,
  count: number,
  excluded: string[] = [],
  random = Math.random,
) {
  if (!category.trim()) return [];
  const sections = categoryAdditionSections(items, category);
  return randomInventoryAdditions(
    [...sections.primary, ...sections.secondary],
    count,
    excluded,
    random,
  );
}
/** Replace one proposed entry without mutating the rest, duplicating entries or selecting the same item again. */
export function replaceRandomAddition(proposal: TrialItem[], itemId: string, pool: TrialItem[], excluded: string[] = [], category?: string, random = Math.random) {
 if(!proposal.some(item=>item.id===itemId)) return null;
 const blocked=[...excluded,...proposal.map(item=>item.id)];
 const replacement=(category ? randomCategoryAdditions(pool,category,1,blocked,random) : randomInventoryAdditions(pool,1,blocked,random))[0];
 return replacement ? proposal.map(item=>item.id===itemId?replacement:item) : null;
}
