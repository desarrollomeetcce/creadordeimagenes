import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import {
  workspaceAccess,
  changeWorkspaceAccounts,
  saveWorkspaceSharing,
  readWorkspaceSharing,
} from "../lib/meta-ads/workspace-access";
import { metaRoutes } from "../lib/meta-ads/routes";
import { syncStep, queueSync } from "../lib/meta-ads/service";
import { continueMetaSchedule } from "../lib/meta-ads/schedule";
import { syncProgress } from "../lib/meta-ads/sync-progress";
import { MetaReader } from "../lib/meta-ads/provider";
import { MetaGraphError } from "../lib/meta-ads/graph-error";

test("Cuentas compartidas: OWNER/EDIT/VIEW, cambios concurrentes y actualización sin perder avance", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const previousGrants = await db.metaWorkspaceGrant.findMany(),
    previousState = await db.metaWorkspaceSharing.findUnique({
      where: { id: "global" },
    }),
    tag = randomUUID();
  const users = await Promise.all(
    ["OWNER", "OWNER", "USER", "OBSERVER", "ADMIN"].map((role, i) =>
      db.user.create({
        data: {
          name: "QA compartidas " + tag,
          email: `shared-pins-${i}-${tag}@example.test`,
          role: role as any,
          status: "APPROVED",
          passwordHash: "synthetic",
        },
      }),
    ),
  );
  const [owner, otherOwner, editor, viewer, legacy] = users;
  const connection = await db.metaConnection.create({
      data: {
        name: "QA pins " + tag,
        ownerId: owner.id,
        transport: "API",
        verifiedAt: new Date(),
      },
    }),
    token = "synthetic-reader-" + tag;
  await db.metaConnection.update({
    where: { id: connection.id },
    data: { encryptedToken: encryptKey(token, `meta:${connection.id}`) },
  });
  const base =
      Date.now().toString() + String(Math.floor(Math.random() * 10000)),
    ids = ["1", "2", "3"].map((n) => base + n);
  await db.metaAdAccount.createMany({
    data: ids.map((id, i) => ({
      id,
      name: "QA compartida " + i + " " + tag,
      connectionId: connection.id,
      currency: "PEN",
      timezone: "America/Lima",
    })),
  });
  const call = (actor: any, path: string, method = "GET", body: unknown = {}) =>
    metaRoutes(
      new NextRequest("http://localhost/api/meta-ads/" + path, { method }),
      ["meta-ads", ...path.split("/")],
      actor,
      async () => body,
    );
  const denied = (p: Promise<unknown>) =>
    assert.rejects(p, (e: any) => e.status === 403);
  const get = MetaReader.prototype.get;
  let providerCalls = 0;
  try {
    await db.metaWorkspaceGrant.deleteMany({});
    await db.metaWorkspaceSharing.deleteMany({});
    await db.metaWorkspaceGrant.createMany({
      data: [
        { userId: editor.id, permission: "EDIT", grantedById: owner.id },
        { userId: viewer.id, permission: "VIEW", grantedById: owner.id },
      ],
    });
    await t.test(
      "Importación inicial una vez por lista: otro OWNER recibe lo mismo sin concesión; un navegador vacío no borra",
      async () => {
        await changeWorkspaceAccounts(owner, {
          kind: "PINNED",
          action: "INITIALIZE",
          accountIds: [ids[0]],
        });
        await changeWorkspaceAccounts(otherOwner, {
          kind: "PINNED",
          action: "INITIALIZE",
          accountIds: [ids[1]],
        });
        await changeWorkspaceAccounts(owner, {
          kind: "PRIMARY",
          action: "INITIALIZE",
          accountIds: [ids[1]],
        });
        for (const u of [owner, otherOwner, editor, viewer]) {
          const a = await workspaceAccess(u);
          assert.deepEqual(a.pinnedAccountIds, [ids[0]]);
          assert.deepEqual(a.primaryAccountIds, [ids[1]]);
          assert(a.pinsInitialized && a.primaryInitialized);
        }
        assert((await workspaceAccess(otherOwner)).canEdit);
        assert((await workspaceAccess(otherOwner)).canShare);
        assert(!(await workspaceAccess(viewer)).canEdit);
      },
    );
    await t.test(
      "Deltas concurrentes de dos editores conservan ambos cambios y listas independientes",
      async () => {
        await Promise.all([
          changeWorkspaceAccounts(owner, {
            kind: "PINNED",
            action: "ADD",
            accountIds: [ids[1]],
          }),
          changeWorkspaceAccounts(editor, {
            kind: "PINNED",
            action: "ADD",
            accountIds: [ids[2]],
          }),
        ]);
        assert.deepEqual(
          new Set((await workspaceAccess(viewer)).pinnedAccountIds),
          new Set(ids),
        );
        await Promise.all([
          changeWorkspaceAccounts(otherOwner, {
            kind: "PINNED",
            action: "REMOVE",
            accountIds: [ids[0]],
          }),
          changeWorkspaceAccounts(editor, {
            kind: "PRIMARY",
            action: "ADD",
            accountIds: [ids[2]],
          }),
        ]);
        const a = await workspaceAccess(owner);
        assert.deepEqual(new Set(a.pinnedAccountIds), new Set(ids.slice(1)));
        assert.deepEqual(new Set(a.primaryAccountIds), new Set(ids.slice(1)));
      },
    );
    await t.test(
      "VIEW y roles aparentes no modifican; API permite leer ambas listas sin exponer patrocinador",
      async () => {
        await denied(
          changeWorkspaceAccounts(
            { ...viewer, role: "OWNER" },
            { kind: "PINNED", action: "REMOVE", accountIds: [ids[1]] },
          ),
        );
        await denied(
          changeWorkspaceAccounts(legacy, {
            kind: "PRIMARY",
            action: "ADD",
            accountIds: [ids[0]],
          }),
        );
        const response = await call(viewer, "workspace-access");
        assert(response);
        const a = await response.json();
        assert.equal(a.permission, "VIEW");
        assert.equal(a.canEdit, false);
        assert.deepEqual(new Set(a.primaryAccountIds), new Set(ids.slice(1)));
        await denied(
          call(viewer, "workspace-accounts", "PATCH", {
            kind: "PRIMARY",
            action: "REMOVE",
            accountIds: [ids[1]],
          }),
        );
        const result = await call(editor, "workspace-accounts", "PATCH", {
          kind: "PINNED",
          action: "ADD",
          accountIds: [ids[0]],
        });
        assert(result);
        assert(!("sponsorId" in (await result.json())));
        await assert.rejects(() =>
          changeWorkspaceAccounts(editor, {
            kind: "PRIMARY",
            action: "ADD",
            accountIds: ["999999999999999999999999"],
          }),
        );
      },
    );
    await t.test(
      "Guardar Compartir con lista antigua no pisa fijadas nuevas ni principales; revocar se verifica de nuevo",
      async () => {
        const before = await workspaceAccess(owner);
        await saveWorkspaceSharing(owner, {
          revision: (await readWorkspaceSharing(owner)).revision,
          grants: [{ userId: viewer.id, permission: "VIEW" }],
          pinnedAccountIds: [ids[0]],
        });
        assert.deepEqual(
          (await workspaceAccess(viewer)).pinnedAccountIds,
          before.pinnedAccountIds,
        );
        assert.deepEqual(
          (await workspaceAccess(viewer)).primaryAccountIds,
          before.primaryAccountIds,
        );
        await denied(
          changeWorkspaceAccounts(
            { ...editor, role: "OWNER" },
            { kind: "PRIMARY", action: "REMOVE", accountIds: [ids[1]] },
          ),
        );
      },
    );
    await t.test(
      "Autorización vencida retira reintentos y trabajo antiguo, sin borrar datos ni volver a consultar Meta",
      async () => {
        const objectId = base + "9";
        await db.metaAdObject.create({
          data: {
            id: objectId,
            accountId: ids[0],
            level: "campaign",
            name: "Histórico conservado",
            status: "ACTIVE",
            effectiveStatus: "ACTIVE",
          },
        });
        await db.metaAdDaily.create({
          data: {
            accountId: ids[0],
            objectId,
            day: "2026-10-30",
            scope: "7d_click,1d_view|impression",
            spend: 12,
            impressions: 10,
            clicks: 1,
            actions: { lead: 2 },
          },
        });
        await db.metaAdAccount.update({
          where: { id: ids[0] },
          data: {
            enabled: true,
            nextSyncAt: new Date(),
            schedulerToken: "old-schedule",
            schedulerRunId: "synthetic-run",
            syncState: {
              phase: 0,
              plan: "activity",
              since: "2026-10-30",
              until: "2026-10-30",
            },
          },
        });
        MetaReader.prototype.get = async () => {
          providerCalls++;
          throw new MetaGraphError(
            401,
            {
              error: {
                code: 190,
                error_subcode: 463,
                message: "Session has expired " + token,
              },
            },
            token,
            { version: "v26.0", endpoint: "campaigns", fields: "id" },
          );
        };
        assert.equal(await syncStep(ids[0]), false);
        const a = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: ids[0] },
        });
        assert.equal(providerCalls, 1);
        assert.equal(a.nextSyncAt, null);
        assert.equal(a.schedulerToken, null);
        assert.equal(a.schedulerRunId, null);
        assert(a.enabled);
        assert(!a.syncError?.includes(token));
        assert(syncProgress(a).authorizationRequired);
        assert(syncProgress(a).label.includes("Reconectar"));
        assert.equal(
          await db.metaAdDaily.count({ where: { accountId: ids[0] } }),
          1,
        );
        assert.equal(await syncStep(ids[0]), false);
        assert.equal(providerCalls, 1);
        await assert.rejects(
          () => queueSync(owner, ids[0], false, 7, true, "all"),
          /Reconecta/,
        );
        assert.equal(providerCalls, 1);
      },
    );
    await t.test(
      "Pedir otra vez la misma actualización en proceso se une a la cola, sin reiniciar ni conflicto",
      async () => {
        await db.metaAdAccount.update({
          where: { id: ids[1] },
          data: {
            enabled: true,
            nextSyncAt: new Date(),
            syncToken: "live-page",
            syncLeaseAt: new Date(),
            schedulerToken: "live-schedule",
            syncState: {
              phase: 0,
              plan: "focus",
              inventory: "all",
              recentDays: 7,
              started: new Date().toISOString(),
            },
          },
        });
        const result = await queueSync(owner, ids[1], false, 7, true, "all");
        assert.equal(result.alreadyRunning, true);
        const a = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: ids[1] },
        });
        assert.equal(a.syncToken, "live-page");
        assert.equal(a.schedulerToken, "live-schedule");
        assert.equal((a.syncState as any).phase, 0);
        assert.equal(providerCalls, 1);
      },
    );
    await t.test(
      "Importaciones largas enlazan un nuevo ejecutor conservando cursor; fallo temporal reintenta sin competir con otro trabajo",
      async () => {
        await db.metaAdAccount.update({
          where: { id: ids[1] },
          data: {
            syncToken: null,
            syncLeaseAt: null,
            schedulerToken: "handoff-old",
            schedulerRunId: "old-run",
            syncState: { phase: 9, after: "saved-page" },
          },
        });
        let starts = 0;
        assert.equal(
          await continueMetaSchedule(ids[1], "handoff-old", async () => {
            starts++;
            return { scheduled: false };
          }),
          "wait",
        );
        assert.equal(
          (await db.metaAdAccount.findUniqueOrThrow({ where: { id: ids[1] } }))
            .schedulerToken,
          "handoff-old",
        );
        assert.equal(
          await continueMetaSchedule(ids[1], "handoff-old", async (id) => {
            starts++;
            await db.metaAdAccount.update({
              where: { id },
              data: {
                schedulerToken: "handoff-new",
                schedulerRunId: "new-run",
              },
            });
            return { scheduled: true };
          }),
          "done",
        );
        const after = await db.metaAdAccount.findUniqueOrThrow({
          where: { id: ids[1] },
        });
        assert.equal(after.schedulerToken, "handoff-new");
        assert.equal((after.syncState as any).after, "saved-page");
        assert.equal(
          await continueMetaSchedule(ids[1], "handoff-old", async () => {
            starts++;
            return { scheduled: true };
          }),
          "done",
        );
        assert.equal(starts, 2);
        assert.equal(providerCalls, 1);
      },
    );
    await t.test(
      "Ventas compartidas: inventario y país únicos, fecha independiente y datos ocultos conservados",
      async () => {
        await db.metaWorkspaceGrant.create({
          data: {
            userId: editor.id,
            permission: "EDIT",
            grantedById: owner.id,
          },
        });
        const { metaRegisteredSales } =
          await import("../lib/meta-ads/effectiveness");
        const { dashboard } = await import("../lib/meta-ads/dashboard");
        const inventory = await db.metaEffectivenessSheet.create({
          data: { kind: "INVENTORY", name: "Ventas QA " + tag },
        });
        const table = await db.metaAliasTable.create({
          data: {
            name: "Ventas QA " + tag,
            defaultCountry: "PE",
            defaultCurrency: "PEN",
          },
        });
        const alias = await db.metaAlias.create({
          data: {
            tableId: table.id,
            inventorySheetId: inventory.id,
            name: "Veterinaria QA " + tag,
          },
        });
        const campaignIds = ["70", "80", "90"].map((n) => base + n);
        try {
          await db.metaAdObject.createMany({
            data: campaignIds.map((id, i) => ({
              id,
              accountId: ids[0],
              level: "campaign",
              name: "Ventas QA " + i,
              aliasId: alias.id,
              aliasCountry: i === 2 ? "EC" : "PE",
              status: "ACTIVE",
            })),
          });
          await db.metaEffectivenessRow.create({
            data: {
              aliasId: alias.id,
              country: "PE",
              currency: "",
              displayCurrency: "PEN",
              hidden: true,
              days: {
                create: [
                  { day: "2026-10-29", sales: 3, salesOverridden: true },
                  { day: "2026-10-30", sales: 2, salesOverridden: true },
                ],
              },
            },
          });
          await db.metaEffectivenessRow.create({
            data: {
              aliasId: alias.id,
              country: "EC",
              currency: "",
              displayCurrency: "USD",
              days: {
                create: [
                  { day: "2026-10-30", sales: 4, salesOverridden: true },
                ],
              },
            },
          });
          const auto = await metaRegisteredSales(viewer, campaignIds);
          assert.equal(auto.total, 9);
          assert.equal(auto.since, "2026-10-29");
          assert.equal(auto.groups.length, 2);
          assert.equal(
            (await metaRegisteredSales(editor, campaignIds, "2026-10-30"))
              .total,
            6,
          );
          assert.equal(
            (await metaRegisteredSales(legacy, campaignIds)).total,
            null,
          );
          const result = await dashboard(
            viewer,
            new URLSearchParams({
              accounts: ids[0],
              level: "campaign",
              summary: "1",
              analysisPeriod: "custom",
              since: "2026-10-01",
              until: "2026-10-01",
              salesSince: "2026-10-30",
            }),
          );
          assert.equal(result.summary?.sales?.total, 6);
          assert.equal(
            (
              await db.metaEffectivenessDay.findMany({
                where: { row: { aliasId: alias.id } },
              })
            ).length,
            3,
          );
        } finally {
          await db.metaAdObject.deleteMany({
            where: { id: { in: campaignIds } },
          });
          await db.metaEffectivenessRow.deleteMany({
            where: { aliasId: alias.id },
          });
          await db.metaAlias.delete({ where: { id: alias.id } });
          await db.metaAliasTable.delete({ where: { id: table.id } });
          await db.metaEffectivenessSheet.delete({
            where: { id: inventory.id },
          });
        }
      },
    );
  } finally {
    MetaReader.prototype.get = get;
    await db.metaWorkspaceGrant.deleteMany({});
    if (previousGrants.length)
      await db.metaWorkspaceGrant.createMany({
        data: previousGrants.map((g) => ({
          ...g,
          pinnedAccountIds: Array.isArray(g.pinnedAccountIds)
            ? g.pinnedAccountIds
            : [],
        })),
      });
    await db.metaWorkspaceSharing.deleteMany({});
    if (previousState)
      await db.metaWorkspaceSharing.create({
        data: {
          ...previousState,
          pinnedAccountIds: previousState.pinnedAccountIds ?? Prisma.DbNull,
          primaryAccountIds: previousState.primaryAccountIds ?? Prisma.DbNull,
        },
      });
    await db.metaAdAccount.deleteMany({ where: { id: { in: ids } } });
    await db.metaConnection.delete({ where: { id: connection.id } });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: users.map((u) => u.id) } },
    });
    await db.rateLimit.deleteMany({
      where: { key: { in: users.map((u) => "meta:sync:" + u.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
});
