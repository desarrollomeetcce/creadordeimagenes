import { groupUsageStatus } from "./inventory-group-usage-policy";
import { categoryKey } from "./category-paste";
import type { TrialDirectory } from "./inventory-trials";
import type { TrialItem } from "./inventory-trial-policy";
export type ReplacementUsageFilter = "ALL" | "UNUSED" | "USED";
export function replacementUsage(
  directory: Pick<TrialDirectory, "usage">,
  name: string,
  country: string,
  now = Date.now(),
) {
  const cell = directory.usage[JSON.stringify([categoryKey(name), country])];
  return groupUsageStatus(cell, now);
}
export const replacementUsageLabel = (
  status: ReturnType<typeof replacementUsage>,
) => (status === "USED" ? "Usado" : "Sin usar");
export const replacementUsageRank = (
  status: ReturnType<typeof replacementUsage>,
) => (status === "USED" ? 1 : 0);

export function groupReplacementCandidates(
  items: TrialItem[],
  directory: Pick<TrialDirectory, "groups" | "usage">,
  country: string,
  groupId: string,
  filter: ReplacementUsageFilter,
) {
  const group = directory.groups.find((g) => g.id === groupId),
    members = new Set(group?.members.map((m) => categoryKey(m.name)) ?? []);
  return items
    .filter(
      (i) =>
        (!groupId || (!!group && members.has(categoryKey(i.name)))) &&
        (() => {
          const s = replacementUsage(directory, i.name, country);
          return (
            filter === "ALL" ||
            (filter === "UNUSED" && s === "NEVER") ||
            filter === s
          );
        })(),
    )
    .sort(
      (a, b) =>
        replacementUsageRank(replacementUsage(directory, a.name, country)) -
          replacementUsageRank(replacementUsage(directory, b.name, country)) ||
        a.name.localeCompare(b.name, "es"),
    );
}
