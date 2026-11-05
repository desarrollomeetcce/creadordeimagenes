import { categoryKey } from "./category-paste";
export function suggestedGroupNames(names: string[], count = 3) {
  const used = new Set(
    names
      .map((name) => /^grupo\s+(\d+)$/i.exec(name.trim())?.[1])
      .filter(Boolean)
      .map(Number),
  );
  const result: string[] = [];
  for (let n = 1; result.length < Math.min(10, count); n++)
    if (!used.has(n)) result.push("Grupo " + n);
  return result;
}
export function groupCreationName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  return /^grupo(?:\s|$)/i.test(name) ? name : "Grupo " + name;
}
export function sameGroupName(a: string, b: string) {
  return categoryKey(a) === categoryKey(b);
}
export function compactCountryHidden(hidden: string[], column: string) {
  return (
    hidden.includes(`country:${column}:compact`) ||
    ["activation", "factor", "status"].every((key) =>
      hidden.includes(`country:${column}:${key}`),
    )
  );
}
