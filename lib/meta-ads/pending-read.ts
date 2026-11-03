/** One overlapping read per component/key; settlement releases the key for the next fresh read. */
export function joinPendingMetaRead<T>(
  pending: Map<string, Promise<T>>,
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  const active = pending.get(key);
  if (active) return active;
  const request = Promise.resolve()
    .then(read)
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
  return request;
}
