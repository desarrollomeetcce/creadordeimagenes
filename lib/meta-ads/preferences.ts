export const metaDefaults = {
  accountIds: [] as string[],
  tab: "panel",
  level: "ad",
  business: "",
  campaign: "",
  adset: "",
  q: "",
  state: "all",
  metric: "MESSAGES",
  currency: "",
  sort: "7",
  analysisPeriod: "30",
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
  const result = { ...metaDefaults, accountIds: [] as string[] };
  if (!raw || raw.length > 20000) return result;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;
  const choices: Record<string, string[]> = {
    tab: ["panel", "ranking", "alerts", "accounts", "connections"],
    level: ["campaign", "adset", "ad"],
    state: [
      "all",
      "active",
      "effective",
      "paused",
      "issues",
      "campaign-active",
      "delivery",
    ],
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
  result.business = "";
  result.currency = "";
  result.age = "";
  if (data.layoutRevision !== 2) {
    result.metric = "MESSAGES";
    result.campaign = "";
    result.adset = "";
  }
  if (["newest", "age"].includes(result.sort)) result.sort = "7";
  return result;
}
