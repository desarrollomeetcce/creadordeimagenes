/** A paid attempt is removed before dispatch. Pausing never retries that attempt. */
export class InteractiveQueue {
  pending: string[] = [];
  running = false;
  paused = false;
  current: string | null = null;
  last: string | null = null;
  constructor(private notify: () => void) {}
  load(ids: string[]) {
    if (this.running || this.pending.length)
      throw Error("Pausa o detén el lote actual antes de iniciar otro.");
    this.pending = [...new Set(ids)];
    this.paused = false;
    this.notify();
  }
  pause() {
    this.paused = true;
    this.notify();
  }
  stop() {
    const ids = [...this.pending];
    this.pending = [];
    this.paused = true;
    this.notify();
    return ids;
  }
  async run(attempt: (id: string) => Promise<void>) {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.notify();
    try {
      while (!this.paused && this.pending.length) {
        const id = this.pending.shift()!;
        this.current = id;
        this.notify();
        try {
          await attempt(id);
          this.last = id;
        } catch (error) {
          this.paused = true;
          throw error;
        } finally {
          this.current = null;
          this.notify();
        }
      }
    } finally {
      this.running = false;
      this.notify();
    }
  }
}
