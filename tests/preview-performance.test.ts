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

test("cold and expired galleries bound decoding to two, coalescing duplicates even beyond eight pending resources", async () => {
  let clock = 0, active = 0, peak = 0, loads = 0;
  const cache = new PreviewCache(1000, 64, 100, () => clock);
  const load = async () => {
    loads++; active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 5)); active--;
    return Buffer.from("preview");
  };
  for (const time of [0, 101]) {
    clock = time;
    await Promise.all([
      ...Array.from({ length: 24 }, (_, i) => cache.read("resource-"+i, load)),
      ...Array.from({ length: 5 }, () => cache.read("resource-23", load)),
    ]);
  }
  assert.equal(peak, 2);
  assert.equal(loads, 48);
  assert.equal(active, 0);
});

test("photo batches overlap only two small photos; large photos and videos never overlap other uploads", async () => {
  const { uploadStudioBatch } = await import("../app/components/studio-upload-batch");
  const files = [new File(["a"],"a.jpg"),new File(["b"],"b.png"),new File(["v"],"v.mp4"),new File([new Uint8Array(9*1024*1024)],"large.jpg"),new File(["c"],"c.webp")];
  const active: File[] = [], saved: number[] = []; let peak = 0;
  await uploadStudioBatch(files, async (file,index) => {
    active.push(file); peak = Math.max(peak,active.length);
    if(active.some(f=>f.name.endsWith(".mp4")||f.size>8*1024*1024))assert.equal(active.length,1);
    await new Promise(r=>setTimeout(r,5)); active.splice(active.indexOf(file),1);return index;
  }, index=>{saved.push(index);});
  assert.equal(peak,2);assert.deepEqual(saved.sort(),[0,1,2,3,4]);
});

test("failed photo upload waits for its in-flight peer, preserves success and never starts or repeats later writes", async () => {
  const { uploadStudioBatch } = await import("../app/components/studio-upload-batch");
  const sent: number[] = [], saved: number[] = [];
  await assert.rejects(uploadStudioBatch([0,1,2].map(i=>new File(["x"],i+".jpg")),async (_,i)=>{
    sent.push(i);if(i===1)throw Error("connection lost");
    await new Promise(r=>setTimeout(r,10));return i;
  },i=>{saved.push(i);}),/connection lost/);
  assert.deepEqual(sent,[0,1]);assert.deepEqual(saved,[0]);
});
