import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import {
  refreshSource,
  sourceStatus,
} from "../lib/meta-ads/recommendations/source";
import { deriveCoveredTotals } from "../lib/meta-ads/recommendations/derive-total";
import { campaignAnalysis } from "../lib/meta-ads/recommendations/service";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
import { metaQuotaScope } from "../lib/meta-ads/quota";
const exclusive = process.env.DATABASE_URL?.includes(
  "/library_organization_test?host=/workspace/work/pgdata",
);
test(
  "Recommendation source: bounded real-provider GET pipeline, lease, ownership, partial history, cursor resume and current facts",
  { skip: !exclusive },
  async () => {
    const owner = await db.user.findFirstOrThrow({
        where: { role: "OWNER", status: "APPROVED" },
      }),
      actor = { id: owner.id, role: "OWNER" };
    const token = "synthetic-recommendation-source-" + Date.now(),
      id = String(Date.now()),
      cid = id + "1",
      sid = id + "2",
      aid = id + "3",
      other = id + "8",
      today = localDay("America/Lima"),
      key = "onsite_conversion.messaging_conversation_started_7d";
    const viewer = await db.user.create({
      data: {
        email: `source-${id}@example.test`,
        name: "Source viewer",
        role: "USER",
        status: "APPROVED",
        passwordHash: "synthetic",
      },
    });
    const c = await db.metaConnection.create({
      data: {
        ownerId: owner.id,
        name: "Source fixture",
        transport: "API",
        verifiedAt: new Date(),
        encryptedToken: "pending",
      },
    });
    await db.metaConnection.update({
      where: { id: c.id },
      data: { encryptedToken: encryptKey(token, `meta:${c.id}`) },
    });
    await db.metaAdAccount.create({
      data: {
        id,
        connectionId: c.id,
        name: "Source fixture",
        currency: "PEN",
        timezone: "America/Lima",
        enabled: true,
        syncError: "Previous historical import did not finish",
      },
    });
    await db.metaAdObject.create({
      data: {
        id: cid,
        accountId: id,
        level: "campaign",
        name: "Fixture campaign",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
      },
    });
    await db.metaAccountGrant.create({
      data: { accountId: id, userId: viewer.id },
    });
    const original = globalThis.fetch,
      calls: { method: string; path: string; query: URLSearchParams }[] = [];
    let denyCampaign = false,
      failTotals = false,
      cursor = false;
    globalThis.fetch = async (input, init) => {
      const u = new URL(String(input));
      assert.equal(u.hostname, "graph.facebook.com");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer " + token,
      );
      assert.equal(init?.method ?? "GET", "GET");
      calls.push({
        method: init?.method ?? "GET",
        path: u.pathname,
        query: u.searchParams,
      });
      const base = {
        account_id: id,
        status: "ACTIVE",
        effective_status: "ACTIVE",
        created_time: shiftDay(today, -20) + "T08:00:00Z",
      };
      if (u.pathname.endsWith("/" + cid))
        return Response.json({ ...base, id: cid, name: "Current campaign" });
      if (u.pathname.endsWith("/" + cid + "/adsets"))
        return Response.json({
          data: [
            {
              ...base,
              id: sid,
              name: "Current set",
              campaign_id: denyCampaign ? other : cid,
              optimization_goal: "CONVERSATIONS",
            },
          ],
        });
      if (u.pathname.endsWith("/" + cid + "/ads"))
        return Response.json({
          data: [
            {
              ...base,
              id: aid,
              name: "Current ad",
              campaign_id: cid,
              adset_id: sid,
              creative: {
                thumbnail_url: "https://scontent.fbcdn.net/test.jpg",
              },
            },
          ],
        });
      assert(u.pathname.endsWith("/act_" + id + "/insights"));
      assert.deepEqual(JSON.parse(u.searchParams.get("filtering")!), [
        { field: "ad.id", operator: "IN", value: [aid] },
      ]);
      assert.equal(u.searchParams.get("level"), "ad");
      const insight = {
        account_id: id,
        campaign_id: cid,
        adset_id: sid,
        ad_id: aid,
        spend: "12",
        impressions: "100",
        clicks: "10",
        actions: [{ action_type: key, value: "10" }],
      };
      if (u.searchParams.get("time_increment") === "1") {
        assert.equal(
          JSON.parse(u.searchParams.get("time_range")!).since,
          shiftDay(today, -29),
        );
        if (cursor && !u.searchParams.get("after"))
          return Response.json({
            data: [
              {
                ...insight,
                date_start: shiftDay(today, -1),
                date_stop: shiftDay(today, -1),
              },
            ],
            paging: { next: "opaque", cursors: { after: "next-daily-page" } },
          });
        return Response.json({
          data: [{ ...insight, date_start: today, date_stop: today }],
        });
      }
      assert.equal(u.searchParams.get("date_preset"), "maximum");
      if (failTotals)
        return Response.json(
          {
            error: {
              code: 2,
              message: "Synthetic historical report unavailable",
            },
          },
          { status: 503 },
        );
      return Response.json({
        data: [
          {
            ...insight,
            date_start: shiftDay(today, -20),
            date_stop: today,
            spend: "120",
            actions: [{ action_type: key, value: "100" }],
          },
        ],
      });
    };
    const quota = metaQuotaScope(c, token);
    const step = async (action: "start" | "continue") => {
      await db.metaApiQuota.updateMany({
        where: { scope: quota },
        data: { nextReadAt: new Date(0), blockedUntil: null },
      });
      return refreshSource(actor, cid, action);
    };
    try {
      await assert.rejects(
        () => refreshSource({ id: viewer.id, role: "USER" }, cid, "start"),
        /permiso/i,
      );
      assert.equal(calls.length, 0);
      assert.equal(await sourceStatus(actor, cid), null);
      assert.equal(calls.length, 0);
      let p = await step("start");
      assert.equal("phase" in p && p.phase, 1);
      assert.equal(calls.length, 1);
      denyCampaign = true;
      await assert.rejects(() => step("continue"), /ajeno/);
      assert.equal((await sourceStatus(actor, cid))!.phase, 1);
      assert.equal(await db.metaAdObject.count({ where: { id: sid } }), 0);
      denyCampaign = false;
      p = await step("continue");
      assert.equal("phase" in p && p.phase, 2);
      p = await step("continue");
      assert.equal("phase" in p && p.phase, 3);
      cursor = true;
      p = await step("continue");
      assert.equal("phase" in p && p.phase, 3);
      assert.equal("pages" in p && p.pages, 4);
      p = await step("continue");
      assert.equal("phase" in p && p.phase, 4);
      assert.ok("dailyAt" in p && p.dailyAt);
      failTotals = true;
      await assert.rejects(() => step("continue"), /Meta|hist/);
      const partial: any = await campaignAnalysis(actor, cid, false, "day");
      assert.equal(partial.coverage, true);
      assert.equal(partial.fresh, true);
      assert.equal(partial.analysis.adsets[0].ads[0].today.cost, 1.2);
      assert.equal(partial.analysis.adsets[0].ads[0].action, "MANTENER");
      assert.equal(partial.dataOrigin.missingTotals, 1);
      assert.equal(partial.items[0].periods.lifetime.state, "UNAVAILABLE");
      failTotals = false;
      p = await step("continue");
      assert.equal(p.done, true);
      const result: any = await campaignAnalysis(actor, cid, true, "night");
      assert.equal(result.analysis.adsets[0].ads[0].periods.lifetime.cost, 1.2);
      assert.equal(result.dataOrigin.missingTotals, 0);
      assert.equal(
        result.items[0].thumbnailUrl,
        "https://scontent.fbcdn.net/test.jpg",
      );
      const young = aid + "1",
        old = aid + "2",
        weighted = aid + "3";
      await db.metaAdObject.createMany({
        data: [
          {
            id: young,
            accountId: id,
            campaignId: cid,
            adsetId: sid,
            level: "ad",
            name: "Young, no delivery",
            createdTime: new Date(shiftDay(today, -5) + "T12:00:00Z"),
          },
          {
            id: old,
            accountId: id,
            campaignId: cid,
            adsetId: sid,
            level: "ad",
            name: "Old, unknown lifetime",
            createdTime: new Date(shiftDay(today, -100) + "T12:00:00Z"),
          },
          {
            id: weighted,
            accountId: id,
            campaignId: cid,
            adsetId: sid,
            level: "ad",
            name: "Young, real daily facts",
            createdTime: new Date(shiftDay(today, -5) + "T12:00:00Z"),
          },
        ],
      });
      await db.metaAdDaily.createMany({
        data: [
          {
            objectId: weighted,
            accountId: id,
            scope: "7d_click,1d_view|impression",
            day: today,
            spend: 5,
            actions: { [key]: 10, lead: 2 },
          },
          {
            objectId: weighted,
            accountId: id,
            scope: "7d_click,1d_view|impression",
            day: shiftDay(today, -1),
            spend: 10,
            actions: { [key]: 1, lead: 3 },
          },
        ],
      });
      await db.$transaction((tx) =>
        deriveCoveredTotals(
          tx,
          { id, timezone: "America/Lima" },
          {
            since: shiftDay(today, -29),
            until: today,
            started: new Date().toISOString(),
            adIds: [young, old, weighted],
          },
        ),
      );
      const zero = await db.metaAdTotal.findUniqueOrThrow({
        where: { objectId: young },
      });
      assert.equal(Number(zero.spend), 0);
      assert.equal(
        await db.metaAdTotal.findUnique({ where: { objectId: old } }),
        null,
      );
      const exact = await db.metaAdTotal.findUniqueOrThrow({
        where: { objectId: weighted },
      });
      assert.equal(Number(exact.spend), 15);
      assert.equal((exact.actions as Record<string, number>)[key], 11);
      assert.equal((exact.actions as Record<string, number>).lead, 5);
      const persisted = await db.metaAdAccount.findUniqueOrThrow({
        where: { id },
      });
      assert.equal(persisted.syncedAt, null);
      assert.equal(
        persisted.syncError,
        "Previous historical import did not finish",
      );
      assert.equal(persisted.syncToken, null); // no false account-wide completion
      await db.metaAdAccount.update({
        where: { id },
        data: { syncToken: "another-executor", syncLeaseAt: new Date() },
      });
      const count = calls.length;
      const waiting = await step("start");
      assert.equal("waiting" in waiting && waiting.waiting, true);
      assert.equal(calls.length, count);
      await db.metaAdAccount.update({
        where: { id },
        data: { syncToken: null, syncLeaseAt: null },
      });
      await db.metaConnection.update({
        where: { id: c.id },
        data: { revision: { increment: 1 }, verifiedAt: null },
      });
      assert.equal(await sourceStatus(actor, cid), null);
      await assert.rejects(() => step("start"), /conexión|Verifica/);
      assert(calls.every((c) => c.method === "GET"));
    } finally {
      globalThis.fetch = original;
      await db.metaRecommendationAnalysis.deleteMany({
        where: { campaignId: cid },
      });
      await db.metaRecommendationSource.deleteMany({
        where: { campaignId: cid },
      });
      await db.metaAdAccount.delete({ where: { id } });
      await db.metaConnection.delete({ where: { id: c.id } });
      await db.metaApiQuota.deleteMany({ where: { scope: quota } });
      await db.user.delete({ where: { id: viewer.id } });
    }
  },
);
