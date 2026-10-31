import test from "node:test";
import assert from "node:assert/strict";
import {
  cacAssessment,
  cacWindow,
  inventoryCacSummary,
  readCacRules,
} from "../lib/meta-ads/inventory-cac";
import type { EffectivenessRow } from "../lib/meta-ads/effectiveness";
const day = (
  sales: number | null,
  budget: number | null,
  g: number | null = null,
  na: string[] = [],
) =>
  ({
    sales,
    budget,
    metaSpend: g,
    sourceSpend: g === null ? [] : [{ amount: g, currency: "PEN" }],
    na,
    partialMetrics: [],
    fxPending: [],
  }) as unknown as EffectivenessRow["days"][string];
const report = (
  days: EffectivenessRow["days"],
  since = "2026-10-30",
  until = "2026-10-31",
) =>
  inventoryCacSummary({
    row: { currency: "PEN", days } as unknown as EffectivenessRow,
    since,
    until,
    rates: new Map(),
  });
test("CAC thresholds include exact decimals, zero sales never divides, overrides remain ordered", () => {
  for (const [cost, status] of [
    [0, "WITHIN"],
    [34.99, "WITHIN"],
    [35, "ALERT"],
    [49.99, "ALERT"],
    [50, "SEVERE"],
    [64.99, "SEVERE"],
    [65, "CRITICAL"],
  ] as const)
    assert.equal(cacAssessment(1, cost, true).status, status);
  assert.equal(cacAssessment(0, 100, true).value, null);
  assert.equal(cacAssessment(0, 25, true).status, "ALERT");
  assert.equal(cacAssessment(0, 24.99, true).status, "TESTING");
  assert.equal(cacAssessment(null, 10, true).status, "PENDING");
  assert.equal(
    cacAssessment(1, 45, true, {
      review: 40,
      severe: 60,
      critical: 80,
      zero: 20,
    }).status,
    "ALERT",
  );
  assert.equal(
    readCacRules({ review: 60, severe: 35, critical: 65, zero: 25 }).review,
    35,
  );
});
test("rolling window is exactly today plus thirteen days; older success does not mask recent performance", () => {
  assert.deepEqual(cacWindow("2026-10-31"), {
    since: "2026-10-18",
    until: "2026-10-31",
  });
  const s = inventoryCacSummary({
    row: {
      currency: "PEN",
      days: { "2026-10-17": day(100, 1), "2026-10-31": day(1, 65) },
    } as unknown as EffectivenessRow,
    ...cacWindow("2026-10-31"),
    rates: new Map(),
  });
  assert.equal(s.sales, 1);
  assert.equal(s.budget.cac, 65);
  assert.equal(s.budget.assessment.status, "CRITICAL"); // first registration inside the rolling window starts this report
});
test("Sunday zero, Saturday P0 with late sales, N/A days and original Meta have separate meanings", () => {
  const s = report({
    "2026-10-30": day(0, 50, 60),
    "2026-10-31": day(1, 0, 0),
  });
  assert.equal(s.days, 2);
  assert.equal(s.budget.cac, 50);
  assert.equal(s.budget.assessment.status, "SEVERE");
  assert.equal(s.meta.cac, 60);
  const n = report({
    "2026-10-30": day(null, null, null, ["sales", "budget"]),
    "2026-10-31": day(1, 20, 30),
  });
  assert.equal(n.days, 1);
  assert.equal(n.budget.assessment.status, "WITHIN");
  assert.equal(n.budget.cac, 20);
  const costs = report({
    "2026-10-30": day(null, 15, 20, ["sales"]),
    "2026-10-31": day(1, 20, 30),
  });
  assert.equal(costs.budget.cac, 35);
  assert.equal(costs.meta.cac, 50);
  assert.equal(costs.meta.assessment.status, "SEVERE");
  const unknown = report({
    "2026-10-30": day(0, null, 10),
    "2026-10-31": day(1, 20, 30),
  });
  assert.equal(unknown.budget.assessment.status, "PENDING");
  assert.equal(unknown.meta.cac, 40);
});
test("CAC thresholds use daily PEN equivalents while retaining display currency; missing FX stays pending", () => {
  const days = {
    "2026-10-30": {
      ...day(1, 10),
      sourceSpend: [{ amount: 5, currency: "USD" }],
      metaSpend: 5,
    },
    "2026-10-31": {
      ...day(1, 20),
      sourceSpend: [{ amount: 5, currency: "USD" }],
      metaSpend: 5,
    },
  };
  const input = {
    row: { currency: "USD", days } as unknown as EffectivenessRow,
    since: "2026-10-30",
    until: "2026-10-31",
  };
  const s = inventoryCacSummary({
    ...input,
    rates: new Map([
      ["2026-10-30", { USD: 1, PEN: 3 }],
      ["2026-10-31", { USD: 1, PEN: 4 }],
    ]),
  });
  assert.equal(s.budget.cac, 15);
  assert.equal(s.budget.assessment.value, 55);
  assert.equal(s.budget.assessment.status, "SEVERE");
  assert.equal(s.meta.assessment.value, 17.5);
  assert.equal(
    inventoryCacSummary({ ...input, rates: new Map() }).budget.assessment
      .status,
    "PENDING",
  );
});
