import test from "node:test";
import assert from "node:assert/strict";
import { PreviewCache } from "../lib/preview-cache";

test("derived previews reuse bytes and overlapping work but reject stale revision keys and failures", async () => {
  let now = 0,
    calls = 0;
  const cache = new PreviewCache(100, 3, 1000, () => now);
  const load = async () => {
    calls++;
    return Buffer.from("preview");
  };
  await Promise.all(
    Array.from({ length: 12 }, () => cache.read("id:1:path", load)),
  );
  assert.equal(calls, 1);
  await cache.read("id:1:path", load);
  assert.equal(calls, 1);
  await cache.read("id:2:path", load);
  await cache.read("id:2:newpath", load);
  assert.equal(calls, 3);
  now = 1001;
  await cache.read("id:1:path", load);
  assert.equal(calls, 4);
  await assert.rejects(
    cache.read("failed", async () => {
      throw Error("read failed");
    }),
  );
  assert.equal((await cache.read("failed", load)).toString(), "preview");
});

test("preview memory is bounded by bytes and LRU entries; oversized resources are never retained", async () => {
  const cache = new PreviewCache(6, 2);
  const counts = new Map<string, number>();
  const read = (key: string, size = 3) =>
    cache.read(key, async () => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return Buffer.alloc(size);
    });
  await read("a");
  await read("b");
  await read("a");
  await read("c");
  await read("a");
  assert.equal(counts.get("a"), 1);
  await read("b");
  assert.equal(counts.get("b"), 2);
  await read("huge", 20);
  await read("huge", 20);
  assert.equal(counts.get("huge"), 2);
});
