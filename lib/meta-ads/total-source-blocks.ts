type DayData = {
  sums?: Record<
    string,
    { value?: number | null; known?: number; na?: number; pending?: boolean }
  >;
  manual?: Record<string, unknown>;
};
export function totalGroupHasData(group: {
  hasData?: boolean;
  days?: Record<string, DayData>;
}) {
  if (group.hasData === true) return true;
  if (group.days === undefined) return group.hasData !== false; // Missing metadata cannot prove a source is empty.
  return Object.values(group.days).some(
    (d) =>
      Object.values(d.manual ?? {}).some(
        (v) => v !== undefined && v !== null,
      ) ||
      Object.values(d.sums ?? {}).some(
        (v) =>
          v.value != null ||
          (v.known ?? 0) > 0 ||
          (group.hasData === undefined && ((v.na ?? 0) > 0 || v.pending)),
      ),
  );
}
/** One horizontal block per source/country/currency. Never merge amounts across identities. */
export function totalSourceBlocks<
  T extends {
    tableId: string;
    name?: string;
    groups: {
      country: string;
      currency: string;
      hasData?: boolean;
      days?: Record<string, DayData>;
    }[];
  },
>(tables: T[], country = "", currency = "") {
  const nameKey = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("es");
  const populatedNames = new Set(
    tables
      .filter((t) => t.name && t.groups.some(totalGroupHasData))
      .map((t) => nameKey(t.name!)),
  );
  return tables.flatMap((table) => {
    if (
      !country &&
      table.name &&
      populatedNames.has(nameKey(table.name)) &&
      !table.groups.some(totalGroupHasData)
    )
      return [];
    const hasCountryData = table.groups.some((g) => !!g.country);
    const groups = table.groups.filter(
      (g) => country || g.country || !hasCountryData || totalGroupHasData(g),
    );
    const pairs = new Map(
      groups.map((g) => [
        JSON.stringify([g.country, g.currency]),
        { country: g.country, currency: g.currency },
      ]),
    );
    const selectedCountry = country === "__none" ? "" : country;
    if (country && currency)
      pairs.set(JSON.stringify([selectedCountry, currency]), {
        country: selectedCountry,
        currency,
      });
    const visible = [...pairs.values()]
      .filter(
        (g) =>
          (!country || g.country === selectedCountry) &&
          (!currency || g.currency === currency),
      )
      .sort(
        (a, b) =>
          a.country.localeCompare(b.country) ||
          a.currency.localeCompare(b.currency),
      );
    // Empty cells are an editable template, not invented totals.
    if (!visible.length) visible.push({ country: selectedCountry, currency });
    return visible.map((g) => ({
      ...g,
      table,
      // Width preferences accept identifier characters; country/currency have no colons.
      key: `${table.tableId}:${g.country}:${g.currency}`,
    }));
  });
}
