import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test(
  "Compact reads preserve progress, gallery, financial facts and seven-day audit",
  { skip: process.env.RUN_PLATFORM_PERF_QA !== "1" },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const { db } = await import("../lib/db");
    const { withProgressState } = await import("../lib/meta-ads/progress-read");
    const { syncProgress } = await import("../lib/meta-ads/sync-progress");
    const { focusedReportDay } = await import("../lib/meta-ads/focused-labels");
    const { recentMetaDataVersions } =
      await import("../lib/meta-ads/data-versions");
    const { localDay, shiftDay } = await import("../lib/meta-ads/analytics");
    const { studioImages } = await import("../lib/creative-studio/service");
    const { listAuditThumbnails, cleanupAuditThumbnails } =
      await import("../lib/visual-audit");
    const { cleanupDerivedCaches } = await import("../lib/maintenance-cache");
    const tag = "perf-" + randomUUID(),
      now = new Date(),
      today = localDay("America/Lima"),
      yesterday = shiftDay(today, -1);
    const owner = await db.user.create({
      data: {
        email: tag + "@example.invalid",
        name: tag,
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    });
    const project = await db.project.create({
      data: { name: tag, ownerId: owner.id },
    });
    const category = await db.category.create({
      data: { projectId: project.id, name: tag },
    });
    const sub = await db.subproduct.create({
      data: { categoryId: category.id, name: tag },
    });
    const conn = await db.metaConnection.create({
      data: { ownerId: owner.id, name: tag, transport: "API" },
    });
    const connection = conn.id;
    const accountIds = Array.from({ length: 12 }, (_, i) => tag + "-" + i);
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = async () => {
      throw Error("No external network permitted in QA");
    };
    try {
      const states = accountIds.map((id, i) => ({
        id,
        connectionId: connection,
        name: tag,
        currency: "PEN",
        timezone: "America/Lima",
        enabled: true,
        syncedAt: now,
        nextSyncAt: now,
        syncState: {
          ...(i % 3 === 0 ? { phase: 3 } : i % 3 === 1 ? { phase: "3" } : {}),
          plan: "focus",
          recentReady: true,
          until: today,
          inventory: "all",
          pages: 13,
          processed: 92,
          historyTotal: 333,
          historyProcessed: 55,
          updatedAt: now.toISOString(),
          lastRun: {
            plan: "focus",
            inventory: "all",
            pages: 12,
            processed: 85,
            finishedAt: now.toISOString(),
            until: yesterday,
            privateQueue: "q".repeat(150000),
          },
          lastAttempt: { at: now.toISOString(), revision: 3 },
          privateQueue: "p".repeat(350000),
        },
      }));
      await db.metaAdAccount.createMany({ data: states });
      const start = performance.now();
      const full = await db.metaAdAccount.findMany({
        where: { id: { in: accountIds } },
        select: {
          id: true,
          enabled: true,
          syncedAt: true,
          nextSyncAt: true,
          syncError: true,
          syncState: true,
        },
      });
      const fullMs = performance.now() - start;
      const compactStart = performance.now();
      const compact = await withProgressState(
        full.map(({ syncState, ...row }) => row),
      );
      const compactMs = performance.now() - compactStart;
      for (const row of full) {
        const small = compact.find((r) => r.id === row.id)!;
        assert.deepEqual(
          syncProgress(small, now.valueOf()),
          syncProgress(row, now.valueOf()),
        );
        assert.equal(
          focusedReportDay(small.syncState),
          focusedReportDay(row.syncState),
        );
        assert.equal(JSON.stringify(small).includes("privateQueue"), false);
      }
      const fullBytes = Buffer.byteLength(JSON.stringify(full)),
        compactBytes = Buffer.byteLength(JSON.stringify(compact));
      assert.ok(compactBytes < fullBytes / 100);
      const accountId = accountIds[0];
      await db.$executeRaw`INSERT INTO "MetaAdObject" (id,"accountId",level,name,"seenAt") SELECT ${tag}||'-obj-'||n,${accountId},'campaign','QA',CURRENT_TIMESTAMP FROM generate_series(1,1500) n`;
      await db.$executeRaw`INSERT INTO "MetaAdDaily" (id,"accountId","objectId",day,scope,spend,impressions,clicks,actions,"updatedAt") SELECT o.id||'-'||n,${accountId},o.id,to_char(${today}::date-n,'YYYY-MM-DD'),'7d_click,1d_view|impression',1,1,0,'{}'::jsonb,${now}::timestamp-n*INTERVAL '1 hour' FROM "MetaAdObject" o CROSS JOIN generate_series(0,29) n WHERE o."accountId"=${accountId}`;
      const accounts = accountIds.map((id) => ({
        id,
        timezone: "America/Lima",
      }));
      const oldStart = performance.now();
      const old = await db.metaAdDaily.groupBy({
        by: ["accountId"],
        where: {
          accountId: { in: accountIds },
          scope: "7d_click,1d_view|impression",
          day: { in: [today, yesterday] },
        },
        _max: { updatedAt: true },
      });
      const oldMs = performance.now() - oldStart;
      const newStart = performance.now(),
        versions = await recentMetaDataVersions(accounts),
        newMs = performance.now() - newStart;
      assert.deepEqual(
        versions,
        new Map(old.map((r) => [r.accountId, r._max.updatedAt!.toISOString()])),
      );
      const plan =
        await db.$queryRaw`EXPLAIN (ANALYZE, FORMAT JSON) SELECT "updatedAt" FROM "MetaAdDaily" WHERE "accountId"=${accountId} AND scope='7d_click,1d_view|impression' AND day=${today} ORDER BY "updatedAt" DESC LIMIT 1`;
      assert.ok(
        JSON.stringify(plan).includes("MetaAdDaily_progress_latest_idx"),
      );
      // Original snapshot fields are not read into the API process; strict sample flags remain identical.
      const jobIds = Array.from({ length: 26 }, (_, i) => tag + "-job-" + i);
      await db.generationJob.createMany({
        data: jobIds.map((id, i) => ({
          id,
          actorId: owner.id,
          projectId: project.id,
          subproductId: sub.id,
          idempotencyKey: id,
          status: "COMPLETED",
          reservedMicros: 0n,
          snapshot: {
            previewFirst: i % 2 === 0 ? true : "true",
            index: i % 2 === 0 ? 0 : "0",
            prompt: "x".repeat(200000),
          },
        })),
      });
      await db.variation.createMany({
        data: jobIds.map((jobId, i) => ({
          id: tag + "-var-" + i,
          jobId,
          subproductId: sub.id,
          path: tag + ".png",
          model: "synthetic",
          permanent: true,
          createdAt: new Date(now.valueOf() + i),
          expiresAt: now,
        })),
      });
      const oldGallery = await db.variation.findMany({
        where: { id: { startsWith: tag + "-var-" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 24,
        include: { job: true },
      });
      const gallery = await studioImages(owner, sub.id);
      assert.deepEqual(
        gallery.items.map((r) => r.id),
        oldGallery.map((r) => r.id),
      );
      gallery.items.forEach((r, i) => {
        const s = oldGallery[i].job.snapshot as Record<string, unknown>;
        assert.equal(r.isSample, s.previewFirst === true && s.index === 0);
        assert.equal("snapshot" in r, false);
      });
      assert.ok((await studioImages(owner, sub.id, 2)).items.length >= 2);
      assert.equal(
        (
          await db.visualAuditPolicy.findUniqueOrThrow({
            where: { id: "global" },
          })
        ).retentionDays,
        7,
      );
      await db.auditThumbnail.createMany({
        data: [2, 8].map((age) => ({
          id: tag + "-audit-" + age,
          versionId: tag + age,
          variationId: tag + "-var-0",
          versionNumber: 1,
          actorId: owner.id,
          actorName: tag,
          projectId: project.id,
          projectName: tag,
          productName: tag,
          subproductName: tag,
          model: "synthetic",
          data: Buffer.from("synthetic"),
          size: 9,
          width: 1,
          height: 1,
          createdAt: new Date(now.valueOf() - age * 86400000),
          expiresAt: new Date(now.valueOf() + (7 - age) * 86400000),
        })),
      });
      await db.auditEvent.createMany({
        data: [2, 8].map((age) => ({
          id: tag + "-event-" + age,
          actorId: owner.id,
          action: "RECURSO_PROPIO_SUBIDO",
          detail: { file: tag, diploma: tag },
          createdAt: new Date(now.valueOf() - age * 86400000),
        })),
      });
      const audit = await listAuditThumbnails(
        owner,
        new URLSearchParams({ q: tag }),
      );
      assert.equal(audit.total, 1);
      assert.equal(audit.rows[0].id, tag + "-audit-2");
      assert.equal(audit.ownTotal, 1);
      assert.equal(audit.ownUploads[0].id, tag + "-event-2");
      await assert.rejects(() => listAuditThumbnails({ id: owner.id, role: "ADMIN" }, new URLSearchParams()));
      await cleanupAuditThumbnails(now);
      const expired = await db.auditThumbnail.findUniqueOrThrow({
        where: { id: tag + "-audit-8" },
      });
      assert.equal(expired.status, "EXPIRED");
      assert.equal(expired.data, null);
      assert.equal(expired.size, 0);
      assert.equal(await db.auditEvent.count({where:{actorId:owner.id}}),2);
      assert.ok(
        await db.variation.findUnique({ where: { id: tag + "-var-0" } }),
      );
      for (const [i, age] of [9, 1].entries()) {
        await db.metaInsightCache.create({
          data: {
            objectId: tag + "-obj-" + (i + 1),
            day: today,
            version: tag,
            rows: [],
            updatedAt: new Date(now.valueOf() - age * 86400000),
          },
        });
        await db.creativeMetaPageDirectory.create({
          data: {
            accountId: accountIds[i],
            connectionId: connection,
            credentialRevision: 1,
            pages: [],
            fetchedAt: new Date(now.valueOf() - age * 86400000),
          },
        });
      }
      await cleanupDerivedCaches(now);
      assert.equal(
        await db.metaInsightCache.count({
          where: { objectId: { startsWith: tag } },
        }),
        1,
      );
      assert.equal(
        await db.creativeMetaPageDirectory.count({
          where: { accountId: { in: accountIds } },
        }),
        1,
      );
      assert.equal(await db.metaAdDaily.count({ where: { accountId } }), 45000);
      assert.deepEqual(
        (await db.metaAdAccount.findUniqueOrThrow({ where: { id: accountId } }))
          .syncState,
        states[0].syncState,
      );
      console.log(
        JSON.stringify({
          progress: { fullBytes, compactBytes, fullMs, compactMs },
          daily: { rows: 45000, oldMs, newMs },
          gallery: { items: 24, snapshotBytesAvoided: 4800000 },
          audit: "7 days, expired bytes removed, originals retained",
          cache: "old removed, warm retained, financial facts unchanged",
        }),
      );
    } finally {
      globalThis.fetch = fetchBefore;
      await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
      await db.auditThumbnail.deleteMany({
        where: { id: { startsWith: tag } },
      });
      await db.variation.deleteMany({ where: { id: { startsWith: tag } } });
      await db.generationJob.deleteMany({ where: { id: { startsWith: tag } } });
      await db.metaAdAccount.deleteMany({ where: { id: { in: accountIds } } });
      await db.metaConnection.delete({ where: { id: connection } });
      await db.subproduct.delete({ where: { id: sub.id } });
      await db.category.delete({ where: { id: category.id } });
      await db.project.delete({ where: { id: project.id } });
      await db.user.delete({ where: { id: owner.id } });
      await db.$disconnect();
    }
  },
);
