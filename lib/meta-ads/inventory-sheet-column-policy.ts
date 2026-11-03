import { isCountryCode } from "./countries";
import { resolveCountry } from "./effectiveness-paste";
export function inventoryNamedCountry(table: {
  name: string;
  identityCountry?: string;
}) {
  return table.identityCountry !== undefined
    ? isCountryCode(table.identityCountry)
      ? table.identityCountry
      : null
    : resolveCountry(table.name);
}
/** Country-named sheets expose their own country. Foreign records are reviewed separately, never rewritten. */
export function inventorySheetCountries(
  table: { name: string; defaultCountry: string; identityCountry?: string },
  configured: string[],
  recorded: string[],
) {
  const named = inventoryNamedCountry(table);
  return [
    ...new Set(
      named
        ? [named]
        : [
            ...configured,
            ...recorded,
            ...(isCountryCode(table.defaultCountry)
              ? [table.defaultCountry]
              : []),
          ],
    ),
  ].filter(isCountryCode);
}

export function inventorySheetForeignCountries(
  table: { name: string; identityCountry?: string },
  recorded: string[],
) {
  const named = inventoryNamedCountry(table);
  return named
    ? [...new Set(recorded.filter((c) => isCountryCode(c) && c !== named))]
    : [];
}
