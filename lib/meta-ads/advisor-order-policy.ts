/** Shared order contains identities only. New members append in their supplied default order. */
export function orderedAdvisors<T extends { id: string }>(
  members: T[],
  config: unknown,
): T[] {
  const raw =
    config && typeof config === "object"
      ? (config as { advisorOrder?: unknown }).advisorOrder
      : null;
  const byId = new Map(members.map((member) => [member.id, member]));
  const result: T[] = [];
  for (const id of Array.isArray(raw) ? raw : []) {
    if (typeof id !== "string") continue;
    const member = byId.get(id);
    if (!member) continue;
    result.push(member);
    byId.delete(id);
  }
  return [...result, ...byId.values()];
}
export function moveAdvisorInOrder(
  ids: string[],
  source: string,
  target: string,
) {
  const from = ids.indexOf(source),
    to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, source);
  return next;
}
