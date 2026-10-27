/** One horizontal block per source/country/currency. Never merge amounts across identities. */
export function totalSourceBlocks<
  T extends {
    tableId: string;
    groups: { country: string; currency: string }[];
  },
>(tables: T[], country = "", currency = "") {
  return tables.flatMap((table) => {
    const pairs = new Map(
      table.groups.map((g) => [
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
