import {
  groupCountryCampaignState,
  type GroupCountryCampaignState,
} from "./inventory-group-country-state";
import type { Prisma } from "@prisma/client";
import { activationSettings } from "./inventory-sheet-activation";
import { inventorySheetCountries } from "./inventory-sheet-column-policy";
import { sheetCountryIdentities } from "./sheet-country-identity";
import { countryName } from "./countries";
import { categoryKey } from "./category-paste";
import { inventoryCountryUsage, type InventoryUsage } from "./inventory-usage";
export type GroupUsageMode = "AUTO" | "USED" | "UNUSED";
export type GroupUsageCell = {
  automatic: InventoryUsage;
  activationHours: number | null;
  nextUsedAt?: string | null;
  mode: GroupUsageMode;
  revision: string | null;
};
export const groupUsageKey = (name: string, country: string) =>
  JSON.stringify([categoryKey(name), country]);
export function groupUsageOverrides(
  config: Prisma.JsonValue,
): Record<string, { mode: "USED" | "UNUSED"; revision: string }> {
  const value = (config as Record<string, unknown>)?.inventoryGroupUsage;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) =>
        v &&
        typeof v === "object" &&
        ["USED", "UNUSED"].includes(v.mode) &&
        typeof v.revision === "string",
    ),
  );
}
/** One local batch: no financial facts, Graph request, or per-diploma query. */
export async function inventoryGroupUsage(
  tx: Prisma.TransactionClient,
  listId: string,
) {
  const list = await tx.metaEffectivenessSheet.findUniqueOrThrow({
    where: { id: listId },
    select: { config: true },
  });
  const settings = activationSettings(list.config);
  const aliases = await tx.metaAlias.findMany({
    where: { inventorySheetId: listId },
    select: {
      id: true,
      name: true,
      tableId: true,
      effectivenessRows: {
        where: { legacy: false },
        select: { country: true, hidden: true },
      },
      effectivenessStates: {
        select: {
          country: true,
          active: true,
          events: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { active: true, createdAt: true, snapshot: true },
          },
        },
      },
    },
  });
  const tables = await tx.metaAliasTable.findMany({
    where: {
      id: {
        in: [
          ...new Set([...settings.sheets, ...aliases.map((a) => a.tableId)]),
        ],
      },
    },
    select: { id: true, name: true, defaultCountry: true },
  });
  const identities = await sheetCountryIdentities(
    tx,
    tables.map((t) => t.id),
  );
  // Only configured sheets define columns; foreign historical country values never add a country.
  const countryCodesByTable = new Map(
    tables.map((t) => [
      t.id,
      inventorySheetCountries(
        {
          ...t,
          ...(identities.has(t.id)
            ? { identityCountry: identities.get(t.id)! }
            : {}),
        },
        settings.countries[t.id] ?? [],
        [],
      ),
    ]),
  );
  const codes = [...new Set([...countryCodesByTable.values()].flat())];
  const countries = codes
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const states = new Map<
    string,
    (typeof aliases)[number]["effectivenessStates"]
  >();
  const uncertain = new Set<string>();
  for (const a of aliases) {
    for (const s of a.effectivenessStates) {
      const key = groupUsageKey(a.name, s.country);
      states.set(key, [...(states.get(key) ?? []), s]);
    }
    for (const row of a.effectivenessRows)
      if (!a.effectivenessStates.some((s) => s.country === row.country))
        uncertain.add(groupUsageKey(a.name, row.country));
  }
  const controlsByAlias = new Map<string, string[]>();
  for (const key of Object.keys(settings.rows)) {
    const separator = key.lastIndexOf("|"),
      aliasId = key.slice(0, separator),
      country = key.slice(separator + 1);
    if (separator > 0)
      controlsByAlias.set(aliasId, [
        ...(controlsByAlias.get(aliasId) ?? []),
        country,
      ]);
  }
  const observations = new Map<
    string,
    { active: boolean | null; task: "NONE" | "CREATE" | "STOP" }[]
  >();
  for (const alias of aliases) {
    const allowed = new Set(countryCodesByTable.get(alias.tableId) ?? []);
    const ownStates = new Map(
      alias.effectivenessStates.map((state) => [state.country, state]),
    );
    const rowCountries = new Set(
      alias.effectivenessRows.map((row) => row.country),
    );
    for (const country of new Set([
      ...ownStates.keys(),
      ...rowCountries,
      ...(controlsByAlias.get(alias.id) ?? []),
    ])) {
      if (!allowed.has(country)) continue;
      const rawTask = settings.rows[alias.id + "|" + country]?.campaignTask;
      const task =
        rawTask === "CREATE" || rawTask === "STOP" ? rawTask : "NONE";
      const active =
        ownStates.get(country)?.active ??
        (rowCountries.has(country)
          ? !alias.effectivenessRows.some(
              (row) => row.country === country && row.hidden,
            )
          : null);
      const key = groupUsageKey(alias.name, country);
      observations.set(key, [
        ...(observations.get(key) ?? []),
        { active, task },
      ]);
    }
  }
  const campaignStates: Record<string, GroupCountryCampaignState> =
    Object.fromEntries(
      [...observations].map(([key, rows]) => [
        key,
        groupCountryCampaignState(rows),
      ]),
    );
  const overrides = groupUsageOverrides(list.config);
  const usage: Record<string, GroupUsageCell> = {};
  for (const key of new Set([
    ...states.keys(),
    ...uncertain,
    ...Object.keys(overrides),
  ])) {
    const computed = inventoryCountryUsage(states.get(key) ?? []);
    usage[key] = {
      automatic:
        uncertain.has(key) && computed.usage !== "USED"
          ? "UNKNOWN"
          : computed.usage,
      activationHours: computed.activationHours,
      nextUsedAt: computed.nextUsedAt,
      mode: overrides[key]?.mode ?? "AUTO",
      revision: overrides[key]?.revision ?? null,
    };
  }
  return { countries, usage, campaignStates };
}
