import { countryName, isCountryCode } from "./countries";
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

/** Display country identity once; punctuation/case/accents are not additional countries. */
export function inventorySheetCountryLabel(
  table: { name: string; identityCountry?: string },
  country: string,
) {
  if (!isCountryCode(country)) return table.name;
  if (
    resolveCountry(table.name) === country ||
    inventoryNamedCountry(table) === country
  )
    return table.name;
  if (
    country === "BO" &&
    table.name.trim().toLocaleUpperCase("es") === "BOLVIA"
  )
    return "BOLIVIA";
  return table.name + " · " + countryName(country);
}
