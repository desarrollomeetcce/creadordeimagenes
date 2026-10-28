export function orderedTotalColumns<T extends { key: string }>(
  columns: readonly T[],
  saved: readonly string[],
) {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  return [
    ...new Set([
      ...saved.filter((k) => byKey.has(k)),
      ...columns.map((c) => c.key),
    ]),
  ].map((k) => byKey.get(k)!);
}
export function moveTotalColumn(
  keys: readonly string[],
  source: string,
  target: string,
  after = false,
) {
  if (source === target || !keys.includes(source) || !keys.includes(target))
    return [...keys];
  const next = keys.filter((k) => k !== source),
    index = next.indexOf(target);
  next.splice(index + (after ? 1 : 0), 0, source);
  return next;
}
