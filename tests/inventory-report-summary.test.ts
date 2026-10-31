import test from "node:test";
import assert from "node:assert/strict";
import { reportingActivity } from "../lib/meta-ads/reporting-activity";
import { inventoryReportSummary } from "../lib/meta-ads/inventory-report-summary";
import { hasRecordedActivity } from "../lib/meta-ads/recorded-starts";
import type { EffectivenessRow } from "../lib/meta-ads/effectiveness";
const asOf = "2026-10-31T17:00:00Z";
const cell = (
  sales: number | null,
  budget: number | null,
  spend: number | null = null,
) =>
  ({
    sales,
    budget,
    spend: 999,
    metaSpend: spend,
    sourceBase: 100,
    sourceSpend: spend === null ? [] : [{ amount: spend, currency: "PEN" }],
    na: [],
    partialMetrics: [],
    fxPending: [],
  }) as unknown as EffectivenessRow["days"][string];
const event = (id: string, active: boolean, day: string) => ({
  id,
  active,
  createdAt: day + "T05:00:00Z",
});
test("reporting activity uses explicit manual zero, never raw old Meta or blank dates", () => {
  const days = {
    "2020-01-01": cell(null, null, 99),
    "2026-10-28": cell(0, null),
    "2026-10-30": cell(null, 0),
  };
  const a = reportingActivity(days, [], asOf);
  assert.equal(a.since, "2026-10-28");
  assert.equal(a.periods.length, 2);
  assert.equal(a.inferred, true);
  assert.equal(
    reportingActivity({ "2020-01-01": cell(null, null, 99) }, [], asOf).since,
    null,
  );
  assert.equal(hasRecordedActivity({ sales: 0, annotations: {} }), true);
  assert.equal(
    hasRecordedActivity({ sales: null, annotations: { budget: { value: 0 } } }),
    true,
  );
  assert.equal(
    hasRecordedActivity({ sales: 0, annotations: { sales: { value: "NA" } } }),
    false,
  );
});
test("known off intervals remain off despite manual cells; new activation controls continuous days", () => {
  const days = {
    "2026-10-26": cell(0, 10),
    "2026-10-28": cell(0, 10),
    "2026-10-30": cell(1, 20),
    "2026-10-31": cell(1, 20),
  };
  const events = [
    event("off", false, "2026-10-27"),
    event("on", true, "2026-10-30"),
  ];
  const a = reportingActivity(days, events, asOf);
  assert.equal(a.since, "2026-10-26");
  assert.equal(a.periods.length, 2);
  assert.equal(a.periods[0].since, "2026-10-30");
  assert.equal(a.periods[1].through, "2026-10-26");
  const s = inventoryReportSummary({
    row: { currency: "PEN", days } as unknown as EffectivenessRow,
    events,
    asOf,
    rates: new Map(),
  });
  assert.equal(s.activeDays, 3);
  assert.equal(s.budget, 50);
  assert.equal(s.activeHours, null);
  const older = reportingActivity(
    { ...days, "2026-10-24": cell(0, 10) },
    events,
    asOf,
  );
  assert.equal(older.since, "2026-10-24");
});
test("manual and Meta CAC and factors use distinct sources, preserve zero and custom limits", () => {
  const days = { "2026-10-30": cell(2, 40, 10), "2026-10-31": cell(0, 20, 5) };
  const s = inventoryReportSummary({
    row: { currency: "PEN", days } as unknown as EffectivenessRow,
    events: [event("on", true, "2026-10-30")],
    asOf,
    rates: new Map(),
    limits: [25, 50, 200],
  });
  assert.equal(s.sales, 2);
  assert.equal(s.budgetCac, 30);
  assert.equal(s.metaCac, 7.5);
  assert.equal(s.budgetAssessment.usage, 0.3);
  assert.equal(s.metaAssessment.usage, 0.075);
  assert.equal(s.budgetAssessment.status, "WITHIN");
  assert.equal(s.metaSpend, 15);
  const z = inventoryReportSummary({
    row: {
      currency: "PEN",
      days: { "2026-10-31": cell(0, 0, 0) },
    } as unknown as EffectivenessRow,
    events: [],
    asOf,
    rates: new Map(),
  });
  assert.equal(z.sales, 0);
  assert.equal(z.budget, 0);
  assert.equal(z.budgetCac, null);
  assert.equal(z.activeDays, 1);
});
