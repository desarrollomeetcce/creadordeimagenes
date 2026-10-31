export type RegisteredSalesEntry = {
  inventory: string;
  name: string;
  country: string;
  day: string;
  sales: number | null;
  partial: boolean;
};
export type RegisteredSalesSummary = {
  total: number | null;
  since: string | null;
  firstRecord: string | null;
  until: string;
  manual: boolean;
  partial: boolean;
  groups: { name: string; country: string; sales: number | null }[];
};
export function validSalesDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
/** Repeated campaign/source links cannot duplicate an inventory/country/day. */
export function registeredSalesSummary(
  entries: RegisteredSalesEntry[],
  today: string,
  manualSince = "",
): RegisteredSalesSummary {
  const unique = new Map<string, RegisteredSalesEntry>();
  let partial = false;
  for (const entry of entries) {
    if (entry.day > today) continue;
    const key = JSON.stringify([
      entry.inventory,
      entry.name.normalize("NFKC").trim().toLocaleLowerCase("es"),
      entry.country,
      entry.day,
    ]);
    const previous = unique.get(key);
    if (
      previous?.sales !== null &&
      previous?.sales !== undefined &&
      entry.sales !== null &&
      previous.sales !== entry.sales
    ) {
      // Conflicting copies are not silently added together.
      partial = true;
      continue;
    }
    if (!previous || previous.sales === null) unique.set(key, entry);
  }
  const firstRecord =
    [...unique.values()]
      .filter((e) => e.sales !== null)
      .map((e) => e.day)
      .sort()[0] ?? null;
  const manual = validSalesDate(manualSince) && manualSince <= today;
  const since = manual ? manualSince : firstRecord;
  const groups = new Map<
    string,
    { name: string; country: string; sales: number | null }
  >();
  let total: number | null = null;
  for (const entry of unique.values()) {
    if (!since || entry.day < since) continue;
    const key = JSON.stringify([
      entry.inventory,
      entry.name.normalize("NFKC").trim().toLocaleLowerCase("es"),
      entry.country,
    ]);
    const group = groups.get(key) ?? {
      name: entry.name,
      country: entry.country,
      sales: null,
    };
    if (entry.sales !== null) {
      total = (total ?? 0) + entry.sales;
      group.sales = (group.sales ?? 0) + entry.sales;
    }
    partial ||= entry.partial || entry.sales === null;
    groups.set(key, group);
  }
  if (since && total !== null) {
    const expectedDays =
      Math.floor((Date.parse(today) - Date.parse(since)) / 86400000) + 1;
    const known = [...unique.values()].filter(
      (e) => e.day >= since && e.sales !== null,
    ).length;
    partial ||= known < groups.size * expectedDays;
  }
  return {
    total,
    since,
    firstRecord,
    until: today,
    manual,
    partial,
    groups: [...groups.values()].sort(
      (a, b) =>
        a.name.localeCompare(b.name, "es") ||
        a.country.localeCompare(b.country),
    ),
  };
}
