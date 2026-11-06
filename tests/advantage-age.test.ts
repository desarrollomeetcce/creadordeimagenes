import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignConfigSchema,
  audienceTargeting,
} from "../lib/creative-studio/campaign-policy";
const config = (
  audience: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) =>
  campaignConfigSchema.parse({
    accountId: "1",
    pageId: "2",
    country: "CO",
    dailyBudget: 15,
    headline: "[diplomado]",
    body: "Información",
    planVersion: 2,
    audiences: [{ name: "Público", ...audience }],
    ...extra,
  });
test("Advantage+ accepts selected 25–45 as suggested age without an invalid hard cap", () => {
  const c = config({
    ageMin: 25,
    ageMax: 45,
    advantageAudience: true,
    gender: "WOMEN",
    interests: [{ id: "123", name: "Medio ambiente" }],
  });
  const targeting = JSON.parse(JSON.stringify(audienceTargeting(c, 0)));
  assert.deepEqual(targeting.age_range, [25, 45]);
  assert.equal(targeting.age_min, 25);
  assert.equal(targeting.age_max, 65);
  assert.equal(targeting.targeting_automation.advantage_audience, 1);
  assert.deepEqual(targeting.geo_locations, { countries: ["CO"] });
  assert.deepEqual(targeting.genders, [2]);
  assert.deepEqual(targeting.flexible_spec, [
    { interests: [{ id: "123", name: "Medio ambiente" }] },
  ]);
  assert.equal(c.audiences[0].ageMax, 45);
});
test("Age minimum above25 is kept in suggestion and does not create an invalid Advantage hard minimum", () => {
  const c = config({ ageMin: 35, ageMax: 45 });
  const t = audienceTargeting(c, 0);
  assert.equal(t.age_min, 25);
  assert.equal(t.age_max, 65);
  assert.deepEqual(t.age_range, [35, 45]);
  assert.equal(t.targeting_automation.advantage_audience, 1);
});
test("Explicit opt-out keeps strict age limits and removes stale saved suggestions", () => {
  const c = config({
    ageMin: 35,
    ageMax: 45,
    advantageAudience: false,
    strictAge: true,
  });
  const t = audienceTargeting(c, 0, { age_range: [18, 65] });
  assert.equal(t.age_min, 35);
  assert.equal(t.age_max, 45);
  assert(!("age_range" in t));
  assert.equal(t.targeting_automation.advantage_audience, 0);
});
test("Saved native audience keeps its suggested range and automation controls", () => {
  const c = config({ savedAudienceId: "123" }),
    saved = {
      age_min: 25,
      age_max: 65,
      age_range: [35, 45],
      genders: [2],
      targeting_automation: {
        advantage_audience: 1,
        individual_setting: { geo: 1 },
      },
    };
  const t = audienceTargeting(c, 0, saved);
  assert.deepEqual(t.age_range, [35, 45]);
  assert.equal(t.age_max, 65);
  assert.equal(t.age_min, 25);
  assert.deepEqual(
    (t.targeting_automation as Record<string, unknown>).individual_setting,
    { geo: 1 },
  );
  assert.deepEqual(saved.age_range, [35, 45]);
  const strict = audienceTargeting(c, 0, {
    age_min: 35,
    age_max: 45,
    age_range: [18, 65],
    targeting_automation: { advantage_audience: 0 },
  });
  assert.equal(strict.age_max, 45);
  assert.equal(strict.age_min, 35);
  assert(!("age_range" in strict));
});
test("Special categories never gain suggested or strict age fields", () => {
  const c = config({}, { specialCategory: "EMPLOYMENT" });
  const t = audienceTargeting(c, 0, {
    age_min: 35,
    age_max: 45,
    age_range: [35, 45],
  });
  assert(!("age_min" in t));
  assert(!("age_max" in t));
  assert(!("age_range" in t));
  assert.equal(t.targeting_automation.advantage_audience, 1);
});
