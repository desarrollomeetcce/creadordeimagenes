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


/** Portfolio copies of the same diploma/country/day may repeat a sales cell. */
export function reconcilePortfolioSales(
  entries: Iterable<Pick<RegisteredSalesEntry, "day" | "sales" | "partial">>,
  from: string,
  to: string,
) {
  const byDay = new Map<string, { values: Set<number>; partial: boolean }>();
  for (const entry of entries) {
    if (entry.day < from || entry.day > to || entry.sales === null) continue;
    const cell = byDay.get(entry.day) ?? { values: new Set<number>(), partial: false };
    cell.values.add(entry.sales);
    cell.partial ||= entry.partial;
    byDay.set(entry.day, cell);
  }
  let total: number | null = null;
  let partial = false;
  for (const { values, partial: dayPartial } of byDay.values()) {
    partial ||= dayPartial || values.size > 1;
    if (values.size === 1) total = (total ?? 0) + [...values][0];
  }
  return { total, partial };
}


export function salesForUnambiguousAssignment(
  advisorId: string,
  copies: readonly { advisorId: string | null; sales: number | null; blocked: boolean }[],
) {
  if (copies.some((copy) => copy.blocked ||
    (copy.advisorId !== null && (copy.advisorId !== advisorId || copy.sales !== null)))) return null;
  if (!copies.some((copy) => copy.advisorId === advisorId)) return null;
  const recorded = new Set(copies.flatMap((copy) =>
    copy.advisorId === null && copy.sales !== null ? [copy.sales] : []));
  return recorded.size === 1 ? [...recorded][0] : null;
}
