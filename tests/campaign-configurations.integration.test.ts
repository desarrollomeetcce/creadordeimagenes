import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
test(
  "Separate named campaign/ad configurations preserve scope, permissions, history and CAS",
  { skip: process.env.RUN_CAMPAIGN_CONFIG_QA !== "1" },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const { db } = await import("../lib/db");
    const { createStudioProject, createStudioProduct } =
      await import("../lib/creative-studio/service");
    const { saveConfiguration } =
      await import("../lib/creative-studio/campaign-configurations");
    const { campaignPresets, saveCampaignPreset } =
      await import("../lib/creative-studio/campaign-presets");
    const { reusableCampaignSettings } =
      await import("../lib/creative-studio/campaign-workbench-policy");
    const owner = await db.user.create({
        data: {
          email: randomUUID() + "@example.invalid",
          name: "Configuration QA",
          passwordHash: "synthetic",
          role: "OWNER",
          status: "APPROVED",
        },
      }),
      stranger = await db.user.create({
        data: {
          email: randomUUID() + "@example.invalid",
          name: "Other",
          passwordHash: "synthetic",
          role: "USER",
          status: "APPROVED",
        },
      });
    const project = await createStudioProject(owner, {
        name: "Configuration " + randomUUID(),
        requestId: randomUUID(),
      }),
      category = await createStudioProduct(owner, project.id, {
        name: "Uruguay",
        country: "UY",
        requestId: randomUUID(),
      });
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = async () => {
      throw Error("No external calls allowed");
    };
    try {
      const campaign = {
        id: randomUUID(),
        name: "WhatsApp general",
        settings: {
          campaignName: "[pais] · [diplomado]",
          objective: "WHATSAPP",
          platforms: ["facebook", "instagram"],
          allowExcludedPlacementSpend: false,
          adsetCount: 2,
        },
      };
      const ad = {
        id: randomUUID(),
        name: "Anuncios generales",
        settings: {
          body: "Conoce [diplomado]",
          headline: "[diplomado]",
          description: "Información",
          multiAdvertiser: true,
          conversation: {
            name: "Consulta",
            greeting: "Hola",
            autofill: "Quiero información",
          },
        },
      };
      const [c, a] = await Promise.all([
        saveConfiguration(owner, category.id, campaign, "campaign"),
        saveConfiguration(owner, category.id, ad, "ad"),
      ]);
      assert.equal(c.revision, 1);
      assert.equal(a.revision, 1);
      assert.deepEqual(
        await saveConfiguration(owner, category.id, campaign, "campaign"),
        c,
      );
      let dir = await campaignPresets(owner, category.id);
      assert.equal(dir.campaignConfigurations.length, 1);
      assert.equal(dir.adConfigurations.length, 1);
      assert.equal(dir.adConfigurations[0].settings.multiAdvertiser, true);
      assert.equal(dir.presets.length, 0);
      await assert.rejects(
        saveConfiguration(
          owner,
          category.id,
          { ...campaign, settings: { ...campaign.settings, dailyBudget: 99 } },
          "campaign",
        ),
      );
      await assert.rejects(
        saveConfiguration(
          owner,
          category.id,
          { ...ad, settings: { ...ad.settings, adsetCount: 3 } },
          "ad",
        ),
      );
      await assert.rejects(
        saveConfiguration(stranger, category.id, campaign, "campaign"),
      );
      const changed = await saveConfiguration(
        owner,
        category.id,
        {
          ...campaign,
          expectedRevision: 1,
          settings: { ...campaign.settings, adsetCount: 3 },
        },
        "campaign",
      );
      assert.equal(changed.revision, 2);
      await assert.rejects(
        saveConfiguration(
          owner,
          category.id,
          {
            ...campaign,
            expectedRevision: 1,
            settings: { ...campaign.settings, adsetCount: 4 },
          },
          "campaign",
        ),
        /cambió/,
      );
      const old = await saveCampaignPreset(owner, category.id, {
        name: "Histórica",
        settings: reusableCampaignSettings({
          objective: "WHATSAPP",
          platforms: ["facebook"],
          body: "Antes",
          headline: "Curso",
          description: "",
        }),
      });
      dir = await campaignPresets(owner, category.id);
      assert.equal(dir.presets[0].id, old.id);
      assert.equal(dir.campaignConfigurations.length, 2);
      assert.equal(dir.adConfigurations.length, 2);
      assert.equal(
        dir.campaignConfigurations.find((p: any) => p.id === c.id).settings
          .adsetCount,
        3,
      );
      assert.equal(
        dir.adConfigurations.find((p: any) => p.id === a.id).settings.body,
        ad.settings.body,
      );
    } finally {
      globalThis.fetch = fetchBefore;
      await db.category.deleteMany({ where: { projectId: project.id } });
      await db.project.delete({ where: { id: project.id } });
      await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
      await db.user.deleteMany({
        where: { id: { in: [owner.id, stranger.id] } },
      });
      await db.$disconnect();
    }
  },
);
