/** Reads only page directories for the selected connection; never ad history. */
export async function discoverCampaignPages(
  read: (edge: "promote_pages" | "pages", after?: string) => Promise<Record<string, any>>,
) {
  const pages = new Map<string, any>();
  let partial = false;
  async function collect(edge: "promote_pages" | "pages") {
    let after: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 4; page++) {
      const result = await read(edge, after);
      for (const item of result.data ?? []) {
        if (/^\d{1,40}$/.test(String(item.id))) pages.set(String(item.id), item);
      }
      const next = result.paging?.cursors?.after;
      if (!result.paging?.next) return;
      if (typeof next !== "string" || !next || cursors.has(next) || page === 3) { partial = true; return; }
      cursors.add(next);
      after = next;
    }
  }
  let firstError: unknown;
  try { await collect("promote_pages"); } catch (error) { firstError = error; }
  if (!pages.size) {
    try { await collect("pages"); } catch (error) { throw firstError ?? error; }
    if (!pages.size && firstError) throw firstError;
  }
  return { data: [...pages.values()], ...(partial ? { paging: { next: true } } : {}) };
}
