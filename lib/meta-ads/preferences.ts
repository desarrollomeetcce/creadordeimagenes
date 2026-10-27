import { isCountryCode } from "./countries";
import { parseDeliveryFilters, encodeDeliveryFilters } from "./state-filter";
export type MetaSelection = {
  id: string;
  accountId: string;
  level: "campaign" | "adset" | "ad";
};
export const metaDefaults = {
  accountIds: [] as string[],
  pinnedAccountIds: [] as string[],
  primaryAccountIds: [] as string[],
  accountGroup: "secondary" as "primary" | "secondary",
  selectedObjects: [] as MetaSelection[],
  campaignScope: [] as string[],
  adsetScope: [] as string[],
  tab: "panel",
  level: "ad",
  business: "",
  campaign: "",
  adset: "",
  q: "",
  aliasFilter: "",
  countryFilter: "",
  state: "all",
  metric: "MESSAGES",
  currency: "",
  sort: "today",
  analysisPeriod: "today",
  direction: "asc",
  age: "",
  rating: "",
  since: "",
  until: "",
  calendar: "",
  view: "cards",
  accountListQuery: "",
  accountListActivity: "all",
  accountListBusiness: "",
  accountListPage: 1,
  accountPickerQuery: "",
  accountPickerActivity: "all",
};
export type MetaPreferences = typeof metaDefaults;
export function parseMetaPreferences(raw: string | null): MetaPreferences {
  const result = {
    ...metaDefaults,
    accountIds: [] as string[],
    primaryAccountIds: [] as string[],
  };
  if (!raw || raw.length > 200000) return result;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;
  const choices: Record<string, string[]> = {
    tab: ["panel", "alerts", "accounts", "connections"],
    accountGroup: ["primary", "secondary"],
    level: ["campaign", "adset", "ad"],
    metric: ["", "MESSAGES", "LEADS", "PURCHASES", "LINK_CLICKS", "UNKNOWN"],
    sort: ["today", "7", "15", "30", "lifetime", "custom", "newest", "age"],
    analysisPeriod: ["today", "7", "15", "30", "lifetime"],
    direction: ["asc", "desc"],
    age: ["", "7", "15", "30", "older"],
    rating: [
      "",
      "STALE",
      "GOOD",
      "WATCH",
      "CRITICAL",
      "DETERIORATING",
      "INSUFFICIENT",
      "ENOUGH_DATA",
    ],
    calendar: ["", "custom"],
    view: ["cards", "table"],
    accountListActivity: ["all", "spend", "active", "none", "unknown"],
    accountPickerActivity: ["all", "spend", "active", "none", "unknown"],
  };
  for (const [key, values] of Object.entries(choices))
    if (typeof data[key] === "string" && values.includes(data[key] as string))
      (result as Record<string, unknown>)[key] = data[key];
  if (typeof data.state === "string") {
    const filters = parseDeliveryFilters(data.state);
    result.state = filters ? encodeDeliveryFilters(filters) : "all";
  }
  for (const key of ["q", "accountListQuery", "accountPickerQuery"] as const)
    if (typeof data[key] === "string")
      result[key] = (data[key] as string).slice(0, 200);
  for (const key of [
    "business",
    "campaign",
    "adset",
    "accountListBusiness",
  ] as const)
    if (
      typeof data[key] === "string" &&
      (/^\d{0,40}$/.test(data[key] as string) ||
        (key === "accountListBusiness" && data[key] === "__unknown"))
    )
      result[key] = data[key] as string;
  if (typeof data.currency === "string" && /^[A-Z]{3}$/.test(data.currency))
    result.currency = data.currency;
  if (Array.isArray(data.accountIds))
    result.accountIds = [
      ...new Set(
        data.accountIds.filter(
          (id): id is string => typeof id === "string" && /^\d{1,40}$/.test(id),
        ),
      ),
    ].slice(0, 100);
  if (
    typeof data.accountListPage === "number" &&
    Number.isInteger(data.accountListPage)
  )
    result.accountListPage = Math.min(10000, Math.max(1, data.accountListPage));
  if (
    typeof data.since === "string" &&
    typeof data.until === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(data.since) &&
    /^\d{4}-\d{2}-\d{2}$/.test(data.until) &&
    data.since <= data.until &&
    Number.isFinite(Date.parse(data.since)) &&
    Number.isFinite(Date.parse(data.until))
  ) {
    result.since = data.since;
    result.until = data.until;
  } else {
    result.calendar = "";
    if (result.sort === "custom") result.sort = "7";
  }
  if (
    typeof data.aliasFilter === "string" &&
    /^[a-zA-Z0-9_-]{0,80}$/.test(data.aliasFilter)
  )
    result.aliasFilter = data.aliasFilter;
  if (data.countryFilter === "__none" || isCountryCode(data.countryFilter))
    result.countryFilter = data.countryFilter;
  result.business = "";
  result.currency = "";
  result.age = "";
  if (data.layoutRevision !== 2) {
    result.metric = "MESSAGES";
    result.campaign = "";
    result.adset = "";
  }
  if (["newest", "age"].includes(result.sort)) result.sort = "7";
  const ids = (v: unknown, limit = 100) =>
    Array.isArray(v)
      ? [
          ...new Set(
            v.filter(
              (id): id is string =>
                typeof id === "string" && /^\d{1,40}$/.test(id),
            ),
          ),
        ].slice(0, limit)
      : [];
  result.primaryAccountIds = ids(data.primaryAccountIds, 1000);
  result.pinnedAccountIds = ids(data.pinnedAccountIds ?? result.accountIds);
  result.campaignScope = ids(data.campaignScope);
  result.adsetScope = ids(data.adsetScope);
  if (Array.isArray(data.selectedObjects)) {
    const seen = new Set<string>(),
      counts: Record<string, number> = {};
    result.selectedObjects = data.selectedObjects
      .filter((v): v is MetaSelection => {
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        const o = v as Record<string, unknown>;
        if (
          typeof o.id !== "string" ||
          !/^\d{1,40}$/.test(o.id) ||
          typeof o.accountId !== "string" ||
          !/^\d{1,40}$/.test(o.accountId) ||
          !["campaign", "adset", "ad"].includes(String(o.level)) ||
          seen.has(o.id) ||
          (counts[String(o.level)] ?? 0) >= 100
        )
          return false;
        seen.add(o.id);
        counts[String(o.level)] = (counts[String(o.level)] ?? 0) + 1;
        return true;
      })
      .map(({ id, accountId, level }) => ({ id, accountId, level }));
  }
  result.campaign = "";
  result.adset = "";

  return result;
}
