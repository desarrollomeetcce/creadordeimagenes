import type { TrialItem } from "./inventory-trial-policy";
export type GroupReplacementMode = "ANY" | "SAME" | "OTHER" | "DIVERSE";
export function groupReplacementMatches(
  source: TrialItem,
  target: TrialItem,
  mode: GroupReplacementMode,
) {
  if (source.id === target.id) return false;
  if (mode === "SAME")
    return (
      source.primaryIds.length > 0 &&
      source.primaryIds.length === target.primaryIds.length &&
      source.primaryIds.every((id) => target.primaryIds.includes(id))
    );
  if (mode === "OTHER")
    return (
      target.primaryIds.length > 0 &&
      !target.primaryIds.some((id) => source.primaryIds.includes(id))
    );
  return mode !== "DIVERSE" || target.primaryIds.length > 0;
}
export function proposeGroupReplacements(
  sources: TrialItem[],
  candidates: TrialItem[],
  mode: GroupReplacementMode,
  random = Math.random,
) {
  const available = candidates
    .map((item) => ({ item, rank: random() }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.item);
  const selected = new Set(sources.map((item) => item.id)),
    used = new Set<string>(),
    areas = new Set<string>();
  return sources.map((source) => {
    const target = available.find(
      (item) =>
        !selected.has(item.id) &&
        !used.has(item.id) &&
        groupReplacementMatches(source, item, mode) &&
        (mode !== "DIVERSE" || !item.primaryIds.some((id) => areas.has(id))),
    );
    if (target) {
      used.add(target.id);
      target.primaryIds.forEach((id) => areas.add(id));
    }
    return { itemId: source.id, replacementId: target?.id ?? "" };
  });
}
