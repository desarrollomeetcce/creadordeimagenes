import test from "node:test";
import assert from "node:assert/strict";
import {
  canResumeLocalWait,
  launchPollDelay,
  legacyPacingMessage,
} from "../lib/creative-studio/launch-wait";
import type { LaunchStep } from "../lib/creative-studio/campaign-policy";
const steps: LaunchStep[] = [
  {
    key: "image:0:0",
    kind: "IMAGE",
    campaign: 0,
    state: "DONE",
    receipt: { hash: "confirmed" },
  },
  { key: "creative:0:0", kind: "CREATIVE", campaign: 0, state: "UNCERTAIN" },
  { key: "campaign:0", kind: "CAMPAIGN", campaign: 0, state: "PENDING" },
];
test("Only the exact historical pre-transport pacing failure can be resumed", () => {
  assert(
    canResumeLocalWait({
      status: "NEEDS_REVIEW",
      error: legacyPacingMessage,
      steps,
    }),
  );
  for (const error of [
    "Network timeout",
    "Meta Graph HTTP 400: Invalid parameter",
    "Permissions error",
    legacyPacingMessage + " altered",
    null,
  ])
    assert(!canResumeLocalWait({ status: "NEEDS_REVIEW", error, steps }));
  assert(
    !canResumeLocalWait({
      status: "PUBLISHING",
      error: legacyPacingMessage,
      steps,
    }),
  );
  for (const changed of [
    steps.map((s, i) => (i === 1 ? { ...s, receipt: { id: "123" } } : s)),
    steps.map((s, i) =>
      i === 2 ? { ...s, state: "DONE" as const, receipt: { id: "456" } } : s,
    ),
    steps.map((s, i) => (i === 1 ? { ...s, state: "RUNNING" as const } : s)),
    [],
  ])
    assert(
      !canResumeLocalWait({
        status: "NEEDS_REVIEW",
        error: legacyPacingMessage,
        steps: changed,
      }),
    );
});
test("Publication polling honors the saved wait instead of looping every 300ms", () => {
  const now = Date.now();
  assert.equal(
    launchPollDelay(
      { waiting: true, nextAttemptAt: new Date(now + 60000).toISOString() },
      now,
    ),
    60100,
  );
  assert.equal(
    launchPollDelay(
      { waiting: true, nextAttemptAt: new Date(now - 1).toISOString() },
      now,
    ),
    300,
  );
  assert.equal(
    launchPollDelay(
      { waiting: false, nextAttemptAt: new Date(now + 60000).toISOString() },
      now,
    ),
    300,
  );
  assert.equal(
    launchPollDelay({ waiting: true, nextAttemptAt: "invalid" }, now),
    300,
  );
});
