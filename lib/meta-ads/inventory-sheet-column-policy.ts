import { isCountryCode } from "./countries";
import { resolveCountry } from "./effectiveness-paste";
/** Country-named sheets use their own country; preserve every recorded foreign identity. */
export function inventorySheetCountries(
  table: { name: string; defaultCountry: string },
  configured: string[],
  recorded: string[],
) {
  const named = resolveCountry(table.name);
  return [
    ...new Set(
      named
        ? [named, ...recorded]
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
