import test from "node:test";
import assert from "node:assert/strict";
import { workerLane, generationCycle } from "../lib/worker-lane";
import { generationInputs } from "../lib/generation-inputs";
import { firstRunnableJob } from "../lib/preview-approval";

test("a stalled Meta lane does not block image work or overlap another Meta run", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let metaCalls = 0;
  const meta = workerLane(15000, async () => {
    metaCalls++;
    await gate;
  });
  const first = meta.tick(0);
  await Promise.resolve();
  assert.equal(metaCalls, 1);
  assert.equal(meta.tick(60000), null);
  let imageDone = false;
  assert.equal(
    await generationCycle([meta], async () => {
      imageDone = true;
      return true;
    }),
    true,
  );
  assert.equal(imageDone, true);
  assert.equal(metaCalls, 1);
  release();
  await first;
  await meta.tick(60000);
  assert.equal(metaCalls, 2);
});

test("a batch of 199 held images checks its sample once, without skipping approval or holding unrelated groups", async () => {
  const calls: unknown[] = [];
  const reader = {
    generationJob: {
      findFirst: async (input: unknown) => {
        calls.push(input);
        return null;
      },
    },
  };
  const jobs = Array.from({ length: 199 }, (_, i) => ({
    id: String(i),
    actorId: "a",
    snapshot: { previewFirst: true, approvalGroup: "group", index: i + 1 },
  }));
  const tx = reader as unknown as Parameters<typeof firstRunnableJob>[0];
  assert.equal(await firstRunnableJob(tx, jobs), null);
  assert.equal(calls.length, 1);
  assert.equal(
    (
      await firstRunnableJob(tx, [
        ...jobs,
        {
          id: "sample",
          actorId: "a",
          snapshot: { previewFirst: true, approvalGroup: "other", index: 0 },
        },
      ])
    )?.id,
    "sample",
  );
  assert.equal(calls.length, 2, "a new scan must re-read current approval");
});

test("approval lookups remain isolated by actor and preserve job order", async () => {
  const actors: string[] = [];
  const reader = {
    generationJob: {
      findFirst: async (input: { where: { actorId: string } }) => {
        actors.push(input.where.actorId);
        return input.where.actorId === "b"
          ? {
              status: "COMPLETED",
              variation: {
                reviewStatus: "APPROVED",
                deletedAt: null,
                expired: false,
              },
            }
          : null;
      },
    },
  };
  const jobs = ["a", "a", "b"].map((actorId, i) => ({
    id: String(i),
    actorId,
    snapshot: { previewFirst: true, approvalGroup: "same", index: i + 1 },
  }));
  assert.equal(
    (
      await firstRunnableJob(
        reader as unknown as Parameters<typeof firstRunnableJob>[0],
        jobs,
      )
    )?.id,
    "2",
  );
  assert.deepEqual(actors, ["a", "b"]);
});

test("maintenance and Meta keep independent cadence and failures cannot stop image work", async () => {
  let maintenanceCalls = 0,
    metaCalls = 0;
  const maintenance = workerLane(300000, async () => {
    maintenanceCalls++;
    throw Error("QA");
  });
  const meta = workerLane(15000, async () => {
    metaCalls++;
  });
  await Promise.all([maintenance.tick(0), meta.tick(0)]);
  assert.equal(maintenance.tick(15000), null);
  await meta.tick(15000);
  assert.equal(meta.tick(15001), null);
  assert.equal(maintenanceCalls, 1);
  assert.equal(metaCalls, 2);
  await maintenance.tick(300000);
  assert.equal(maintenanceCalls, 2);
});

test("references are read once per path and reused for rendering and provider input in original order", async () => {
  const refs = [
    { id: "logo", path: "one", mime: "image/png", purpose: "logo" },
    { id: "photo", path: "two", mime: "image/jpeg", purpose: "reference" },
    { id: "duplicate", path: "one", mime: "image/png", purpose: "reference" },
  ];
  const reads: string[] = [];
  const result = await generationInputs(refs, async (path) => {
    reads.push(path);
    return Buffer.from(path);
  });
  assert.deepEqual(reads, ["one", "two"]);
  assert.deepEqual(
    result.resources.map((r) => r.id),
    refs.map((r) => r.id),
  );
  assert.deepEqual(
    result.images.map((r) => r.mime),
    refs.map((r) => r.mime),
  );
  assert.equal(result.resources[0].bytes, result.images[0].bytes);
  assert.equal(result.images[0].bytes, result.images[2].bytes);
  assert.equal(result.images[1].bytes.toString(), "two");
});

test("reference bytes are not reused between jobs and missing files reject before a provider call", async () => {
  const refs = [{ path: "one", mime: "image/png" }];
  let calls = 0;
  const read = async () => Buffer.from(String(++calls));
  const first = await generationInputs(refs, read);
  const second = await generationInputs(refs, read);
  assert.equal(first.images[0].bytes.toString(), "1");
  assert.equal(second.images[0].bytes.toString(), "2");
  await assert.rejects(
    generationInputs(refs, async () => {
      throw Error("Missing reference");
    }),
    /Missing reference/,
  );
});

test("oversized reference lists fail before any file IO; empty jobs need no file reads", async () => {
  let calls = 0;
  const read = async () => {
    calls++;
    return Buffer.from("QA");
  };
  await assert.rejects(
    generationInputs(
      Array.from({ length: 10 }, () => ({ path: "one", mime: "image/png" })),
      read,
    ),
    /nueve/,
  );
  assert.deepEqual(await generationInputs([], read), {
    resources: [],
    images: [],
  });
  assert.equal(calls, 0);
});
