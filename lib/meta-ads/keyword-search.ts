/** Newlines delimit Enter-confirmed words or phrases; old plain queries stay one phrase. */
export const META_SEARCH_MAX = 200;
export function metaSearchPhrases(query: string): string[] {
  return [
    ...new Set(
      query
        .slice(0, META_SEARCH_MAX)
        .split(/[\r\n]+/)
        .map((term) => term.trim().replace(/\s+/g, " ").toLocaleLowerCase("es"))
        .filter(Boolean),
    ),
  ];
}
export function addMetaSearchPhrase(query: string, draft: string): string {
  const phrase = draft.trim().replace(/\s+/g, " ");
  if (
    !phrase ||
    metaSearchPhrases(query).includes(phrase.toLocaleLowerCase("es"))
  )
    return query;
  const next = [query, phrase].filter(Boolean).join("\n");
  return next.length <= META_SEARCH_MAX ? next : query;
}
/** Conjunction of phrase substrings; order between phrases is irrelevant. */
export function metaSearchConditions(query: string) {
  return metaSearchPhrases(query).map((phrase) => ({
    name: { contains: phrase, mode: "insensitive" as const },
  }));
}
