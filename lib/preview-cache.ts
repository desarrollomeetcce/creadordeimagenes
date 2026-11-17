/** Derived bytes only. Callers must authorize and check expiry before every read. */
export class PreviewCache {
  private entries = new Map<string, { bytes: Buffer; expires: number }>();
  private pending = new Map<string, Promise<Buffer>>();
  private size = 0;
  constructor(
    private maxBytes = 16 * 1024 * 1024,
    private maxEntries = 64,
    private ttl = 300000,
    private now = Date.now,
  ) {}
  async read(key: string, load: () => Promise<Buffer>): Promise<Buffer> {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expires <= now) this.drop(id);
    }
    const found = this.entries.get(key);
    if (found) {
      this.entries.delete(key);
      this.entries.set(key, found);
      return found.bytes;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    // Bound tracked work too; never queue an unbounded set of promises.
    if (this.pending.size >= 8) return load();
    const request = Promise.resolve()
      .then(load)
      .then((bytes) => {
        if (bytes.length <= this.maxBytes && this.maxEntries > 0) {
          while (
            this.entries.size >= this.maxEntries ||
            this.size + bytes.length > this.maxBytes
          )
            this.drop(this.entries.keys().next().value!);
          this.entries.set(key, { bytes, expires: this.now() + this.ttl });
          this.size += bytes.length;
        }
        return bytes;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
  private drop(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.size -= entry.bytes.length;
    this.entries.delete(key);
  }
}
export const variationPreviews = new PreviewCache();
export const metaPreviews = new PreviewCache(4 * 1024 * 1024);
