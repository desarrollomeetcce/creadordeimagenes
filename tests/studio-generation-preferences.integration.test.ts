import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { studioGenerate } from "../lib/creative-studio/service";
test("A mixed studio batch reserves 2 + 10 jobs with per-diploma price, mode and offers; no external AI calls", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    actor = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } }),
    subs = await db.subproduct.findMany({ where: { id: { in: q.subIds } } });
  const requestId = randomUUID(),
    fetch = globalThis.fetch;
  const requestIds = [requestId];
  globalThis.fetch = async () => {
    throw Error("No paid AI calls in preference QA");
  };
  const options = {
    [q.subIds[0]]: { count: 2, mode: "Imagen + Texto", priceText: "40 USD" },
    [q.subIds[1]]: { count: 10, mode: "Texto", priceText: "" },
  };
  try {
    const payload = {
      requestId,
      subproductIds: q.subIds,
      prompts: Object.fromEntries(
        q.subIds.map((id: string) => [id, "Pago único y mensualidad gratis."]),
      ),
      count: 3,
      mode: "Imagen + Texto",
      previewFirst: true,
      confirmCharge: true,
      format: "1:1",
      options,
    };
    await assert.rejects(
      () =>
        studioGenerate(actor, q.productId, {
          ...payload,
          options: { wrong: options[q.subIds[0]] },
        }),
      /seleccionados/,
    );
    const r = await studioGenerate(actor, q.productId, payload);
    assert.equal(r.jobs.length, 12);
    assert.equal(r.runnable.length, 2);
    const jobs = await db.generationJob.findMany({
      where: { id: { in: r.jobs } },
    });
    assert.equal(jobs.filter((j) => j.subproductId === q.subIds[0]).length, 2);
    assert.equal(jobs.filter((j) => j.subproductId === q.subIds[1]).length, 10);
    for (const job of jobs) {
      const s = job.snapshot as any;
      assert(s.prompt.includes("Pago único"));
      assert(s.prompt.includes("mensualidad gratis"));
      assert.equal(job.status, "PENDING");
      if (job.subproductId === q.subIds[0]) {
        assert.equal(s.priceText, "40 USD");
        assert(s.prompt.includes('"40 USD"'));
        assert.equal(s.mode, "Imagen + Texto");
      } else {
        assert.equal(s.priceText, "");
        assert(!s.prompt.includes("40 USD"));
        assert.equal(s.mode, "Texto");
      }
    }
    const saved = await db.subproduct.findUniqueOrThrow({
      where: { id: q.subIds[0] },
    });
    assert.equal((saved.studio as any).generationPreferences.count, 2);
    const repeat = await studioGenerate(actor, q.productId, payload);
    assert.deepEqual([...repeat.jobs].sort(), [...r.jobs].sort());
    const randomId = randomUUID();
    requestIds.push(randomId);
    const mixedOptions = Object.fromEntries(
      q.subIds.map((id: string) => [
        id,
        {
          count: 6,
          mode: "Aleatorio",
          priceText: id === q.subIds[0] ? "30 soles" : "",
        },
      ]),
    );
    const mixed = await studioGenerate(actor, q.productId, {
      ...payload,
      requestId: randomId,
      options: mixedOptions,
    });
    const mixedJobs = await db.generationJob.findMany({
      where: { id: { in: mixed.jobs } },
    });
    for (const id of q.subIds)
      assert.equal(
        new Set(
          mixedJobs
            .filter((j) => j.subproductId === id)
            .map((j) => (j.snapshot as any).mode),
        ).size,
        3,
      );
    const retried = await studioGenerate(actor, q.productId, {
      ...payload,
      requestId: randomId,
      options: mixedOptions,
    });
    assert.deepEqual([...retried.jobs].sort(), [...mixed.jobs].sort());
  } finally {
    globalThis.fetch = fetch;
    const jobs = await db.generationJob.findMany({
      where: {
        OR: requestIds.map((id) => ({ idempotencyKey: { contains: id } })),
      },
      select: { id: true },
    });
    await db.usageLedger.deleteMany({
      where: { jobId: { in: jobs.map((j) => j.id) } },
    });
    await db.generationJob.deleteMany({
      where: { id: { in: jobs.map((j) => j.id) } },
    });
    for (const sub of subs)
      await db.subproduct.update({
        where: { id: sub.id },
        data: {
          prompt: sub.prompt,
          studio: sub.studio as Prisma.InputJsonValue,
        },
      });
    await db.$disconnect();
  }
});
