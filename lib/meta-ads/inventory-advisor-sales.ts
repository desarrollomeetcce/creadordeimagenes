export type InventorySalesEntry = {
  day: string;
  country: string;
  advisorId: string | null;
  name: string;
  sales: number | null;
  na: boolean;
  partial: boolean;
};
/** A page boundary never duplicates a sale. Missing and N.A. quantities are not zero. */
export function inventoryAdvisorSales(entries: InventorySalesEntry[]) {
  const unique = new Map(
    entries.map((r) => [JSON.stringify([r.day, r.country, r.advisorId]), r]),
  );
  const people = new Map<
    string | null,
    {
      advisorId: string | null;
      name: string;
      sales: number | null;
      knownDays: Set<string>;
      partial: boolean;
      na: number;
    }
  >();
  for (const r of unique.values()) {
    const p = people.get(r.advisorId) ?? {
      advisorId: r.advisorId,
      name: r.name,
      sales: null,
      knownDays: new Set<string>(),
      partial: false,
      na: 0,
    };
    if (r.sales !== null && !r.na) {
      p.sales = (p.sales ?? 0) + r.sales;
      p.knownDays.add(r.day);
    }
    p.partial ||= r.partial || (r.sales === null && !r.na);
    if (r.na) p.na++;
    people.set(r.advisorId, p);
  }
  return {
    daily: [...unique.values()].sort(
      (a, b) =>
        b.day.localeCompare(a.day) ||
        a.name.localeCompare(b.name, "es") ||
        a.country.localeCompare(b.country),
    ),
    people: [...people.values()]
      .map((p) => ({ ...p, knownDays: p.knownDays.size }))
      .sort(
        (a, b) =>
          (b.sales ?? -1) - (a.sales ?? -1) ||
          a.name.localeCompare(b.name, "es"),
      ),
  };
}
