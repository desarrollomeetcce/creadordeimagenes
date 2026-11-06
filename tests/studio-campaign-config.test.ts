import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignConfigSchema,
  campaignText,
  launchPlan,
  launchSummary,
  imageDistribution,
  audienceTargeting,
  validateCampaignDestination,
  campaignObjective,
  campaignCTA,
  campaignDestination,
} from "../lib/creative-studio/campaign-policy";
const config = (extra: any = {}) =>
  campaignConfigSchema.parse({
    accountId: "123",
    pageId: "456",
    country: "CO",
    dailyBudget: 10,
    body: "Información {diplomado}",
    headline: "Accede a {diplomado} ★★★★★",
    audiences: [{ name: "A" }, { name: "B" }],
    planVersion: 2,
    ...extra,
  });
const item = (n: number) => ({
  subproductId: "s",
  name: "Colorimetría",
  variationIds: Array.from({ length: n }, (_, i) => "v" + i),
});
test("Campaigns distribute images once, balancing each set and preserving activation fencing", () => {
  for (const [n, expected] of [
    [2, [1, 1]],
    [6, [3, 3]],
    [8, [4, 4]],
    [10, [5, 5]],
    [5, [3, 2]],
  ] as const) {
    const c = config(),
      i = item(n);
    assert.deepEqual(imageDistribution(i, c), expected);
    const plan = launchPlan([i], true, c),
      ads = plan.filter((s) => s.kind === "AD");
    assert.equal(ads.length, n);
    assert.equal(new Set(ads.map((s) => s.image)).size, n);
    assert.equal(plan.filter((s) => s.kind === "ADSET").length, 2);
    assert(
      plan.findIndex((s) => s.kind === "ACTIVATE") >
        plan.findIndex((s) => s.kind === "VERIFY"),
    );
    assert.equal(plan.at(-1)?.kind, "VERIFY_LIVE");
    assert.equal(launchSummary([i], c).ads, n);
  }
});
test("Explicit per-set distributions assign all images and reject empty or incomplete sets", () => {
  const c = config({ distribution: { s: [2, 4] } });
  assert.deepEqual(imageDistribution(item(6), c), [2, 4]);
  assert.throws(() => imageDistribution(item(5), c));
  assert.throws(() => imageDistribution(item(1), config()));
  assert.equal(
    launchPlan(
      [item(3)],
      false,
      config({ audiences: [{ name: "Only" }] }),
    ).filter((s) => s.kind === "AD").length,
    3,
  );
  assert(
    !campaignConfigSchema.safeParse({ ...c, distribution: { s: [0, 6] } })
      .success,
  );
});
test("Campaign headline stays identical for all creatives and built-in variables cannot be overwritten", () => {
  const c = config({ variables: { institucion: "Instituto" } }),
    i = item(6);
  assert.equal(campaignText(c.headline, i, c), "Accede a Colorimetría ★★★★★");
  assert.equal(
    campaignText("{institucion} · {pais} · {diplomado}", i, c),
    "Instituto · Colombia · Colorimetría",
  );
  assert.throws(() =>
    validateCampaignDestination(
      config({ variables: { diplomado: "Incorrecto" } }),
    ),
  );
});
test("Explicit platforms override saved placements, genders and excluded countries", () => {
  const c = config({ platforms: ["facebook"] }),
    t = audienceTargeting(c, 0, {
      publisher_platforms: ["instagram", "audience_network"],
      instagram_positions: ["stream"],
      facebook_positions: ["story"],
      genders: [2],
      excluded_geo_locations: { countries: ["CO"] },
    });
  assert.deepEqual(t.publisher_platforms, ["facebook"]);
  assert.deepEqual(t.geo_locations, { countries: ["CO"] });
  assert(!("genders" in t));
  assert(!("instagram_positions" in t));
  assert(!("facebook_positions" in t));
  assert(!("excluded_geo_locations" in t));
  assert(!campaignConfigSchema.safeParse({ ...c, platforms: [] }).success);
});
test("Objectives keep destination, CTA and required resources consistent", () => {
  for (const [objective, outcome, destination, cta] of [
    ["WHATSAPP", "OUTCOME_ENGAGEMENT", "WHATSAPP", "WHATSAPP_MESSAGE"],
    ["LEADS", "OUTCOME_LEADS", "ON_AD", "SIGN_UP"],
    ["TRAFFIC", "OUTCOME_TRAFFIC", "WEBSITE", "LEARN_MORE"],
  ] as const) {
    const c = config({
      objective,
      leadFormId: "789",
      website: "https://example.org",
    });
    validateCampaignDestination(c);
    assert.equal(campaignObjective(c), outcome);
    assert.equal(campaignDestination(c), destination);
    assert.equal(campaignCTA(c).type, cta);
  }
  assert.throws(() =>
    validateCampaignDestination(config({ objective: "LEADS" })),
  );
  assert.throws(() =>
    validateCampaignDestination(
      config({ objective: "TRAFFIC", website: "javascript:alert(1)" }),
    ),
  );
});
test("Special categories avoid age/gender targeting and block restricted saved audiences", () => {
  const c = config({ specialCategory: "EMPLOYMENT" });
  validateCampaignDestination(c);
  const t = audienceTargeting(c, 0);
  assert(!("age_min" in t));
  assert(!("genders" in t));
  assert.throws(() =>
    validateCampaignDestination(
      config({
        specialCategory: "HOUSING",
        audiences: [{ name: "Restricted", ageMin: 30 }],
      }),
    ),
  );
});
test("AI proposals accept only editable copy/demographics with exact audience count", async () => {
  const { parseCampaignSuggestion } =
    await import("../lib/creative-studio/campaign-suggestion");
  const proposal = {
    body: "Texto {diplomado}",
    description: "Detalle",
    audiences: [{ name: "Amplio" }],
  };
  assert.equal(
    parseCampaignSuggestion(JSON.stringify(proposal), 1).audiences[0].ageMin,
    18,
  );
  assert.throws(() =>
    parseCampaignSuggestion(
      JSON.stringify({ ...proposal, headline: "Changed" }),
      1,
    ),
  );
  assert.throws(() => parseCampaignSuggestion(JSON.stringify(proposal), 2));
  assert.throws(() =>
    parseCampaignSuggestion(
      JSON.stringify({
        ...proposal,
        audiences: [{ name: "Fake", savedAudienceId: "99" }],
      }),
      1,
    ),
  );
});

test("Unknown and oversized template variables stop before Meta", async () => {
  const { validateCampaignText } =
    await import("../lib/creative-studio/campaign-policy");
  assert.throws(() =>
    validateCampaignText(item(2), config({ headline: "{missing}" })),
  );
  assert.throws(() =>
    validateCampaignText(
      item(2),
      config({ headline: "{long}", variables: { long: "A".repeat(251) } }),
    ),
  );
  validateCampaignText(item(2), config());
});
