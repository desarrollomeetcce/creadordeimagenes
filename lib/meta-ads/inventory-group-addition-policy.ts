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
export function randomCategoryAdditions(
  items: TrialItem[],
  category: string,
  count: number,
  excluded: string[] = [],
  random = Math.random,
) {
  if (!category.trim()) return [];
  const sections = categoryAdditionSections(items, category),
    removed = new Set(excluded),
    pool = [...sections.primary, ...sections.secondary].filter(
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
