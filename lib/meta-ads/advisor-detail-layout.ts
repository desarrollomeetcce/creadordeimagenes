export const advisorModuleIds = [
  "inventory-analysis",
  "sold-days",
  "days",
  "chart",
  "assignments",
  "products",
] as const;
export type AdvisorModuleId = (typeof advisorModuleIds)[number];
export type AdvisorModuleLayout = AdvisorModuleId[][];
export type ModulePlacement = "before" | "after" | "left" | "right";
export const defaultAdvisorLayout: AdvisorModuleLayout = [
  ["inventory-analysis"],
  ["sold-days", "days"],
  ["chart"],
  ["assignments"],
  ["products"],
];
export function normalizeAdvisorLayout(raw: unknown): AdvisorModuleLayout {
  if (!Array.isArray(raw)) return defaultAdvisorLayout.map((r) => [...r]);
  const seen = new Set<string>(),
    rows: AdvisorModuleLayout = [];
  for (const entry of raw.slice(0, 6)) {
    if (typeof entry !== "string" || entry.length > 160) continue;
    const row: AdvisorModuleId[] = [];
    for (const id of entry.split("|")) {
      if (advisorModuleIds.includes(id as AdvisorModuleId) && !seen.has(id)) {
        seen.add(id);
        row.push(id as AdvisorModuleId);
      }
    }
    for (let i = 0; i < row.length; i += 2) rows.push(row.slice(i, i + 2));
  }
  if (!seen.size) return defaultAdvisorLayout.map((r) => [...r]);
  for (const id of advisorModuleIds) if (!seen.has(id)) rows.push([id]);
  return rows;
}
export function moveAdvisorModule(
  layout: AdvisorModuleLayout,
  source: AdvisorModuleId,
  target: AdvisorModuleId,
  placement: ModulePlacement,
): AdvisorModuleLayout {
  const original = normalizeAdvisorLayout(layout.map((r) => r.join("|")));
  if (
    source === target ||
    !advisorModuleIds.includes(source) ||
    !advisorModuleIds.includes(target)
  )
    return original;
  const rows = original
    .map((r) => r.filter((id) => id !== source))
    .filter((r) => r.length);
  const index = rows.findIndex((r) => r.includes(target));
  if (placement === "before" || placement === "after") {
    rows.splice(index + (placement === "after" ? 1 : 0), 0, [source]);
  } else {
    const targetRow = rows[index],
      targetIndex = targetRow.indexOf(target);
    const pair: AdvisorModuleId[] =
      placement === "left" ? [source, target] : [target, source];
    const other = targetRow.filter((id) => id !== target);
    rows.splice(
      index,
      1,
      ...(other.length
        ? targetIndex === 0
          ? [pair, other]
          : [other, pair]
        : [pair]),
    );
  }
  return rows;
}
