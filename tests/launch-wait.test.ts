import test from "node:test";
import assert from "node:assert/strict";
import {
  canResumeLocalWait,
  launchPollDelay,
  legacyPacingMessage,
  canResumeReadVerification,
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
test("Retired ids reads can resume verification only, preserving all creation receipts", () => {
  const error =
    "Meta Graph v26.0 · GET / · HTTP 500 · código 100: The ids query parameter is deprecated in v26.0+.";
  const plan: LaunchStep[] = [
    {
      key: "campaign:0",
      kind: "CAMPAIGN",
      campaign: 0,
      state: "DONE",
      receipt: { id: "11" },
    },
    {
      key: "ad:0:0:0",
      kind: "AD",
      campaign: 0,
      state: "DONE",
      receipt: { id: "12" },
    },
    { key: "verify:0", kind: "VERIFY", campaign: 0, state: "UNCERTAIN" },
    {
      key: "active-campaign:0",
      kind: "ACTIVATE",
      campaign: 0,
      state: "PENDING",
    },
  ];
  assert(
    canResumeReadVerification({ status: "NEEDS_REVIEW", error, steps: plan }),
  );
  for (const kind of [
    "CAMPAIGN",
    "ADSET",
    "AD",
    "CREATIVE",
    "ACTIVATE",
  ] as const) {
    const changed = structuredClone(plan);
    changed[2].kind = kind;
    assert(
      !canResumeReadVerification({
        status: "NEEDS_REVIEW",
        error,
        steps: changed,
      }),
    );
  }
  for (const message of [
    "Network timeout",
    "Invalid parameter",
    legacyPacingMessage,
  ])
    assert(
      !canResumeReadVerification({
        status: "NEEDS_REVIEW",
        error: message,
        steps: plan,
      }),
    );
  const completed = structuredClone(plan);
  completed[2].receipt = { id: "13" };
  assert(
    !canResumeReadVerification({
      status: "NEEDS_REVIEW",
      error,
      steps: completed,
    }),
  );
});
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
