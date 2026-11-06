import test from "node:test";
import assert from "node:assert/strict";
import {
  generationCardState,
  generationSlots,
} from "../app/components/studio-generation-card";
import type { OrderProgress } from "../app/components/order-progress";
const order = (extra: Partial<OrderProgress> = {}) =>
  ({
    status: "ACTIVE",
    pending: 1,
    running: 0,
    failed: 0,
    uncertain: 0,
    ...extra,
  }) as OrderProgress;
test("Only a confirmed running image animates; queued images do not pretend to be generating", () => {
  assert.equal(generationCardState(order()).animated, false);
  assert.equal(generationCardState(order({ running: 1 })).animated, true);
});
test("Approval and pause leave a static waiting card rather than an indefinite loader", () => {
  assert.match(
    generationCardState(order({ status: "REVIEW" })).label,
    /Aprueba/,
  );
  assert.equal(
    generationCardState(order({ status: "REVIEW" })).animated,
    false,
  );
  assert.equal(
    generationCardState(order({ status: "PAUSED" })).animated,
    false,
  );
});
test("Stopping retains the in-flight image until acknowledged; cancelled work never animates", () => {
  assert.match(
    generationCardState(order({ status: "STOPPED", running: 1, pending: 0 }))
      .label,
    /Terminando/,
  );
  assert.equal(
    generationCardState(order({ status: "STOPPED", running: 0, pending: 0 }))
      .animated,
    false,
  );
  assert.equal(
    generationCardState(order({ status: "NEEDS_REVIEW", uncertain: 1 }))
      .animated,
    false,
  );
});

test("Preview-first renders only its own job until the sample is approved", () => {
  const jobs = [
    { id: "one", status: "RUNNING", variationId: null, reviewStatus: null },
    { id: "two", status: "PENDING", variationId: null, reviewStatus: null },
  ];
  assert.equal(
    generationSlots(order({ running: 1, pending: 1, sampleJobId: "one", jobs }))
      .length,
    1,
  );
  const approved = order({
    running: 1,
    pending: 1,
    sampleJobId: "one",
    sample: { id: "v1", reviewStatus: "APPROVED", deletedAt: null },
    jobs,
  });
  const cards = generationSlots(approved);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].state.animated, true);
  assert.equal(cards[1].state.animated, false);
});
test("An already visible sample holds its own controls and does not add a second waiting box", () => {
  assert.deepEqual(
    generationSlots(
      order({
        status: "REVIEW",
        sampleJobId: "one",
        sample: { id: "v1", reviewStatus: "PENDING", deletedAt: null },
      }),
      ["v1"],
    ),
    [],
  );
});
test("Cancelled and completed jobs are not drawn as pending slots", () => {
  const cards = generationSlots(
    order({
      running: 1,
      pending: 0,
      jobs: [
        {
          id: "done",
          status: "COMPLETED",
          variationId: "v1",
          reviewStatus: "APPROVED",
        },
        {
          id: "cancelled",
          status: "CANCELLED",
          variationId: null,
          reviewStatus: null,
        },
        {
          id: "active",
          status: "RUNNING",
          variationId: null,
          reviewStatus: null,
        },
      ],
    }),
  );
  assert.equal(cards.length, 1);
  assert.equal(cards[0].key, "active");
});
