import { test } from "node:test";
import assert from "node:assert/strict";
import { advisorAssignedAt } from "../lib/meta-ads/advisor-attribution";

test("the current assignment respects scheduled transfers and explicit removals", () => {
  const change = {
    id: "transfer",
    previousAdvisorId: "first",
    advisorId: "second",
    createdAt: new Date("2026-11-25T14:00:00Z"),
    effectiveAt: new Date("2026-11-26T15:00:00Z"),
    mode: "CLOCK",
    cutoffSales: null,
  };
  assert.equal(advisorAssignedAt("second", [change], new Date("2026-11-26T14:00:00Z")), "first");
  assert.equal(advisorAssignedAt("second", [change], change.effectiveAt), "second");
  assert.equal(advisorAssignedAt(null, [{ ...change, advisorId: null }], change.effectiveAt), null);
  assert.equal(advisorAssignedAt("legacy", [], change.effectiveAt), "legacy");
});
