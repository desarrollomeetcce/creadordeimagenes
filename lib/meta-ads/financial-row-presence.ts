/** Current sheet identities, independent of metrics, activation and retained history. */
export function financialRowPresence(
  aliases: { id: string }[],
  stored: { aliasId: string; country: string; hidden: boolean }[],
  campaigns: { aliasId: string | null; aliasCountry: string | null }[],
  defaultCountry: string,
  includeHidden = false,
) {
  const key = (aliasId: string, country: string) =>
    JSON.stringify([aliasId, country]);
  const hidden = new Set(
    stored
      .filter((r) => r.hidden && !includeHidden)
      .map((r) => key(r.aliasId, r.country)),
  );
  const hiddenAliases = new Set(
    stored.filter((r) => r.hidden && !includeHidden).map((r) => r.aliasId),
  );
  const present = new Map<string, { aliasId: string; country: string }>();
  const presentAliases = new Set<string>();
  const add = (aliasId: string, country: string) => {
    present.set(key(aliasId, country), { aliasId, country });
    presentAliases.add(aliasId);
  };
  for (const row of stored)
    if (!row.hidden || includeHidden) add(row.aliasId, row.country);
  for (const campaign of campaigns)
    if (
      campaign.aliasId &&
      campaign.aliasCountry !== null &&
      !hidden.has(key(campaign.aliasId, campaign.aliasCountry))
    )
      add(campaign.aliasId, campaign.aliasCountry);
  for (const alias of aliases)
    if (!presentAliases.has(alias.id) && !hiddenAliases.has(alias.id))
      add(alias.id, defaultCountry);
  return [...present.values()];
}
