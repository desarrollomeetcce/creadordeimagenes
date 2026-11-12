import test from "node:test";
import assert from "node:assert/strict";
import { allCampaignsStopped } from "../lib/meta-ads/paused-sales-retention";
import { compareRowRetention } from "../lib/meta-ads/retained-row-order";
import {
  financialRowCategories,
  groupFinancialRows,
  financialRowKey,
} from "../lib/meta-ads/financial-categories";
test("Meta pause requires confirmed off states for every linked campaign; unknown or missing is not off", () => {
  assert.equal(allCampaignsStopped(["PAUSED"]), true);
  assert.equal(allCampaignsStopped(["PAUSED", "ARCHIVED", "DELETED"]), true);
  for (const statuses of [
    [],
    [null],
    ["PAUSED", null],
    ["PAUSED", "ACTIVE"],
    ["UNAVAILABLE"],
    ["PAUSED", "PENDING_REVIEW"],
  ])
    assert.equal(allCampaignsStopped(statuses), false);
});
test("a paused pinned row keeps its sorting group and place among active rows", () => {
  const rows = [
    { name: "A", active: true },
    { name: "B", active: true },
    { name: "C", active: true },
  ];
  const sort = (input: typeof rows) =>
    input.sort(
      (a, b) => compareRowRetention(a, b) || a.name.localeCompare(b.name),
    );
  assert.deepEqual(
    sort(
      rows.map((r) =>
        r.name === "B" ? { ...r, active: false, pinned: true } : r,
      ),
    ).map((r) => r.name),
    ["A", "B", "C"],
  );
  assert.deepEqual(
    sort(rows.map((r) => (r.name === "B" ? { ...r, active: false } : r))).map(
      (r) => r.name,
    ),
    ["A", "C", "B"],
  );
});
test("pinned inactive rows keep their existing category instead of moving into the inactive section", () => {
  const entry = {
    id: "a",
    name: "A",
    categoryAssignments: [
      { category: { id: "p", name: "Principal", kind: "PRIMARY" as const } },
      { category: { id: "s", name: "Secundaria", kind: "SECONDARY" as const } },
    ],
  };
  const row = { aliasId: "a", country: "PE", active: true, pinned: false };
  const temporary = { [financialRowKey(row)]: ["s"] };
  assert.deepEqual(
    financialRowCategories(
      { ...row, active: false, pinned: true },
      entry,
      temporary,
    ).ids,
    ["s"],
  );
  assert.deepEqual(
    financialRowCategories(
      { ...row, active: false, pinned: false },
      entry,
      temporary,
    ).ids,
    ["p"],
  );
  const bands = groupFinancialRows(
    [row, { ...row, aliasId: "b", active: false, pinned: true }],
    [entry, { ...entry, id: "b" }],
    { ...temporary, [financialRowKey({ ...row, aliasId: "b" })]: ["s"] },
  );
  assert.equal(bands.length, 1);
  assert.equal(bands[0].rows.length, 2);
});
