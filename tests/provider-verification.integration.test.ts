import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Run only against the explicitly named disposable QA database.
test(
  "old model verification survives reads and compatible saves, not credential changes",
  {
    skip: process.env.RUN_PROVIDER_VERIFICATION_QA !== "1",
  },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const { db } = await import("../lib/db");
    const { encryptKey } = await import("../lib/crypto");
    const { configured } = await import("../lib/ai");
    const { aiConfigurationView, saveAIConfiguration } =
      await import("../lib/provider-settings");
    const { creativeConnection } = await import("../lib/provider-connections");
    const { compatibleModels } = await import("../lib/providers");
    const before = await db.providerConfiguration.findUnique({
      where: { id: "global" },
    });
    const profile = await db.providerConnection.findUnique({
      where: { provider: "openai" },
    });
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("No provider calls allowed in QA");
    };
    const actor = await db.user.create({
      data: {
        email: `verification-${randomUUID()}@example.invalid`,
        name: "Verification QA",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    });
    const at = new Date("2020-01-01T00:00:00Z");
    const data = {
      provider: "openai",
      encryptedKey: encryptKey("synthetic-key"),
      maskedKey: "synthetic",
      status: "VERIFIED",
      revision: 7,
      verifiedRevision: 7,
      verifiedAt: at,
      models: compatibleModels(["gpt-image-2", "gpt-5-mini"]),
      imageModel: "gpt-image-2",
      creativeModel: "gpt-5-mini",
      creativeProvider: "openai",
      quality: "medium",
      resolution: "1024x1024",
      alternatives: [],
    };
    try {
      await db.providerConfiguration.upsert({
        where: { id: "global" },
        create: data,
        update: data,
      });
      for (const meta of [false, true]) {
        const view = await aiConfigurationView(meta);
        assert.equal(view.status, "VERIFIED");
        assert.equal(view.creativeStatus, "VERIFIED");
      }
      assert.equal((await configured()).quality, "medium");
      const c = await db.providerConfiguration.findUniqueOrThrow({
        where: { id: "global" },
      });
      const input = {
        provider: c.provider,
        imageModel: c.imageModel,
        creativeModel: c.creativeModel,
        creativeProvider: c.creativeProvider,
        quality: c.quality,
        resolution: c.resolution,
        monthlyLimitMicros: c.monthlyLimitMicros,
        dailyLimitMicros: c.dailyLimitMicros,
        operationLimitMicros: c.operationLimitMicros,
        imageReserveMicros: c.imageReserveMicros,
        maxGenerations: c.maxGenerations,
      };
      await saveAIConfiguration(
        actor,
        { ...input, alternatives: [], quality: "low" },
        true,
      );
      const saved = await configured();
      assert.equal(saved.quality, "low");
      assert.equal(saved.verifiedAt?.toISOString(), at.toISOString());
      assert.equal(saved.verifiedRevision, saved.revision);
      await assert.rejects(
        saveAIConfiguration(
          actor,
          { ...input, alternatives: [], imageModel: "invented-model" },
          true,
        ),
        /incompatibles/,
      );
      // A different creative provider has its own credential revision.
      const creative = {
        ...saved,
        creativeProvider: "google",
        creativeModel: "synthetic-text",
      };
      const source = {
        ...data,
        models: [
          {
            id: "synthetic-text",
            kind: "creative",
            qualities: [],
            resolutions: [],
          },
        ],
      };
      assert.equal(
        (
          await creativeConnection(creative, {
            providerConnection: { findUnique: async () => source } as any,
          })
        ).model.id,
        "synthetic-text",
      );
      await assert.rejects(
        creativeConnection(creative, {
          providerConnection: {
            findUnique: async () => ({ ...source, verifiedRevision: 6 }),
          } as any,
        }),
        /verifica/,
      );
      // A first configuration can reuse its verified connection without a query.
      const connection = {
        provider: "openai",
        encryptedKey: data.encryptedKey,
        models: data.models,
        status: "VERIFIED",
        revision: 7,
        verifiedRevision: 7,
        verifiedAt: at,
      };
      await db.providerConnection.upsert({
        where: { provider: "openai" },
        create: connection,
        update: connection,
      });
      await db.providerConfiguration.delete({ where: { id: "global" } });
      await saveAIConfiguration(actor, { ...input, alternatives: [] }, true);
      const first = await configured();
      assert.equal(first.revision, 1);
      assert.equal(first.verifiedRevision, 1);
      await saveAIConfiguration(
        actor,
        { ...input, alternatives: [], apiKey: "synthetic-new-key" },
        true,
      );
      assert.equal((await aiConfigurationView()).status, "UNVERIFIED");
      await assert.rejects(configured(), /verificar/);
    } finally {
      globalThis.fetch = oldFetch;
      await db.auditEvent.deleteMany({ where: { actorId: actor.id } });
      await db.user.delete({ where: { id: actor.id } });
      if (before)
        await db.providerConfiguration.upsert({
          where: { id: "global" },
          create: {
            ...before,
            models: before.models as any,
            alternatives: before.alternatives as any,
          },
          update: {
            ...before,
            models: before.models as any,
            alternatives: before.alternatives as any,
          },
        });
      else
        await db.providerConfiguration.deleteMany({ where: { id: "global" } });
      if (profile)
        await db.providerConnection.upsert({
          where: { provider: "openai" },
          create: { ...profile, models: profile.models as any },
          update: { ...profile, models: profile.models as any },
        });
      else
        await db.providerConnection.deleteMany({
          where: { provider: "openai" },
        });
      await db.$disconnect();
    }
  },
);
