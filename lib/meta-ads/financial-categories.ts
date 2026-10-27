export type FinancialCategory = {
  id: string;
  name: string;
  kind: "PRIMARY" | "SECONDARY";
};
export type FinancialCatalogEntry = {
  id: string;
  name: string;
  categoryAssignments?: { category: FinancialCategory }[];
};
export type TemporaryCategoryMap = Record<string, string[]>;
export const financialRowKey = (row: { aliasId: string; country: string }) =>
  JSON.stringify([row.aliasId, row.country]);
export function financialCategoryChoices(entry?: FinancialCatalogEntry) {
  const assigned = (entry?.categoryAssignments ?? [])
    .map((a) => a.category)
    .sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name, "es")
        : a.kind === "PRIMARY"
          ? -1
          : 1,
    );
  return [...new Set(assigned.map((c) => c.name))].map((name) =>
    assigned.find((c) => c.name === name)!,
  );
}
export function financialRowCategories(
  row: { aliasId: string; country: string; active?: boolean },
  entry: FinancialCatalogEntry | undefined,
  temporary: TemporaryCategoryMap,
) {
  const choices = financialCategoryChoices(entry),
    defaults = choices.filter((c) => c.kind === "PRIMARY").map((c) => c.id);
  const requested =
      row.active === false ? [] : (temporary[financialRowKey(row)] ?? []),
    valid = requested.filter((id) => choices.some((c) => c.id === id));
  const ids = valid.length ? valid : defaults;
  const isTemporary =
    valid.length > 0 &&
    (valid.length !== defaults.length ||
      valid.some((id) => !defaults.includes(id)));
  return {
    choices,
    defaults,
    ids,
    temporary: isTemporary,
    names: choices
      .filter((c) => ids.includes(c.id))
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b, "es")),
  };
}
export function groupFinancialRows<
  T extends { aliasId: string; country: string; active?: boolean },
>(
  rows: T[],
  entries: FinancialCatalogEntry[],
  temporary: TemporaryCategoryMap,
) {
  const bands = new Map<
    string,
    {
      active: boolean;
      temporary: boolean;
      names: string[];
      rows: T[];
      temporaryCount: number;
    }
  >();
  for (const row of rows) {
    const category = financialRowCategories(
        row,
        entries.find((a) => a.id === row.aliasId),
        temporary,
      ),
      active = row.active !== false,
      key = JSON.stringify([active, category.temporary, category.names]);
    let band = bands.get(key);
    if (!band) {
      band = {
        active,
        temporary: category.temporary,
        names: category.names,
        rows: [],
        temporaryCount: 0,
      };
      bands.set(key, band);
    }
    band.rows.push(row);
    if (category.temporary) band.temporaryCount++;
  }
  return [...bands.values()].sort((a, b) =>
    a.active !== b.active
      ? a.active
        ? -1
        : 1
      : !a.names.length
        ? 1
        : !b.names.length
          ? -1
          : a.names.join(" · ").localeCompare(b.names.join(" · "), "es") ||
            Number(a.temporary) - Number(b.temporary),
  );
}
export function parseTemporaryCategories(
  raw: string | null,
): TemporaryCategoryMap {
  if (!raw || raw.length > 2097152) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== "object") return {};
    const result: TemporaryCategoryMap = {};
    for (const [key, ids] of Object.entries(value).slice(0, 4000)) {
      let pair: unknown;
      try {
        pair = JSON.parse(key);
      } catch {
        continue;
      }
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(pair[0]) ||
        typeof pair[1] !== "string" ||
        !/^([A-Z]{2})?$/.test(pair[1]) ||
        !Array.isArray(ids)
      )
        continue;
      const valid = [
        ...new Set(
          ids.filter(
            (id): id is string =>
              typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id),
          ),
        ),
      ].slice(0, 40);
      if (valid.length) result[key] = valid;
    }
    return result;
  } catch {
    return {};
  }
}
