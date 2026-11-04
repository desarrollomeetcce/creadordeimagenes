export function orderedGroupCountries<T extends { code: string }>(
  countries: T[],
  stored: unknown,
): T[] {
  const byCode = new Map(countries.map((country) => [country.code, country]));
  const order = Array.isArray(stored)
    ? stored.filter((code): code is string => typeof code === "string")
    : [];
  return [
    ...new Set([...order, ...countries.map((country) => country.code)]),
  ].flatMap((code) => {
    const country = byCode.get(code);
    return country ? [country] : [];
  });
}
export function moveGroupCountry(codes: string[], from: string, to: string) {
  const source = codes.indexOf(from),
    target = codes.indexOf(to);
  if (source < 0 || target < 0 || source === target) return codes;
  const result = [...codes];
  result.splice(source, 1);
  result.splice(target, 0, from);
  return result;
}
