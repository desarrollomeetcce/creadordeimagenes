/** Fill empty slots only; keep manual choices and never reuse an inventory ID. */
export function fillInventorySlots(
  slots: readonly string[],
  candidates: readonly string[],
  all = false,
  random: () => number = Math.random,
) {
  const used = new Set(slots.filter(Boolean));
  const pool = [...new Set(candidates)].filter((id) => !used.has(id));
  const next = [...slots];
  for (let i = 0; i < next.length && pool.length; i++) {
    if (next[i]) continue;
    const index = Math.min(
      pool.length - 1,
      Math.max(0, Math.floor(random() * pool.length)),
    );
    next[i] = pool.splice(index, 1)[0];
    if (!all) break;
  }
  return next;
}
