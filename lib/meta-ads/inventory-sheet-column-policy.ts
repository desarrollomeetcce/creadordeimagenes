import { isCountryCode } from "./countries";
import { resolveCountry } from "./effectiveness-paste";
/** Country-named sheets expose their own country. Foreign records are reviewed separately, never rewritten. */
export function inventorySheetCountries(
  table: { name: string; defaultCountry: string },
  configured: string[],
  recorded: string[],
) {
  const named = resolveCountry(table.name);
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
  table: { name: string },
  recorded: string[],
) {
  const named = resolveCountry(table.name);
  return named
    ? [...new Set(recorded.filter((c) => isCountryCode(c) && c !== named))]
    : [];
}
