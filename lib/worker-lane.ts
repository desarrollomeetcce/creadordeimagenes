/** Independent periodic work: a slow task never holds up another worker lane.
 * The same lane cannot overlap itself, including when several ticks are due.
 */
export function workerLane(intervalMs: number, task: () => Promise<unknown>) {
  let nextAt = 0;
  let pending: Promise<void> | null = null;
  return {
    tick(now = Date.now()) {
      if (pending || now < nextAt) return null;
      nextAt = now + intervalMs;
      pending = Promise.resolve()
        .then(task)
        // These are periodic auxiliary tasks, never paid generation retries.
        // Durable services retain their own status, lease and error handling.
        .catch(() => {})
        .then(() => {
          pending = null;
        });
      return pending;
    },
  };
}

export async function generationCycle(
  lanes: ReturnType<typeof workerLane>[],
  generate: () => Promise<boolean>,
) {
  for (const lane of lanes) lane.tick();
  return generate();
}
