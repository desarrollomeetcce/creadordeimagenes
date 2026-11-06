import type { TrialDirectory } from "./inventory-trials";
import { categoryKey } from "./category-paste";
import { isCountryCode } from "./countries";
import { replacementUsage } from "./inventory-replacement-groups";
/** Counts follow the same country-specific usage policy as replacement candidates. */
export function groupAvailabilityLabels(
  directory: Pick<
    TrialDirectory,
    "groups" | "usage" | "catalog" | "usageReady"
  >,
  country: string,
) {
  const catalog = new Set(directory.catalog.map((i) => categoryKey(i.name))),
    labels = new Map<string, string>();
  for (const g of directory.groups) {
    const names = [
      ...new Set(g.members.map((m) => categoryKey(m.name))),
    ].filter((n) => catalog.has(n));
    const base = `${g.name} · ${names.length}`;
    labels.set(
      g.id,
      !isCountryCode(country)
        ? base
        : directory.usageReady === false
          ? base + " — uso pendiente"
          : base +
            ` — ${names.filter((n) => replacementUsage(directory, n, country) === "NEVER").length} sin usar`,
    );
  }
  return labels;
}
