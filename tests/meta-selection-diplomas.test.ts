import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSelectionDiplomas,
  summarizeDiplomaPeriod,
  type SelectionDiplomaSource,
  type SelectionDiplomaPeriod,
} from "../lib/meta-ads/selection-diplomas";
const o = (id: string, currency = "PEN"): SelectionDiplomaSource => ({
  id,
  name: "Campaign " + id,
  aliasId: "diploma",
  aliasCountry: "PE",
  alias: { id: "diploma", name: "Diplomado" },
  metric: "MESSAGES",
  metricName: "Conversaciones",
  currency,
  status: "ACTIVE",
});
const p = (
  sales: number | null,
  spend: number,
  shared = 1,
): SelectionDiplomaPeriod => ({
  since: "2026-11-01",
  until: "2026-11-03",
  spend,
  results: 30,
  state: "RESULTS",
  metaAvailable: true,
  sales: {
    sales,
    partial: false,
    sharedCampaigns: shared,
    linked: true,
    since: "2026-11-01",
    until: "2026-11-03",
    cac: null,
    effectiveness: null,
    provisional: false,
    status: "PENDING",
    rulesCurrency: "PEN",
    rules: { review: 35, severe: 50, critical: 65, zero: 25 },
    statusReason: "",
  },
});
test("Diploma grouping deduplicates common sales and sums only selected Meta campaign spend", () => {
  const a = o("1"),
    b = o("2");
  assert.equal(groupSelectionDiplomas([a, b]).length, 1);
  const all = summarizeDiplomaPeriod([
    { o: a, p: p(3, 30, 2) },
    { o: b, p: p(3, 60, 2) },
  ]);
  assert.equal(all.sales, 3);
  assert.equal(all.spend, 90);
  assert.equal(all.cac, 30);
  assert.equal(all.results, 60);
  assert.equal(all.effectiveness, 5);
  const subset = summarizeDiplomaPeriod([{ o: a, p: p(3, 30, 2) }]);
  assert.equal(subset.sales, 3);
  assert.equal(subset.cac, null);
  assert.equal(subset.status, "PENDING");
});
test("Diploma grouping preserves zero, missing sales and conflicts without choosing arbitrary counts", () => {
  assert.equal(summarizeDiplomaPeriod([{ o: o("1"), p: p(0, 100) }]).sales, 0);
  assert.equal(
    summarizeDiplomaPeriod([{ o: o("1"), p: p(null, 100) }]).sales,
    null,
  );
  const r = summarizeDiplomaPeriod([
    { o: o("1"), p: p(3, 30, 2) },
    { o: o("2"), p: p(4, 60, 2) },
  ]);
  assert(r.conflict);
  assert.equal(r.sales, null);
  assert.equal(r.cac, null);
});
test("Known Meta values survive incomplete coverage as partial without classifying a complete CAC", () => {
  const period = {
    ...p(3, 90),
    state: "UNAVAILABLE",
    metaAvailable: false,
    reportedMeta: true,
    metaPartial: true,
  };
  const r = summarizeDiplomaPeriod([{ o: o("1"), p: period }]);
  assert.equal(r.spend, 90);
  assert.equal(r.results, 30);
  assert(r.metaPartial);
  assert.equal(r.cac, null);
  assert.equal(r.status, "PENDING");
  assert.equal(
    summarizeDiplomaPeriod([
      { o: o("1"), p: { ...period, reportedMeta: false } },
    ]).spend,
    null,
  );
});
test("Currencies stay separate and mixed objectives cannot become one effectiveness denominator", () => {
  assert.equal(groupSelectionDiplomas([o("1"), o("2", "USD")]).length, 2);
  const r = summarizeDiplomaPeriod([
    { o: o("1"), p: p(3, 30, 2) },
    { o: { ...o("2"), metric: "LEADS" }, p: p(3, 60, 2) },
  ]);
  assert.equal(r.results, null);
  assert.equal(r.effectiveness, null);
});
