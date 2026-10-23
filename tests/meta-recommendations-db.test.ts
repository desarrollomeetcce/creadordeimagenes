import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import { metaRoutes } from "../lib/meta-ads/routes";
import { NextRequest } from "next/server";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
import { defaultRules } from "../lib/meta-ads/recommendations/engine";
const exclusive = process.env.DATABASE_URL?.includes(
  "/library_organization_test?host=/workspace/work/pgdata",
);
test(
  "Meta recommendations: local DB, complete child hierarchy, cache invalidation, per-account permissions and explicit rule configuration",
  { skip: !exclusive },
  async () => {
    const owner = await db.user.findFirstOrThrow({
        where: { role: "OWNER", status: "APPROVED" },
      }),
      actor = { id: owner.id, role: "OWNER" };
    const viewer = await db.user.create({
      data: {
        email: `recommend-${Date.now()}@example.test`,
        name: "Rules viewer",
        role: "USER",
        status: "APPROVED",
        passwordHash: "synthetic",
      },
    });
    const c = await db.metaConnection.create({
      data: {
        name: "Recommendation synthetic",
        ownerId: owner.id,
        transport: "API",
        verifiedAt: new Date(),
      },
    });
    const id = String(Date.now()),
      cid = id + "1",
      sid = id + "2",
      aid = id + "3",
      pausedId = id + "4",
      other = id + "9",
      foreignCampaign = other + "1",
      today = localDay("America/Lima"),
      now = new Date();
    const savedRules = await db.metaRecommendationRules.findUnique({
      where: { currency: "PEN" },
    });
    const originalFetch = globalThis.fetch;
    let external = 0;
    globalThis.fetch = async () => {
      external++;
      throw Error("No external calls permitted in recommendation analysis");
    };
    const call = async (
      path: string,
      params = "",
      who = actor,
      method = "GET",
      value: unknown = {},
    ) => {
      const response = await metaRoutes(
        new NextRequest(
          `http://localhost:3074/api/meta-ads/${path}${params ? "?" + params : ""}`,
          { method },
        ),
        ["meta-ads", ...path.split("/")],
        who,
        async () => value,
      );
      return response!.json();
    };
    try {
      await db.metaRecommendationRules.deleteMany({
        where: { currency: "PEN" },
      });
      for (const accountId of [id, other])
        await db.metaAdAccount.create({
          data: {
            id: accountId,
            connectionId: c.id,
            name: accountId === id ? "Rules Tania" : "Private account",
            currency: accountId === id ? "PEN" : "USD",
            timezone: "America/Lima",
            enabled: true,
            syncedAt: now,
            selectionSince: new Date(now.valueOf() - 3600000),
            syncState: {
              lastRun: {
                plan: "focus",
                inventory: "all",
                until: today,
                lastReportUntil: today,
                recentReady: true,
                finishedAt: now.toISOString(),
              },
            },
          },
        });
      await db.metaAdObject.createMany({
        data: [
          {
            id: cid,
            accountId: id,
            level: "campaign",
            name: "Main campaign",
            selectedAt: now,
            status: "ACTIVE",
            effectiveStatus: "ACTIVE",
          },
          {
            id: sid,
            accountId: id,
            campaignId: cid,
            level: "adset",
            name: "Main set",
            selectedAt: now,
            status: "ACTIVE",
            effectiveStatus: "ACTIVE",
          },
          {
            id: aid,
            accountId: id,
            campaignId: cid,
            adsetId: sid,
            level: "ad",
            name: "Stable 1.20",
            status: "ACTIVE",
            effectiveStatus: "ACTIVE",
            createdTime: new Date(now.valueOf() - 45 * 86400000),
            selectedAt: now,
          },
          {
            id: pausedId,
            accountId: id,
            campaignId: cid,
            adsetId: sid,
            level: "ad",
            name: "New paused",
            status: "PAUSED",
            effectiveStatus: "PAUSED",
            createdTime: new Date(now.valueOf() - 3600000),
            selectedAt: now,
          },
          {
            id: foreignCampaign,
            accountId: other,
            level: "campaign",
            name: "Private campaign",
            status: "ACTIVE",
            effectiveStatus: "ACTIVE",
          },
        ],
      });
      const key = "onsite_conversion.messaging_conversation_started_7d";
      await db.metaAdDaily.createMany({
        data: Array.from({ length: 15 }, (_, i) => ({
          objectId: aid,
          accountId: id,
          day: shiftDay(today, -i),
          scope: "7d_click,1d_view|impression",
          spend: 12,
          actions: { [key]: 10, omni_purchase: 9000 },
        })),
      });
      await db.metaAdDaily.create({
        data: {
          objectId: aid,
          accountId: id,
          day: today,
          scope: "other-attribution",
          spend: 9000,
          actions: { [key]: 1 },
        },
      });
      await db.metaAdTotal.create({
        data: {
          objectId: aid,
          accountId: id,
          since: shiftDay(today, -45),
          until: today,
          scope: "7d_click,1d_view|impression",
          spend: 180,
          actions: { [key]: 150 },
        },
      });
      await db.metaAccountGrant.create({
        data: { accountId: id, userId: viewer.id },
      });
      const user = { id: viewer.id, role: "USER" };
      const list = await call("recommendations", `accounts=${id}`, user);
      assert.equal(list.total, 1);
      assert.equal(list.items[0].id, cid);
      await assert.rejects(
        () => call("recommendations", `accounts=${other}`, user),
        /no autorizada/i,
      );
      await assert.rejects(
        () => call(`recommendations/${foreignCampaign}`, "", user),
        /no disponible/i,
      );
      const first = await call(`recommendations/${cid}`, "", user);
      assert.equal(first.cached, false);
      assert.equal(
        first.items.find((o: any) => o.id === aid).rating,
        "ENOUGH_DATA",
      );
      assert.equal(first.coverage, true);
      assert.equal(first.fresh, true);
      assert.equal(first.analysis.counts.total, 2);
      assert.equal(first.analysis.counts.new, 1);
      assert.equal(
        first.analysis.adsets[0].ads.find((d: any) => d.id === aid).today.cost,
        1.2,
      );
      assert.equal(
        first.analysis.adsets[0].ads.find((d: any) => d.id === aid).today
          .results,
        10,
      );
      assert.equal(
        first.analysis.adsets[0].ads.find((d: any) => d.id === pausedId).action,
        "PROBAR",
      );
      assert.ok(
        first.analysis.adsets[0].ads.find((d: any) => d.id === aid).forecast,
      );
      assert.ok(!JSON.stringify(first).includes("encryptedToken"));
      assert.ok(!JSON.stringify(first).includes("ownerId"));
      assert.equal(
        await db.metaRecommendationAnalysis.count({
          where: { campaignId: cid },
        }),
        1,
      );
      const cached = await call(`recommendations/${cid}`, "", user);
      assert.equal(cached.cached, true);
      assert.equal(cached.canReadFromMeta, false);
      const ownerCached = await call(`recommendations/${cid}`);
      assert.equal(ownerCached.cached, true);
      assert.equal(ownerCached.canReadFromMeta, true);
      const daytime = await call(`recommendations/${cid}`, "mode=day", user);
      assert.equal(daytime.analysis.mode, "day");
      assert.equal(
        await db.metaRecommendationAnalysis.count({
          where: { campaignId: cid },
        }),
        2,
      );
      await db.metaAdDaily.update({
        where: {
          objectId_day_scope: {
            objectId: aid,
            day: today,
            scope: "7d_click,1d_view|impression",
          },
        },
        data: { spend: 20 },
      });
      const changed = await call(`recommendations/${cid}`, "mode=day", user);
      assert.equal(changed.cached, false);
      assert.equal(
        changed.analysis.adsets[0].ads.find((d: any) => d.id === aid)
          .proposedStatus,
        "PAUSED",
      );
      const rules = await call("recommendations/rules", "", user);
      assert.equal(rules.currencies.length, 1);
      assert.equal(rules.currencies[0].currency, "PEN");
      await assert.rejects(
        () => call("recommendations/rules", "", user, "PUT", defaultRules),
        /propietario|OWNER|permiso/i,
      );
      await assert.rejects(
        () =>
          call("recommendations/rules", "", actor, "PUT", {
            ...defaultRules,
            contextCost: 8,
          }),
        /bandas|ventanas/i,
      );
      await call("recommendations/rules", "", actor, "PUT", {
        ...defaultRules,
        dayMaxCost: 3,
      });
      const updated = await call(`recommendations/${cid}`, "mode=day", user);
      assert.equal(updated.cached, false);
      assert.equal(
        updated.analysis.adsets[0].ads.find((d: any) => d.id === aid).action,
        "MANTENER",
      );
      // A status/name change invalidates an existing analysis, independently of daily fact updates.
      await db.metaAdObject.update({
        where: { id: aid },
        data: { name: "Renamed", status: "PAUSED", effectiveStatus: "PAUSED" },
      });
      const renamed = await call(`recommendations/${cid}`, "", user);
      assert.equal(renamed.cached, false);
      assert.equal(
        renamed.items.find((o: any) => o.id === aid).name,
        "Renamed",
      );
      await db.metaAdAccount.update({
        where: { id },
        data: { syncError: "Synthetic partial import" },
      });
      const partial = await call(`recommendations/${cid}`, "", user);
      assert.equal(partial.analysis.status, "REVISAR DATOS");
      assert.ok(
        partial.analysis.adsets
          .flatMap((s: any) => s.ads)
          .every((d: any) => d.proposedStatus === null),
      );
      await db.metaAccountGrant.deleteMany({
        where: { accountId: id, userId: viewer.id },
      });
      await assert.rejects(
        () => call(`recommendations/${cid}`, "", user),
        /no disponible/i,
      ); // cached output never bypasses revoked access
      const foreign = await call(
        `recommendations/${foreignCampaign}`,
        "",
        actor,
      );
      assert.equal(foreign.rules, null);
      assert.equal(foreign.analysis.status, "REVISAR DATOS");
      assert.equal(external, 0);
    } finally {
      globalThis.fetch = originalFetch;
      await db.metaRecommendationAnalysis.deleteMany({
        where: { campaignId: { in: [cid, foreignCampaign] } },
      });
      await db.metaRecommendationRules.deleteMany({
        where: { currency: "PEN" },
      });
      if (savedRules)
        await db.metaRecommendationRules.create({
          data: {
            ...savedRules,
            values: JSON.parse(JSON.stringify(savedRules.values)),
          },
        });
      await db.metaAdAccount.deleteMany({ where: { connectionId: c.id } });
      await db.metaConnection.delete({ where: { id: c.id } });
      await db.user.delete({ where: { id: viewer.id } });
    }
  },
);
