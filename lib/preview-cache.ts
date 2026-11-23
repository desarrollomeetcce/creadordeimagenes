import { AppError } from "./errors";
/** Derived bytes only. Callers must authorize and check expiry before every read. */
export class PreviewCache {
  private entries = new Map<string, { bytes: Buffer; expires: number }>();
  private pending = new Map<string, Promise<Buffer>>();
  private size = 0;
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private maxBytes = 16 * 1024 * 1024,
    private maxEntries = 64,
    private ttl = 300000,
    private now = Date.now,
    private concurrency = 2,
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
    // A cold gallery must not bypass tracking and start dozens of decoders.
    if (this.pending.size >= 128)
      throw new AppError("Hay muchas miniaturas en preparación. Actualiza la galería en unos segundos.", 503);
    const request = Promise.resolve()
      .then(() => this.run(load))
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
  private async run(load: () => Promise<Buffer>) {
    if (this.active >= this.concurrency)
      await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.active++;
    try { return await load(); }
    finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
  private drop(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.size -= entry.bytes.length;
    this.entries.delete(key);
  }
}
export const variationPreviews = new PreviewCache();
export const metaPreviews = new PreviewCache(4 * 1024 * 1024);
