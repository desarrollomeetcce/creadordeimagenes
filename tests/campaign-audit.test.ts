import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignAuditRows,
  type CampaignAuditLaunch,
} from "../lib/campaign-audit-summary";
const launch = (
  extra: Partial<CampaignAuditLaunch> = {},
): CampaignAuditLaunch => ({
  id: "launch",
  accountId: "12345",
  createdAt: "2026-11-11T10:00:00Z",
  updatedAt: "2026-11-11T11:00:00Z",
  config: { country: "MX", campaignName: "[pais] - [diplomado]" },
  items: [{ name: "Gestión de restaurantes" }],
  steps: [
    { kind: "CAMPAIGN", state: "DONE", campaign: 0, id: "111" },
    { kind: "ADSET", state: "DONE", campaign: 0, id: "222" },
    { kind: "AD", state: "DONE", campaign: 0, id: "333" },
  ],
  ...extra,
});
test("audit resolves the actual country/product name and uses a safe direct Meta link", () => {
  const [row] = campaignAuditRows(launch());
  assert.equal(row.name, "México - Gestión de restaurantes");
  assert.equal(row.adsetCount, 1);
  assert.equal(row.adCount, 1);
  const url = new URL(row.href!);
  assert.equal(url.hostname, "adsmanager.facebook.com");
  assert.equal(url.searchParams.get("act"), "12345");
  assert.equal(url.searchParams.get("selected_campaign_ids"), "111");
});
test("audit keeps literal titles and resolves braces/custom variables exactly as publishing", () => {
  assert.equal(
    campaignAuditRows(
      launch({ config: { country: "PE", campaignName: "Nombre literal" } }),
    )[0].name,
    "Nombre literal",
  );
  assert.equal(
    campaignAuditRows(
      launch({
        config: {
          country: "PE",
          campaignName: "{pais}: {producto} - [codigo]",
          code: "A",
          variables: { codigo: "B" },
        },
      }),
    )[0].name,
    "Perú: Gestión de restaurantes - B",
  );
});
test("existing campaign keeps its real name and counts only newly created children once", () => {
  const rows = campaignAuditRows(
    launch({
      config: {
        country: "MX",
        existingCampaign: { name: "Campaña real anterior" },
      },
      items: [{ name: "Uno" }, { name: "Dos" }],
      steps: [
        {
          kind: "CAMPAIGN",
          state: "DONE",
          campaign: 0,
          id: "111",
          existing: true,
        },
        {
          kind: "CAMPAIGN",
          state: "DONE",
          campaign: 1,
          id: "111",
          existing: true,
        },
        {
          kind: "ADSET",
          state: "DONE",
          campaign: 0,
          id: "200",
          existing: true,
        },
        { kind: "ADSET", state: "DONE", campaign: 1, id: "201" },
        { kind: "AD", state: "DONE", campaign: 0, id: "301" },
        { kind: "AD", state: "DONE", campaign: 1, id: "301" },
        { kind: "AD", state: "DONE", campaign: 1, id: "302" },
        { kind: "AD", state: "UNCERTAIN", campaign: 1, id: "303" },
      ],
    }),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Campaña real anterior");
  assert.equal(rows[0].adsetCount, 1);
  assert.equal(rows[0].adCount, 2);
});
test("audit never invents campaign IDs or counts unconfirmed receipts", () => {
  assert.deepEqual(
    campaignAuditRows(
      launch({
        steps: [
          { kind: "CAMPAIGN", campaign: 0, state: "UNCERTAIN", id: "111" },
        ],
      }),
    ),
    [],
  );
  assert.deepEqual(
    campaignAuditRows(
      launch({
        steps: [
          {
            kind: "CAMPAIGN",
            campaign: 0,
            state: "DONE",
            id: "javascript:alert(1)",
          },
        ],
      }),
    ),
    [],
  );
  assert.deepEqual(campaignAuditRows(launch({ items: null, steps: null })), []);
  assert.equal(
    campaignAuditRows(launch({ accountId: "not-a-meta-id" }))[0].href,
    null,
  );
});
