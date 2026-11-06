import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { dashboard } from "../lib/meta-ads/dashboard";
import { linkedCampaignCountryCounts } from "../lib/meta-ads/linked-campaign-counts";

test("Country counters include only real active linked campaigns, across scoped accounts and outside pagination", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    base = String(Date.now()) + "654",
    accountId = base + "0",
    secondId = base + "1";
  const owner = await db.user.create({
    data: {
      name: "QA country " + tag,
      email: tag + "@example.test",
      passwordHash: "synthetic",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const viewer = await db.user.create({
    data: {
      name: "QA country viewer " + tag,
      email: "viewer" + tag + "@example.test",
      passwordHash: "synthetic",
      role: "OBSERVER",
      status: "APPROVED",
    },
  });
  const connection = await db.metaConnection.create({
    data: {
      ownerId: owner.id,
      name: "QA country " + tag,
      transport: "API",
      encryptedToken: "synthetic-never-read",
      verifiedAt: new Date(),
    },
  });
  await db.metaAdAccount.createMany({
    data: [accountId, secondId].map((id) => ({
      id,
      connectionId: connection.id,
      name: "QA " + id,
      currency: "PEN",
      timezone: "America/Lima",
    })),
  });
  await db.metaAccountGrant.create({ data: { userId: viewer.id, accountId } });
  const list = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "QA country " + tag },
    }),
    archived = await db.metaEffectivenessSheet.create({
      data: {
        kind: "INVENTORY",
        name: "QA archived " + tag,
        archivedAt: new Date(),
      },
    });
  const table = await db.metaAliasTable.create({
    data: { name: "QA country " + tag, defaultCountry: "PE" },
  });
  const alias = await db.metaAlias.create({
      data: {
        tableId: table.id,
        inventorySheetId: list.id,
        name: "QA diploma " + tag,
      },
    }),
    old = await db.metaAlias.create({
      data: {
        tableId: table.id,
        inventorySheetId: archived.id,
        name: "QA archived diploma " + tag,
      },
    });
  await db.metaEffectivenessSheet.update({
    where: { id: list.id },
    data: {
      config: {
        inventoryActivation: {
          rows: { [alias.id + "|PE"]: { pinned: false, campaignTask: "STOP" } },
        },
      },
    },
  });
  const ref = (
    suffix: string,
    country: string | null,
    status: string | null = "ACTIVE",
    level = "campaign",
    linked: string | null = alias.id,
    account = accountId,
  ) => ({
    id: base + suffix,
    accountId: account,
    name: "Perú no determina país " + suffix,
    level,
    status,
    effectiveStatus: "ACTIVE",
    aliasId: linked,
    aliasCountry: country,
  });
  await db.metaAdObject.createMany({
    data: [
      ref("10", "PE"),
      ref("11", "PE"),
      ref("12", "UY"),
      ref("13", "PY", "PAUSED"),
      ref("14", "PE", "ACTIVE", "campaign", null),
      ref("15", null),
      ref("16", "ZZ"),
      ref("17", "PE", "ACTIVE", "ad"),
      ref("18", "PE", "ACTIVE", "adset"),
      ref("19", "PE", null),
      ref("20", "PE", "ACTIVE", "campaign", old.id),
      ref("21", "PE", "ACTIVE", "campaign", alias.id, secondId),
    ],
  });
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("No external calls in country counter QA");
  };
  try {
    assert.deepEqual(await linkedCampaignCountryCounts([accountId]), [
      { country: "PE", active: 2 },
      { country: "UY", active: 1 },
    ]);
    assert.deepEqual(await linkedCampaignCountryCounts([accountId, secondId]), [
      { country: "PE", active: 3 },
      { country: "UY", active: 1 },
    ]);
    assert.deepEqual(await linkedCampaignCountryCounts([]), []);
    const single = await dashboard(
      owner,
      new URLSearchParams({
        accounts: accountId,
        level: "campaign",
        limit: "1",
      }),
    );
    assert.equal(single.items.length, 1);
    assert.deepEqual(single.linkedCampaignCountries, [
      { country: "PE", active: 2 },
      { country: "UY", active: 1 },
    ]);
    const empty = await dashboard(
      owner,
      new URLSearchParams({
        accounts: accountId,
        level: "ad",
        q: "no match " + tag,
        state: "paused",
      }),
    );
    assert.equal(empty.items.length, 0);
    assert.deepEqual(
      empty.linkedCampaignCountries,
      single.linkedCampaignCountries,
    );
    const authorized = await dashboard(
      viewer,
      new URLSearchParams({ accounts: accountId, level: "campaign" }),
    );
    assert.deepEqual(
      authorized.linkedCampaignCountries,
      single.linkedCampaignCountries,
    );
    await assert.rejects(
      () =>
        dashboard(
          viewer,
          new URLSearchParams({ accounts: secondId, level: "campaign" }),
        ),
      /autorizadas/,
    );
    await db.metaAdObject.update({
      where: { id: base + "10" },
      data: { status: "PAUSED" },
    });
    assert.deepEqual(await linkedCampaignCountryCounts([accountId]), [
      { country: "PE", active: 1 },
      { country: "UY", active: 1 },
    ]);
    await db.metaAdObject.update({
      where: { id: base + "11" },
      data: { status: "PAUSED" },
    });
    assert.deepEqual(await linkedCampaignCountryCounts([accountId]), [
      { country: "UY", active: 1 },
    ]);
  } finally {
    globalThis.fetch = fetch;
    await db.metaAdObject.deleteMany({
      where: { accountId: { in: [accountId, secondId] } },
    });
    await db.metaAdAccount.deleteMany({
      where: { id: { in: [accountId, secondId] } },
    });
    await db.metaConnection.delete({ where: { id: connection.id } });
    await db.metaAlias.deleteMany({ where: { tableId: table.id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [list.id, archived.id] } },
    });
    await db.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
    await db.$disconnect();
  }
});
