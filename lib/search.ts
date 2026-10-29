/** Word search for visible names: case/accent insensitive; punctuation and repeated spaces separate words. */
export const normalizeSearchText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const searchTerms = (query: string) =>
  normalizeSearchText(query).split(/\s+/).filter(Boolean);
export function matchesSearchWords(value: string, query: string) {
  const text = normalizeSearchText(value);
  return searchTerms(query).every((word) => text.includes(word));
}
/** Names are preferred to metadata; empty queries preserve the caller's original ordering. */
export function searchOptions<T>(
  options: readonly T[],
  query: string,
  label: (option: T) => string,
  extra?: (option: T) => string,
): T[] {
  const words = searchTerms(query);
  if (!words.length) return [...options];
  const phrase = normalizeSearchText(query);
  return options
    .map((option, index) => {
      const name = normalizeSearchText(label(option)),
        text = extra ? name + " " + normalizeSearchText(extra(option)) : name;
      if (!words.every((word) => text.includes(word))) return null;
      const direct = words.every((word) => name.includes(word));
      const score = !direct
        ? 10
        : name === phrase
          ? 0
          : name.startsWith(phrase)
            ? 1
            : words.every((word) =>
                  name.split(" ").some((part) => part.startsWith(word)),
                )
              ? 2
              : 3;
      return { option, index, score };
    })
    .filter(
      (entry): entry is { option: T; index: number; score: number } =>
        entry !== null,
    )
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.option);
}
