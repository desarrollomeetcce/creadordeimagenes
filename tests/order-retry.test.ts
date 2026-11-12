import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { orderRecovery } from "../lib/order-recovery";
import { orderRetrySchema, retrySnapshot } from "../lib/order-retry";
const jobs = [
  {
    status: "COMPLETED",
    snapshot: {},
    variation: { reviewStatus: "APPROVED", deletedAt: null },
  },
  { status: "UNCERTAIN", snapshot: {} },
  { status: "PENDING", snapshot: {} },
];
test("an interrupted order can explicitly retry missing images while ordinary resume remains blocked", () => {
  const state = orderRecovery("NEEDS_REVIEW", jobs, null, true);
  assert.equal(state.canRetry, true);
  assert.equal(state.retryCount, 2);
  assert.equal(state.canContinuePending, false);
  assert.match(state.recoveryHint!, /pausa/);
  assert.equal(orderRecovery("PAUSED", jobs, null, true).canRetry, true);
});
test("retry is not offered to viewers, running orders, closed orders or uncertain dispatch", () => {
  assert.equal(
    orderRecovery("NEEDS_REVIEW", jobs, null, false).canRetry,
    false,
  );
  for (const status of [
    "STOPPED",
    "COMPLETED",
    "ACCEPTED",
    "DISPATCH_UNCERTAIN",
    "ACTIVE",
  ]) {
    assert.equal(orderRecovery(status, jobs, null, true).canRetry, false);
  }
  assert.equal(
    orderRecovery(
      "NEEDS_REVIEW",
      [...jobs, { status: "RUNNING", snapshot: {} }],
      null,
      true,
    ).canRetry,
    false,
  );
});
test("a new paid retry requires an explicit charge acknowledgement and an exact order version", () => {
  const input = {
    requestId: randomUUID(),
    expectedVersion: new Date().toISOString(),
    confirmCharge: true,
  };
  assert(orderRetrySchema.safeParse(input).success);
  assert(
    !orderRetrySchema.safeParse({ ...input, confirmCharge: false }).success,
  );
  assert(
    !orderRetrySchema.safeParse({ ...input, confirmCharge: undefined }).success,
  );
  assert(
    !orderRetrySchema.safeParse({ ...input, expectedVersion: "yesterday" })
      .success,
  );
});
test("retry preserves the original brief and approval group, and removes incompatible provider overrides and old outputs", () => {
  const source = {
    prompt: "Authorized original",
    orderId: "order",
    index: 0,
    previewFirst: true,
    approvalGroup: "group",
    attachmentIds: ["reference"],
    imageQuality: "medium",
    imageResolution: "1024x1024",
    creativePlan: "old output",
    creativeUnavailable: true,
  };
  const copy = retrySnapshot(
    source,
    {
      id: "gemini",
      kind: "image",
      qualities: ["default"],
      resolutions: ["1K"],
    },
    "original",
    "request",
  );
  assert.equal(copy.prompt, source.prompt);
  assert.equal(copy.approvalGroup, "group");
  assert.equal(copy.previewFirst, true);
  assert.equal(copy.index, 0);
  assert.deepEqual(copy.attachmentIds, ["reference"]);
  assert.equal(copy.imageQuality, undefined);
  assert.equal(copy.imageResolution, undefined);
  assert.equal(copy.creativePlan, undefined);
  assert.equal(copy.retryOf, "original");
  assert.equal(source.imageQuality, "medium");
});
