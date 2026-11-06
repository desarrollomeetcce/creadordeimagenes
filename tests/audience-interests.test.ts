import test from "node:test";
import assert from "node:assert/strict";
import {
  interestQueries,
  verifiedAudienceInterests,
} from "../lib/creative-studio/audience-interests";
import {
  campaignConfigSchema,
  audienceTargeting,
  launchPlan,
  campaignText,
  validateCampaignText,
} from "../lib/creative-studio/campaign-policy";
import { MetaGraphError } from "../lib/meta-ads/graph-error";
const catalog = [
  { id: "101", name: "Colorimetría" },
  { id: "102", name: "Peluquería" },
];
const config = (x: any = {}) =>
  campaignConfigSchema.parse({
    accountId: "1",
    pageId: "2",
    country: "CO",
    dailyBudget: 10,
    headline: "{diplomado}",
    body: "Info",
    audiences: [
      { name: "A", interests: [catalog[0]] },
      { name: "B", interests: [catalog[1]] },
    ],
    planVersion: 2,
    ...x,
  });
test("AI queries are bounded and have no invented IDs", () => {
  assert.deepEqual(
    interestQueries('{"queries":["Colorimetry","Hair coloring"]}'),
    ["Colorimetry", "Hair coloring"],
  );
  assert.throws(() => interestQueries('{"queries":["a","b","c","d","e"]}'));
});
test("Only actual Meta interest IDs survive; canonical names come from Meta", () => {
  const c = config();
  assert.equal(
    verifiedAudienceInterests(c.audiences, catalog)[0].interests[0].name,
    "Colorimetría",
  );
  assert.throws(
    () =>
      verifiedAudienceInterests(
        config({
          audiences: [
            { name: "Fake", interests: [{ id: "999", name: "Fake" }] },
          ],
        }).audiences,
        catalog,
      ),
    /no confirmó/,
  );
  const one = config({
    audiences: [
      { name: "Renamed", interests: [{ id: "101", name: "Invented label" }] },
    ],
  });
  assert.equal(
    verifiedAudienceInterests(one.audiences, catalog)[0].interests[0].name,
    "Colorimetría",
  );
});
test("Different set names or ages cannot disguise duplicate interest profiles", () => {
  assert.throws(
    () =>
      verifiedAudienceInterests(
        config({
          audiences: [
            { name: "A", ageMin: 18, interests: [catalog[0]] },
            { name: "B", ageMin: 25, interests: [catalog[0]] },
          ],
        }).audiences,
        catalog,
      ),
    /repitió/,
  );
  assert.throws(() =>
    verifiedAudienceInterests(
      config({ audiences: [{ name: "A" }, { name: "B" }] }).audiences,
      catalog,
    ),
  );
});
test("A broad comparison group is allowed alongside a genuinely segmented group", () => {
  assert.equal(
    verifiedAudienceInterests(
      config({
        audiences: [
          { name: "Broad" },
          { name: "Focused", interests: [catalog[0]] },
        ],
      }).audiences,
      catalog,
    ).length,
    2,
  );
  assert.throws(() => verifiedAudienceInterests(config().audiences, []));
});
test("Special categories cannot use restricted profiles", () => {
  assert.throws(() =>
    verifiedAudienceInterests(config().audiences, catalog, true),
  );
  assert.equal(
    verifiedAudienceInterests(
      config({
        audiences: [{ name: "Broad", ageMin: 18, ageMax: 65, gender: "ALL" }],
      }).audiences,
      [],
      true,
    ).length,
    1,
  );
});
test("Meta targeting includes verified interests, chosen platforms and the explicit country", () => {
  const c = config({ platforms: ["facebook"] });
  const t = audienceTargeting(c, 0, {
    flexible_spec: [{ interests: [{ id: "wrong" }] }],
    interests: [{ id: "old" }],
  });
  assert.deepEqual(t.flexible_spec, [{ interests: [catalog[0]] }]);
  assert(!("interests" in t));
  assert.deepEqual(t.publisher_platforms, ["facebook"]);
  assert.deepEqual(t.geo_locations, { countries: ["CO"] });
});
test("All creatives are created and verified before any new campaign or set exists", () => {
  const items = [
    { subproductId: "s", name: "Colorimetría", variationIds: ["v1", "v2"] },
    { subproductId: "t", name: "Belleza", variationIds: ["v3", "v4"] },
  ];
  const plan = launchPlan(items, true, config());
  const firstCampaign = plan.findIndex((s) => s.kind === "CAMPAIGN");
  assert.equal(plan.filter((s) => s.kind === "CREATIVE").length, 4);
  assert(
    plan.reduce((n, s, i) => (s.kind === "VERIFY_CREATIVE" ? i : n), 0) <
      firstCampaign,
  );
  assert.equal(plan.filter((s) => s.kind === "AD").length, 4);
});
test("Graph diagnostics identify POST creation failures instead of falsely reporting GET", () => {
  const error = new MetaGraphError(
    400,
    {
      error: {
        code: 200,
        error_subcode: 1815199,
        message: "Permissions error",
      },
    },
    "secret",
    {
      version: "v26.0",
      endpoint: "act_1/adcreatives",
      fields: "name,object_story_spec",
      method: "POST",
    },
  );
  assert.match(error.message, /POST/);
  assert(!error.message.includes("GET"));
});
test("Headline supports braces and brackets; historical and custom code values are compatible", () => {
  const c = config({
      variables: { codigo: "CO-01", estrellas: "⭐⭐⭐⭐⭐" },
      headline: "Diplomado en [diplomado] {estrellas} [codigo]",
    }),
    item = { subproductId: "s", name: "Colorimetría", variationIds: [] };
  validateCampaignText(item, c);
  assert.equal(
    campaignText(c.headline, item, c),
    "Diplomado en Colorimetría ⭐⭐⭐⭐⭐ CO-01",
  );
});

test("Saved audience retains Meta age/gender/range and strips read-only targeting fields", () => {
  const c = config({
    audiences: [
      {
        name: "Saved",
        savedAudienceId: "55",
        ageMin: 25,
        ageMax: 65,
        gender: "MEN",
      },
    ],
  });
  const t = audienceTargeting(c, 0, {
    age_min: 18,
    age_max: 65,
    age_range: [18, 32],
    genders: [2],
    effective_publisher_platforms: ["instagram"],
    dt_consolidation_state: ["v2"],
    page_types: ["desktopfeed"],
  });
  assert.equal(t.age_min, 18);
  assert.deepEqual(t.genders, [2]);
  assert.deepEqual((t as Record<string, unknown>).age_range, [18, 32]);
  assert(!("effective_publisher_platforms" in t));
  assert(!("page_types" in t));
});
test("Meta user-facing rejection reason is retained and credential-scrubbed", () => {
  const e = new MetaGraphError(
    400,
    {
      error: {
        message: "Invalid parameter",
        code: 100,
        error_subcode: 1870188,
        error_user_title: "Revisa la segmentación",
        error_user_msg: "La edad debe coincidir. Bearer secret",
      },
    },
    "secret",
    {
      version: "v26.0",
      endpoint: "act_1/adsets",
      fields: "targeting",
      method: "POST",
    },
  );
  assert.match(e.message, /La edad debe coincidir/);
  assert(!e.message.includes("Bearer secret"));
});
