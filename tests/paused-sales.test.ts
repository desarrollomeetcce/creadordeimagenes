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
test("a retained paused row stays present but sorts below active rows, with optional reverse state order", () => {
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
    ["A", "C", "B"],
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
  assert.equal(bands.length, 2);
  assert.deepEqual(
    bands.map((b) => b.active),
    [true, false],
  );
  assert.deepEqual(bands[1].names, ["Secundaria"]);
});

test("advisor grouping places every advisor's active section before all inactive sections regardless of pinning", async () => {
  const { groupFinancialRowsByAdvisor } =
    await import("../lib/meta-ads/financial-categories");
  const rows = [
    {
      aliasId: "offA",
      country: "PE",
      advisorId: "a",
      active: false,
      pinned: true,
    },
    { aliasId: "onB", country: "PE", advisorId: "b", active: true },
    { aliasId: "onA", country: "PE", advisorId: "a", active: true },
    {
      aliasId: "offB",
      country: "PE",
      advisorId: "b",
      active: false,
      pinned: true,
    },
  ];
  const groups = groupFinancialRowsByAdvisor(rows, [], {}, [
    { id: "a", name: "Donasis" },
    { id: "b", name: "Jesús" },
  ]);
  assert.deepEqual(
    groups.map((g) => g.name),
    ["Donasis", "Jesús", "Donasis", "Jesús"],
  );
  assert.deepEqual(
    groups.flatMap((g) => g.bands.flatMap((b) => b.rows)).map((r) => r.aliasId),
    ["onA", "onB", "offA", "offB"],
  );
  const reversed = [...rows].sort((a, b) => compareRowRetention(a, b, true));
  assert.deepEqual(
    reversed.map((r) => r.active),
    [false, false, true, true],
  );
});
test("period sales rank uses all visible dates, ignores N/A and outside dates, and distinguishes unknown from zero", async () => {
  const { periodSalesTotals } =
    await import("../lib/meta-ads/retained-row-order");
  const { compareSheetNumbers } =
    await import("../lib/meta-ads/period-summary");
  const cell = (sales: number | null, na = false) => ({
    sales,
    spend: null,
    base: null,
    fixedCost: null,
    ...(na ? { na: ["sales" as const] } : {}),
  });
  const rows: {
    aliasId: string;
    country: string;
    active: boolean;
    days: Record<string, import("../lib/meta-ads/period-summary").PeriodCell>;
  }[] = [
    {
      aliasId: "high",
      country: "PE",
      active: true,
      days: { "2026-11-01": cell(2), "2026-11-02": cell(8) },
    },
    {
      aliasId: "other",
      country: "PE",
      active: true,
      days: {
        "2026-11-01": cell(6),
        "2026-11-02": cell(900, true),
        "2026-10-01": cell(900),
      },
    },
    {
      aliasId: "zero",
      country: "PE",
      active: true,
      days: { "2026-11-01": cell(0) },
    },
    {
      aliasId: "unknown",
      country: "PE",
      active: true,
      days: { "2026-11-01": cell(null) },
    },
  ];
  const totals = periodSalesTotals(rows, ["2026-11-01", "2026-11-02"]);
  assert.deepEqual([...totals.values()], [10, 6, 0, null]);
  const sorted = [...rows].sort((a, b) =>
    compareSheetNumbers(
      totals.get(JSON.stringify([a.aliasId, a.country])) ?? null,
      totals.get(JSON.stringify([b.aliasId, b.country])) ?? null,
      "desc",
    ),
  );
  assert.deepEqual(
    sorted.map((r) => r.aliasId),
    ["high", "other", "zero", "unknown"],
  );
});

test("default task priority is sync, flow, create, stop, active, inactive and repeats within each advisor", async () => {
  const { financialTaskSections, financialTaskPriority } =
    await import("../lib/meta-ads/financial-task-sections");
  const { groupFinancialRowsByAdvisor } =
    await import("../lib/meta-ads/financial-categories");
  const rows = [
    { aliasId: "gray", active: false, campaignTask: "NONE" as const },
    { aliasId: "active", active: true, campaignTask: "NONE" as const },
    { aliasId: "stop", active: true, campaignTask: "STOP" as const },
    { aliasId: "create", active: false, campaignTask: "CREATE" as const },
    { aliasId: "flow", active: false, campaignTask: "FLOW" as const },
    { aliasId: "sync", active: true, campaignTask: "SYNC" as const },
  ].map((r) => ({
    ...r,
    country: "PE",
    currency: "PEN",
    advisorId: "a",
    pinned: true,
  }));
  assert.deepEqual(
    [...rows].sort((a, b) => compareRowRetention(a, b)).map((r) => r.aliasId),
    ["sync", "flow", "create", "stop", "active", "gray"],
  );
  const sections = financialTaskSections(rows);
  assert.deepEqual(
    [
      sections.sync,
      sections.flow,
      sections.assignment,
      sections.stopping,
      sections.normal,
    ].map((g) => g.map((r) => r.aliasId)),
    [["sync"], ["flow"], ["create"], ["stop"], ["gray", "active"]],
  );
  const groups = groupFinancialRowsByAdvisor(
    [
      ...rows,
      ...rows.map((r) => ({ ...r, advisorId: "b", aliasId: r.aliasId + "B" })),
    ],
    [],
    {},
    [
      { id: "a", name: "Donasis" },
      { id: "b", name: "Jesús" },
    ],
  );
  for (const group of groups)
    assert.deepEqual(
      group.bands.flatMap((b) => b.rows).map(financialTaskPriority),
      group.inactive ? [5] : [0, 1, 2, 3, 4],
    );
  const grayWithTask = { ...rows[0], campaignTask: "FLOW" as const };
  assert.equal(grayWithTask.active, false);
  assert.equal(financialTaskPriority(grayWithTask), 1);
});

test("advisor sections handle unknown advisors and filtered views without empty groups or changed row order", async () => {
  const { groupFinancialRowsByAdvisor } = await import("../lib/meta-ads/financial-categories");
  const rows = [
    { aliasId: "offA", country: "PE", advisorId: "a", active: false },
    { aliasId: "unassignedOn", country: "PE", advisorId: "unknown", active: true },
    { aliasId: "onB2", country: "PE", advisorId: "b", active: true },
    { aliasId: "unassignedOff", country: "PE", advisorId: null, active: false },
    { aliasId: "onB1", country: "PE", advisorId: "b", active: true },
  ];
  const before = JSON.stringify(rows);
  const advisors = [{ id: "a", name: "Donasis" }, { id: "b", name: "Jesús" }];
  for (const preserveOrder of [false, true]) {
    const groups = groupFinancialRowsByAdvisor(rows, [], {}, advisors, preserveOrder);
    assert.deepEqual(groups.map(g => [g.name, g.inactive]), [
      ["Jesús", false], ["Sin asesor", false], ["Donasis", true], ["Sin asesor", true],
    ]);
    assert.deepEqual(groups.flatMap(g => g.bands.flatMap(b => b.rows)).map(r => r.aliasId),
      ["onB2", "onB1", "unassignedOn", "offA", "unassignedOff"]);
    for (const active of [false, true]) {
      const filtered = rows.filter(r => r.active === active);
      const sections = groupFinancialRowsByAdvisor(filtered, [], {}, advisors, preserveOrder);
      assert.ok(sections.every(g => g.rows.length > 0 && g.inactive === !active));
      assert.equal(sections.flatMap(g => g.rows).length, filtered.length);
    }
  }
  assert.equal(JSON.stringify(rows), before);
});
