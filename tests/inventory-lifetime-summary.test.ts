import test from "node:test";
import assert from "node:assert/strict";
import { inventoryLifetimeSummary } from "../lib/meta-ads/inventory-lifetime-summary";
const period = (
  id: string,
  from: string,
  until: string,
  since: string,
  through = since,
) => ({ id, from, until, since, through });
const cell = (sales: number | null, budget: number | null) =>
  ({
    sales,
    budget,
    na: [],
    partialMetrics: [],
    fxPending: [],
    spend: 999,
  }) as any;
const base = () => ({
  since: "2026-10-27",
  today: "2026-10-30",
  asOf: "2026-10-30T12:00:00Z",
  currency: "PEN",
  periods: [
    period(
      "a",
      "2026-10-27T05:00:00Z",
      "2026-10-28T06:00:00Z",
      "2026-10-27",
      "2026-10-28",
    ),
  ],
  timeComplete: true,
  days: {
    "2026-10-27": cell(0, 25),
    "2026-10-28": cell(0, 25),
    "2026-10-29": cell(1, 999),
    "2026-10-30": cell(4, 999),
  },
  meta: [
    { day: "2026-10-27", currency: "PEN", amount: 3 },
    { day: "2026-10-28", currency: "PEN", amount: 0 },
    { day: "2026-10-29", currency: "PEN", amount: 999 },
  ],
  rates: new Map(),
});
test("lifetime counts delayed payments, keeps active-only money and exact duration", () => {
  const s = inventoryLifetimeSummary(base());
  assert.equal(s.sales, 5);
  assert.equal(s.activeDays, 2);
  assert.equal(s.activeHours, 25);
  assert.equal(s.budget, 50);
  assert.equal(s.metaSpend, 3);
  assert.equal(s.metaPartial, false);
});
test("repeated activations on same date do not count sales, days or money twice", () => {
  const b = base();
  b.periods.push(
    period("b", "2026-10-28T09:00:00Z", "2026-10-28T10:00:00Z", "2026-10-28"),
  );
  const s = inventoryLifetimeSummary(b);
  assert.equal(s.sales, 5);
  assert.equal(s.activeDays, 2);
  assert.equal(s.activeHours, 26);
  assert.equal(s.budget, 50);
  assert.equal(s.metaSpend, 3);
});
test("known zero remains zero; missing data and unknown starts remain partial", () => {
  const b = base();
  b.timeComplete = false;
  b.days = { "2026-10-27": cell(0, 0) } as any;
  b.meta = [{ day: "2026-10-27", currency: "PEN", amount: 0 }];
  const s = inventoryLifetimeSummary(b);
  assert.equal(s.sales, 0);
  assert.equal(s.budget, 0);
  assert.equal(s.metaSpend, 0);
  assert.equal(s.salesPartial, true);
  assert.equal(s.budgetPartial, true);
  assert.equal(s.metaPartial, true);
  assert.equal(s.timePartial, true);
});
test("Meta uses raw received amounts and daily FX; missing FX never becomes zero", () => {
  const b = base();
  b.meta = [{ day: "2026-10-27", currency: "USD", amount: 2 }];
  let s = inventoryLifetimeSummary(b);
  assert.equal(s.metaSpend, null);
  assert.equal(s.metaPartial, true);
  b.rates.set("2026-10-27", { USD: 1, PEN: 3.8 });
  s = inventoryLifetimeSummary(b);
  assert.equal(s.metaSpend, 7.6);
  assert.notEqual(s.metaSpend, 999);
});
