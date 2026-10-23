import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCampaign,
  aggregate,
  defaultRules,
  type Ad,
  type Input,
  type Fact,
} from "../lib/meta-ads/recommendations/engine";
import { shiftDay } from "../lib/meta-ads/analytics";
const today = "2026-10-23",
  now = today + "T23:00:00Z";
const fact = (cost: number, offset = 0, results = 10): Fact => ({
  day: shiftDay(today, -offset),
  spend: cost * results,
  results,
});
const ad = (id: string, overrides: Partial<Ad> = {}): Ad => ({
  id,
  name: id,
  adsetId: "s",
  status: "ACTIVE",
  effectiveStatus: "ACTIVE",
  createdTime: "2026-09-01T00:00:00Z",
  daily: Array.from({ length: 15 }, (_, i) => fact(1.2, i)),
  total: { spend: 180, results: 150, since: "2026-09-01", until: today },
  ...overrides,
});
const input = (ads: Ad[], overrides: Partial<Input> = {}): Input => ({
  campaign: {
    id: "c",
    name: "Campaign",
    status: "ACTIVE",
    effectiveStatus: "ACTIVE",
  },
  adsets: [
    { id: "s", name: "Set", status: "ACTIVE", effectiveStatus: "ACTIVE" },
  ],
  ads,
  today,
  now,
  currency: "PEN",
  coverage: true,
  fresh: true,
  ...overrides,
});
const run = (ads: Ad[], overrides: Partial<Input> = {}) =>
  analyzeCampaign(input(ads, overrides), defaultRules);
const decisions = (a: ReturnType<typeof run>) => [
  ...a.adsets.flatMap((s) => s.ads),
  ...a.orphanAds,
];
const declining = (id: string) =>
  ad(id, {
    daily: [
      fact(1.8),
      ...[1.8, 1.5, 1.2, 0.8, 0.7, 0.5].map((c, i) => fact(c, i + 1)),
    ],
  });

test("weighted costs use total spend / conversations, not average daily costs", () => {
  assert.equal(
    aggregate([
      { day: today, spend: 10, results: 10 },
      { day: shiftDay(today, -1), spend: 10, results: 1 },
    ]).cost,
    20 / 11,
  );
});
test("night: all six efficient active ads stay; no arbitrary cap of two or new creative task", () => {
  const r = run(Array.from({ length: 6 }, (_, i) => ad(String(i))));
  assert.equal(r.counts.viable, 6);
  assert.equal(r.status, "MANTENER");
  assert.equal(r.task, null);
  assert.ok(decisions(r).every((d) => d.action === "MANTENER"));
});
test("night: one stable winner stays; sustained deteriorated peers propose pause", () => {
  const r = run([ad("winner"), declining("bad1"), declining("bad2")]);
  assert.equal(r.counts.viable, 1);
  assert.match(r.summary, /único/);
  assert.equal(
    decisions(r).find((d) => d.id === "bad1")?.action,
    "EVALUAR PAUSA",
  );
  assert.ok(r.task);
});
test("night: all four new ads enter trial group; no truncation to two", () => {
  const r = run(
    Array.from({ length: 4 }, (_, i) =>
      ad(`n${i}`, {
        status: "PAUSED",
        effectiveStatus: "PAUSED",
        createdTime: "2026-10-23T20:00:00Z",
        daily: [],
        total: null,
      }),
    ),
  );
  assert.equal(r.counts.new, 4);
  assert.equal(r.counts.candidates, 4);
  assert.ok(
    decisions(r).every((d) => d.badge === "NUEVO" && d.action === "PROBAR"),
  );
});
test("badge precedence is creation date, then known lifetime unspent, then history", () => {
  const r = run([
    ad("new", {
      createdTime: "2026-10-23T20:00:00Z",
      total: { spend: 0, results: 0, since: today, until: today },
    }),
    ad("old", {
      status: "PAUSED",
      effectiveStatus: "PAUSED",
      daily: [],
      total: { spend: 0.29, results: 0, since: today, until: today },
    }),
    ad("unknown", { total: null, daily: [] }),
  ]);
  const ds = decisions(r);
  assert.equal(ds.find((d) => d.id === "new")?.badge, "NUEVO");
  assert.equal(ds.find((d) => d.id === "old")?.badge, "SIN GASTO");
  assert.equal(ds.find((d) => d.id === "unknown")?.badge, null);
});
test("old unspent ads follow new trials; historical candidates come after unspent", () => {
  const r = run([
    ad("new", {
      status: "PAUSED",
      effectiveStatus: "PAUSED",
      createdTime: "2026-10-23T22:00:00Z",
      daily: [],
      total: null,
    }),
    ad("unspent", {
      status: "PAUSED",
      effectiveStatus: "PAUSED",
      daily: [],
      total: { spend: 0, results: 0, since: today, until: today },
    }),
    ad("history", { status: "PAUSED", effectiveStatus: "PAUSED" }),
  ]);
  const ds = decisions(r);
  assert.deepEqual(
    ds.map((d) => d.id),
    ["new", "unspent", "history"],
  );
  assert.deepEqual(
    ds.map((d) => d.priority),
    [2, 3, 4],
  );
});
test("only one viable ad is preserved, without forcing a second expensive ad", () => {
  const r = run([
    ad("good"),
    ad("costly", { daily: Array.from({ length: 15 }, (_, i) => fact(3, i)) }),
  ]);
  assert.equal(r.counts.viable, 1);
  assert.equal(decisions(r).find((d) => d.id === "good")?.action, "MANTENER");
  assert.equal(
    decisions(r).find((d) => d.id === "costly")?.proposedStatus,
    null,
  );
});
test("paused adsets and their new, historical and unspent ads remain visible; no isolated child activation", () => {
  const r = run([ad("p", { status: "PAUSED", effectiveStatus: "PAUSED" })], {
    adsets: [
      { id: "s", name: "Paused", status: "PAUSED", effectiveStatus: "PAUSED" },
    ],
  });
  assert.equal(r.adsets[0].ads.length, 1);
  assert.equal(r.adsets[0].ads[0].proposedStatus, "ACTIVE");
  assert.deepEqual(r.adsets[0].ads[0].dependencies, [
    { id: "s", name: "Paused", status: "PAUSED" },
  ]);
});
test("stable 1.20 cost is not deterioration and does not lose to a cheaper ad", () => {
  const r = run([
    ad("stable"),
    ad("cheap", { daily: Array.from({ length: 15 }, (_, i) => fact(0.5, i)) }),
  ]);
  const d = decisions(r).find((d) => d.id === "stable")!;
  assert.equal(d.behavior, "ESTABLE");
  assert.equal(d.action, "MANTENER");
  assert.ok(d.forecast);
  assert.ok(Math.abs(d.forecast.cost - 1.2) < 1e-10);
});
test("gradual .50 to 1.80 detects sustained own-history deterioration", () => {
  const r = run([declining("d")]);
  const d = decisions(r)[0];
  assert.equal(d.behavior, "DETERIORADO");
  assert.equal(d.action, "EVALUAR PAUSA");
  assert.ok(d.changePercent! > 30);
  assert.ok(d.forecast!.cost > 1.2);
});
test("today improvement overrides a prior worsening sequence", () => {
  const a = declining("improved");
  a.daily[0] = fact(0.5);
  const d = decisions(run([a]))[0];
  assert.equal(d.behavior, "MEJORA");
  assert.equal(d.action, "MANTENER");
});
test("mixed hierarchy respects campaign independence and includes all child statuses", () => {
  const a = ad("a"),
    b = ad("b", { adsetId: "s2", status: "PAUSED", effectiveStatus: "PAUSED" });
  const r = run([a, b], {
    adsets: [
      { id: "s", name: "A", status: "ACTIVE", effectiveStatus: "ACTIVE" },
      { id: "s2", name: "B", status: "PAUSED", effectiveStatus: "PAUSED" },
    ],
  });
  assert.equal(r.adsets.length, 2);
  assert.equal(r.counts.total, 2);
  const r2 = run([ad("other", { daily: [fact(10)] })], {
    campaign: {
      id: "other",
      name: "Other",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
    },
  });
  assert.equal(r2.counts.viable, 0);
  assert.equal(r.counts.viable, 1);
});
test("insufficient sample and a single bad day do not cause nightly pause or forecast", () => {
  const d = decisions(
    run([ad("tiny", { daily: [fact(4, 0, 1), fact(1, 1, 1)] })]),
  )[0];
  assert.equal(d.action, "REVISAR DATOS");
  assert.equal(d.proposedStatus, null);
  assert.equal(d.forecast, null);
});
test("partial inventory or stale synchronization only returns review, never state changes", () => {
  for (const o of [{ coverage: false }, { fresh: false }]) {
    const r = run(
      [
        declining("a"),
        ad("new", {
          status: "PAUSED",
          effectiveStatus: "PAUSED",
          createdTime: now,
        }),
      ],
      o,
    );
    assert.equal(r.status, "REVISAR DATOS");
    assert.ok(decisions(r).every((d) => d.proposedStatus === null));
  }
});
test("unknown currency requires explicit configuration, never PEN thresholds for USD", () => {
  const r = analyzeCampaign(
    input([ad("a")], { currency: "USD" }),
    defaultRules,
  );
  assert.equal(decisions(r)[0].action, "REVISAR DATOS");
  assert.equal(r.status, "REVISAR DATOS");
  assert.equal(decisions(r)[0].proposedStatus, null);
});
test("active zero-spend ad requests delivery review, not activation; old stale zero total is not unspent proof", () => {
  const d = decisions(
    run([
      ad("a", {
        daily: [],
        total: {
          spend: 0,
          results: 0,
          since: today,
          until: shiftDay(today, -2),
        },
      }),
    ]),
  )[0];
  assert.notEqual(d.badge, "SIN GASTO");
  assert.equal(d.action, "REVISAR DATOS");
  assert.match(d.reason, /entrega/);
});
test("all good across two adsets stay without demanding unnecessary extra tests", () => {
  const r = run([ad("a"), ad("b", { adsetId: "s2" })], {
    adsets: [
      { id: "s", name: "A", status: "ACTIVE", effectiveStatus: "ACTIVE" },
      { id: "s2", name: "B", status: "ACTIVE", effectiveStatus: "ACTIVE" },
    ],
  });
  assert.equal(r.status, "MANTENER");
  assert.equal(r.task, null);
});
test("diurnal: pause zero conversations at .50, retain below threshold without results", () => {
  const r = run(
    [
      ad("pause", { daily: [{ day: today, spend: 0.5, results: 0 }] }),
      ad("observe", { daily: [{ day: today, spend: 0.49, results: 0 }] }),
    ],
    { mode: "day" },
  );
  assert.equal(
    decisions(r).find((d) => d.id === "pause")?.proposedStatus,
    "PAUSED",
  );
  assert.equal(
    decisions(r).find((d) => d.id === "observe")?.proposedStatus,
    null,
  );
});
test("diurnal: 2.00 and above propose pause even sole producer, under 2.00 stays", () => {
  for (const cost of [2, 2.1, 4]) {
    const r = run([ad("sole", { daily: [fact(cost, 0, 1)] })], { mode: "day" });
    assert.equal(decisions(r)[0].proposedStatus, "PAUSED");
    assert.equal(r.counts.viable, 0);
  }
  const r = run([ad("good", { daily: [fact(1.99, 0, 1)] })], { mode: "day" });
  assert.equal(decisions(r)[0].action, "MANTENER");
});
test("diurnal follows daily spend rule even for a new ad; never mutates inputs", () => {
  const x = input(
    [
      ad("new", {
        createdTime: now,
        daily: [{ day: today, spend: 0.5, results: 0 }],
      }),
    ],
    { mode: "day" },
  );
  const before = JSON.stringify(x);
  assert.equal(
    decisions(analyzeCampaign(x, defaultRules))[0].proposedStatus,
    "PAUSED",
  );
  assert.equal(JSON.stringify(x), before);
});

test("recommendation approval explicitly includes and deduplicates paused parents before children", async () => {
  const { approvalPlan } =
    await import("../lib/meta-ads/recommendations/approval");
  const r = run(
    [
      ad("x", {
        status: "PAUSED",
        effectiveStatus: "PAUSED",
        createdTime: now,
      }),
      ad("y", {
        status: "PAUSED",
        effectiveStatus: "PAUSED",
        createdTime: now,
      }),
    ],
    {
      campaign: {
        id: "c",
        name: "Campaign",
        status: "PAUSED",
        effectiveStatus: "PAUSED",
      },
      adsets: [
        { id: "s", name: "Set", status: "PAUSED", effectiveStatus: "PAUSED" },
      ],
    },
  );
  const ds = decisions(r);
  const plan = approvalPlan(
    ds.map((d) => ({
      decision: d,
      item: { id: d.id, name: d.id, status: "PAUSED" },
    })),
  );
  assert.deepEqual(
    plan.map((c) => c.id),
    ["c", "s", "x", "y"],
  );
  assert.ok(
    plan.every((c) => c.status === "ACTIVE" && c.expectedStatus === "PAUSED"),
  );
});
test("approved plan applies sequentially, stops at first failure and never retries uncertain writes", async () => {
  const { applyApprovedPlan } =
    await import("../lib/meta-ads/recommendations/approval");
  let calls: string[] = [],
    messages: string[] = [];
  const plan = ["a", "b", "c"].map((id) => ({
    id,
    name: id,
    status: "PAUSED" as const,
    expectedStatus: "ACTIVE" as const,
  }));
  const completed = await applyApprovedPlan(
    plan,
    async (c) => {
      calls.push(c.id);
      if (c.id === "b") throw Error("Uncertain remote acknowledgement");
    },
    (m) => messages.push(m),
  );
  assert.equal(completed, false);
  assert.deepEqual(calls, ["a", "b"]);
  assert.match(messages[1], /Lote detenido/);
});

test("forecast uses actual dates and complete days, without leaking the partial current day", () => {
  const series = Array.from({ length: 6 }, (_, i) =>
    fact(0.5 * Math.exp(0.1 * (5 - i)), i + 1),
  );
  const r = run([ad("series", { daily: [fact(99), ...series] })]);
  const forecast = decisions(r)[0].forecast!;
  assert.ok(forecast);
  assert.ok(Math.abs(forecast.cost - 0.5 * Math.exp(0.7)) < 1e-10);
  assert.equal(forecast.observations, 6);
  assert.ok(forecast.low < forecast.cost && forecast.high > forecast.cost);
});
test("unconfirmed retained object is visible for review but never receives a proposed change", () => {
  const d = decisions(
    run([ad("old", { confirmed: false, daily: [fact(4)] })], { mode: "day" }),
  )[0];
  assert.equal(d.action, "REVISAR DATOS");
  assert.equal(d.proposedStatus, null);
});

test("active ads still observing are not declared failed or told to create replacements", () => {
  const r = run([ad("zero", { daily: [], total: null })]);
  assert.equal(r.status, "REVISAR DATOS");
  assert.equal(r.task, null);
  assert.match(r.summary, /observación/);
});

test("removed recommendation preferences cannot reopen the old view", async () => {
  const { parseMetaPreferences } = await import("../lib/meta-ads/preferences");
  const p = parseMetaPreferences(JSON.stringify({layoutRevision:2,recommendationMode:"night",recommendationView:"table",view:"cards"}));
  assert.equal(p.view,"cards");
  assert.equal("recommendationMode" in p,false);
  assert.equal("recommendationView" in p,false);
});

test("small current-day sample keeps a stable ad by its own history and explains actual numbers", () => {
  const a = ad("stable-small");
  a.daily[0] = fact(0.4, 0, 1);
  const r = run([a]);
  const d = decisions(r)[0];
  assert.equal(d.action, "MANTENER");
  assert.equal(d.viable, false);
  assert.match(d.reason, /0.40/);
  assert.match(d.reason, /historial propio/);
  assert.equal(r.status, "REVISAR DATOS");
  assert.equal(r.task, null);
  assert.equal(d.comparison.windowDays, 3);
  assert.equal(d.comparison.recentUntil, shiftDay(today, -1));
});
