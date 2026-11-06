import test from "node:test";
import assert from "node:assert/strict";
import { generationCardState } from "../app/components/studio-generation-card";
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
