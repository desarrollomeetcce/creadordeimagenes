import { categoryKey } from "./category-paste";
import type { TrialDirectory } from "./inventory-trials";
import type { TrialItem } from "./inventory-trial-policy";
export type ReplacementUsageFilter = "ALL" | "UNUSED" | "USED" | "UNKNOWN";
export function replacementUsage(
  directory: Pick<TrialDirectory, "usage">,
  name: string,
  country: string,
  now = Date.now(),
) {
  const cell = directory.usage[JSON.stringify([categoryKey(name), country])];
  return !cell
    ? "NEVER"
    : cell.mode === "USED"
      ? "USED"
      : cell.mode === "UNUSED"
        ? "NEVER"
        : cell.nextUsedAt && Date.parse(cell.nextUsedAt) <= now
          ? "USED"
          : cell.automatic;
}
export const replacementUsageLabel = (
  status: ReturnType<typeof replacementUsage>,
) =>
  status === "USED"
    ? "Usado · 12 h o manual"
    : status === "TEST"
      ? "En prueba · menos de 12 h"
      : status === "UNKNOWN"
        ? "Uso sin confirmar"
        : "Falta usar";
export const replacementUsageRank = (
  status: ReturnType<typeof replacementUsage>,
) => ({ NEVER: 0, TEST: 1, UNKNOWN: 2, USED: 3 })[status];
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
            (filter === "UNUSED" && (s === "NEVER" || s === "TEST")) ||
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
