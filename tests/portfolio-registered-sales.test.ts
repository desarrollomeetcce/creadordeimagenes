import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcilePortfolioSales, salesForUnambiguousAssignment } from "../lib/meta-ads/registered-sales";

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


test("advisor performance can use a registered copy only when the dated assignment is unique", () => {
  const assigned = { advisorId: "ana", sales: null, blocked: false };
  const recorded = { advisorId: null, sales: 5, blocked: false };
  assert.equal(salesForUnambiguousAssignment("ana", [assigned, recorded, recorded]), 5);
  assert.equal(salesForUnambiguousAssignment("ana", [assigned, { ...recorded, sales: 0 }]), 0);
  assert.equal(salesForUnambiguousAssignment("ana", [recorded]), null);
  assert.equal(salesForUnambiguousAssignment("ana", [assigned, { ...recorded, advisorId: "other" }]), null);
  assert.equal(salesForUnambiguousAssignment("ana", [assigned, recorded, { ...recorded, sales: 2 }]), null);
  assert.equal(salesForUnambiguousAssignment("ana", [assigned, { ...recorded, blocked: true }]), null);
  assert.equal(salesForUnambiguousAssignment("ana", [{ ...assigned, sales: 5 }, recorded]), null);
});
