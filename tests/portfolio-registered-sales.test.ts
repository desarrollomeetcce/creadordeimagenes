import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcilePortfolioSales } from "../lib/meta-ads/registered-sales";

test("reads same-day sales once and preserves a recorded zero", () => {
  const day = "2026-11-23";
  assert.deepEqual(reconcilePortfolioSales([
    { day, sales: null, partial: false },
    { day, sales: 5, partial: false },
    { day, sales: 5, partial: false },
    { day: "2026-11-24", sales: 40, partial: false },
  ], day, day), { total: 5, partial: false });
  assert.deepEqual(reconcilePortfolioSales([{ day, sales: 0, partial: false }], day, day),
    { total: 0, partial: false });
});

test("conflicting sales cells do not become a guessed total", () => {
  const day = "2026-11-23";
  assert.deepEqual(reconcilePortfolioSales([
    { day, sales: 2, partial: false },
    { day, sales: 4, partial: false },
    { day: "2026-11-24", sales: 3, partial: false },
  ], day, "2026-11-24"), { total: 3, partial: true });
});
