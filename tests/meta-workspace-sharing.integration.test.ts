import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import {
  workspaceAccess,
  saveWorkspaceSharing,
  readWorkspaceSharing,
} from "../lib/meta-ads/workspace-access";
import { access } from "../lib/meta-ads/service";
import { metaRoutes } from "../lib/meta-ads/routes";
import { setMetaStatus } from "../lib/meta-ads/manage";
import { MetaReader } from "../lib/meta-ads/provider";

test("Compartir Meta Ads separa visualizar/editar de los roles generales", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const previous = await db.metaWorkspaceGrant.findMany(),
    state = await db.metaWorkspaceSharing.findUnique({
      where: { id: "global" },
    }),
    tag = randomUUID(),
    passwordHash = await argon2.hash("Compartir-prueba-0123456789");
  const users = await Promise.all(
    (["OWNER", "ADMIN", "USER", "OBSERVER"] as const).map((role) =>
      db.user.create({
        data: {
          role,
          status: "APPROVED",
          name: "QA compartir " + tag,
          email: `sharing-${role.toLowerCase()}-${tag}@example.test`,
          passwordHash,
        },
      }),
    ),
  );
  const [owner, admin, editor, viewer] = users,
    ids = users.map((u) => u.id),
    base =
      Date.now().toString() + Math.floor(Math.random() * 100000).toString(),
    accountId = base + "1",
    objectId = base + "2";
  const connection = await db.metaConnection.create({
    data: {
      ownerId: owner.id,
      name: "QA compartir " + tag,
      transport: "API",
      encryptedToken: encryptKey(
        "synthetic-meta-token-0000000000",
        `meta:pending`,
      ),
      verifiedAt: new Date(),
    },
  });
  await db.metaConnection.update({
    where: { id: connection.id },
    data: {
      encryptedToken: encryptKey(
        "synthetic-meta-token-0000000000",
        `meta:${connection.id}`,
      ),
    },
  });
  await db.metaAdAccount.create({
    data: {
      id: accountId,
      name: "QA cuenta " + tag,
      connectionId: connection.id,
      currency: "PEN",
      timezone: "America/Lima",
      enabled: true,
    },
  });
  await db.metaAdObject.create({
    data: {
      id: objectId,
      accountId,
      name: "QA campaña " + tag,
      level: "campaign",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
    },
  });
  await db.metaAccountGrant.create({
    data: { accountId, userId: admin.id, canSync: true },
  });
  const call = (
    actor: { id: string; role: string },
    path: string,
    method = "GET",
    data: unknown = {},
  ) =>
    metaRoutes(
      new NextRequest("http://localhost/api/meta-ads/" + path, { method }),
      ["meta-ads", ...path.split("/")],
      actor,
      async () => data,
    );
  const share = async (
    grants: { userId: string; permission: "VIEW" | "EDIT" }[],
  ) =>
    saveWorkspaceSharing(owner, {
      revision: (await readWorkspaceSharing(owner)).revision,
      grants,
      pinnedAccountIds: [accountId],
    });
  const failures = (p: Promise<unknown>, status: number) =>
    assert.rejects(p, (e: any) => e.status === status);
  const get = MetaReader.prototype.get,
    set = MetaReader.prototype.setStatus;
  let writes = 0,
    revoke = false;
  MetaReader.prototype.get = async function () {
    if (revoke) {
      revoke = false;
      await share([{ userId: viewer.id, permission: "VIEW" }]);
    }
    return {
      data: [{ id: objectId, account_id: accountId, status: "ACTIVE" }],
    };
  };
  MetaReader.prototype.setStatus = async function () {
    writes++;
    return { success: true };
  };
  try {
    await t.test(
      "Solo OWNER comparte; no cambia roles ni permite duplicados, cuentas no habilitadas o revisión antigua",
      async () => {
        await failures(readWorkspaceSharing(editor), 403);
        await failures(
          saveWorkspaceSharing(admin, {
            revision: 0,
            grants: [],
            pinnedAccountIds: [],
          }),
          403,
        );
        const revision = (await readWorkspaceSharing(owner)).revision;
        await assert.rejects(
          saveWorkspaceSharing(owner, {
            revision,
            grants: [
              { userId: viewer.id, permission: "VIEW" },
              { userId: viewer.id, permission: "EDIT" },
            ],
            pinnedAccountIds: [],
          }),
        );
        await share([
          { userId: editor.id, permission: "EDIT" },
          { userId: viewer.id, permission: "VIEW" },
        ]);
        await failures(
          saveWorkspaceSharing(owner, {
            revision,
            grants: [],
            pinnedAccountIds: [],
          }),
          409,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: editor.id } })).role,
          "USER",
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: viewer.id } })).role,
          "OBSERVER",
        );
        await failures(share([{ userId: owner.id, permission: "EDIT" }]), 409);
      },
    );
    await t.test(
      "Puede ver lee todas las cuentas y las fijadas sin secretos; bloquea configuración y cualquier mutación",
      async () => {
        const a = await workspaceAccess(viewer);
        assert(!a.canEdit);
        assert.deepEqual(a.pinnedAccountIds, [accountId]);
        assert((await access(viewer, accountId)).id === accountId);
        const rows = await (await call(viewer, "accounts")).json();
        const row = rows.find((a: any) => a.id === accountId);
        assert.equal(row.canSync, false);
        assert.equal(row.sources, undefined);
        assert(!JSON.stringify(row).includes("encryptedToken"));
        for (const [path, method] of [
          ["connections", "GET"],
          ["marketing-oauth-config", "GET"],
          ["sharing", "GET"],
          [`accounts/${accountId}`, "PATCH"],
          [`accounts/${accountId}/sync`, "POST"],
          [`objects/${objectId}/status`, "POST"],
        ])
          await failures(call(viewer, path, method), 403);
      },
    );
    await t.test(
      "Puede editar habilita conexiones, configuración y acciones sin convertirse en OWNER",
      async () => {
        assert((await workspaceAccess(editor)).canEdit);
        await access(editor, accountId, true);
        assert.equal((await call(editor, "connections")).status, 200);
        const response = await call(editor, "connections", "POST", {
          name: "QA nueva conexión " + tag,
          transport: "API",
        });
        assert.equal(response.status, 201);
        const created = await response.json();
        assert.equal(
          (
            await db.metaConnection.findUniqueOrThrow({
              where: { id: created.id },
            })
          ).ownerId,
          owner.id,
        );
        await db.metaConnection.delete({ where: { id: created.id } });
        assert.equal(
          (
            await call(editor, `accounts/${accountId}`, "PATCH", {
              targetCost: 2,
            })
          ).status,
          200,
        );
        await setMetaStatus(editor, objectId, "PAUSED", "ACTIVE");
        assert.equal(writes, 1);
        assert.equal(
          (await db.metaAdObject.findUniqueOrThrow({ where: { id: objectId } }))
            .status,
          "PAUSED",
        );
        await failures(call(editor, "sharing"), 403);
      },
    );
    await t.test(
      "Revocar entre lectura y escritura impide cambios publicitarios; suspender cuenta también",
      async () => {
        await db.metaAdObject.update({
          where: { id: objectId },
          data: { status: "ACTIVE" },
        });
        revoke = true;
        await failures(
          setMetaStatus(editor, objectId, "PAUSED", "ACTIVE"),
          403,
        );
        assert.equal(writes, 1);
        assert.equal(
          (await db.metaAdObject.findUniqueOrThrow({ where: { id: objectId } }))
            .status,
          "ACTIVE",
        );
        await failures(access(editor, accountId), 404);
        await share([
          { userId: editor.id, permission: "EDIT" },
          { userId: viewer.id, permission: "VIEW" },
        ]);
        await db.user.update({
          where: { id: editor.id },
          data: { status: "SUSPENDED" },
        });
        await failures(
          setMetaStatus(editor, objectId, "PAUSED", "ACTIVE"),
          403,
        );
        await db.user.update({
          where: { id: editor.id },
          data: { status: "APPROVED" },
        });
      },
    );
    await t.test(
      "Consulta explícita prevalece sobre canSync heredado; retirar el acceso global conserva permisos por cuenta anteriores",
      async () => {
        await access(admin, accountId, true);
        await share([{ userId: admin.id, permission: "VIEW" }]);
        await failures(access(admin, accountId, true), 403);
        await share([]);
        await access(admin, accountId, true);
      },
    );
  } finally {
    MetaReader.prototype.get = get;
    MetaReader.prototype.setStatus = set;
    await db.metaWorkspaceGrant.deleteMany({});
    if (previous.length)
      await db.metaWorkspaceGrant.createMany({ data: previous.map(g=>({...g,pinnedAccountIds:Array.isArray(g.pinnedAccountIds)?g.pinnedAccountIds:[]})) });
    await db.metaWorkspaceSharing.deleteMany({});
    if (state) await db.metaWorkspaceSharing.create({ data: state });
    await db.metaAdAccount.delete({ where: { id: accountId } });
    await db.metaConnection.deleteMany({ where: { name: { contains: tag } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.rateLimit.deleteMany({
      where: { key: { in: ids.map((id) => "meta:manage:" + id) } },
    });
    await db.$disconnect();
  }
});
