import test from "node:test";
import assert from "node:assert/strict";
import {
  costEntrySchema,
  costDate,
  costMonth,
  carryCostDate,
  previousCostMonth,
} from "../lib/fixed-costs";
test("cost calendar keeps actual dates and clamps recurring month ends", () => {
  assert.equal(previousCostMonth("2027-01"), "2026-12");
  assert.equal(carryCostDate("2026-01-31", "2026-02"), "2026-02-28");
  assert.equal(carryCostDate("2028-01-31", "2028-02"), "2028-02-29");
  assert.equal(costDate.safeParse("2026-02-30").success, false);
  assert.equal(costMonth.safeParse("2026-13").success, false);
});
test("cost entry rejects rounding loss, negative money and invalid fields", () => {
  const entry = {
    sheetId: "s",
    date: "2026-11-06",
    kind: "VARIABLE",
    concept: "Internet",
    amount: "99.90",
    currency: "PEN",
    paid: true,
  };
  assert.equal(costEntrySchema.parse(entry).amount, "99.90");
  for (const amount of ["-1", "1.001", "1e3", "NaN", "9999999999999"])
    assert.equal(
      costEntrySchema.safeParse({ ...entry, amount }).success,
      false,
    );
  assert.equal(
    costEntrySchema.safeParse({ ...entry, unexpected: true }).success,
    false,
  );
  assert.equal(
    costEntrySchema.safeParse({ ...entry, currency: "soles" }).success,
    false,
  );
});

test("income quantity times price is calculated exactly by the server, not trusted from amount", () => {
  const e = {
    sheetId: "s",
    date: "2026-11-06",
    kind: "VARIABLE",
    entryType: "INCOME",
    concept: "Diplomado",
    quantity: 3,
    unitPrice: "0.10",
    amount: "999",
    currency: "PEN",
    paid: true,
  };
  assert.equal(costEntrySchema.parse(e).amount, "0.30");
  assert.equal(
    costEntrySchema.safeParse({
      ...e,
      quantity: 2,
      unitPrice: "999999999999.99",
    }).success,
    false,
  );
  assert.equal(
    costEntrySchema.safeParse({ ...e, quantity: 1.5 }).success,
    false,
  );
});

test("ledger search ignores accents, case and repeated spaces; conversion is explicit and exact", async () => {
  const { costKey, convertedCost } = await import("../lib/cost-ledger");
  assert.equal(costKey("  TECNOLOGÍA   Perú "), costKey("tecnologia peru"));
  assert.equal(convertedCost("10.10", "0.20", "3.75", "USD", "PEN"), "38.63");
  assert.equal(convertedCost("10.10", "0.20", null, "USD", "PEN"), null);
  assert.equal(convertedCost("10.10", "0.20", null, "PEN", "PEN"), "10.30");
  assert.equal(convertedCost("10.10", "0.20", "0", "USD", "PEN"), null);
});
