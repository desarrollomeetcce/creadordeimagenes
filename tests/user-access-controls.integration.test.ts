import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { NextRequest } from "next/server";
import {Prisma} from "@prisma/client";
import {saveWorkspaceSharing,readWorkspaceSharing} from "../lib/meta-ads/workspace-access";
import { db } from "../lib/db";
import { userManagement } from "../lib/user-management";
import { issuePasswordReset } from "../lib/accounts";
import { checkPlanAllowance } from "../lib/membership-plans";
test("Unified account/plan save, No AI, OWNER session actions and reversible retirement", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    secret = "Clave-sintetica-01234567",
    hash = await argon2.hash(secret),
    users = await Promise.all(
      (["OWNER", "ADMIN", "USER"] as const).map((role) =>
        db.user.create({
          data: {
            name: role + " " + tag,
            email: role.toLowerCase() + tag + "@example.test",
            role,
            status: "APPROVED",
            passwordHash: hash,
          },
        }),
      ),
    ),
    [owner, admin, target] = users,
    ids = users.map((u) => u.id);
  const plan = await db.membershipPlan.create({
      data: {
        id: "QA-" + tag,
        name: "Plan " + tag,
        priceCents: 0,
        monthlyImages: null,
        monthlyAIMicros: null,
        isPublic: false,
      },
    }),
    custom = await db.membershipPlan.create({
      data: {
        id: "QA-C-" + tag,
        name: "Custom " + tag,
        priceCents: 0,
        monthlyImages: 1,
        monthlyAIMicros: 1000n,
        isPublic: false,
        customUserId: owner.id,
      },
    }),
    project = await db.project.create({
      data: { name: tag, ownerId: target.id },
    }),
    table = await db.metaAliasTable.create({ data: { name: tag } });
  const call = (
    actor: { id: string; role: string },
    id: string,
    method: string,
    data: unknown = {},
    suffix = "",
  ) =>
    userManagement(
      new NextRequest(
        "http://localhost/api/users/" + id + (suffix ? "/" + suffix : ""),
        { method },
      ),
      ["users", id, ...(suffix ? [suffix] : [])],
      actor,
      async () => data,
    );
  try {
    await t.test(
      "One save persists plan and role atomically without revoking unchanged OWNER session",
      async () => {
        await db.session.create({
          data: {
            id: "owner-session-" + tag,
            userId: owner.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        const res = await call(owner, owner.id, "PATCH", {
          role: "OWNER",
          status: "APPROVED",
          planId: plan.id,
          validUntil: null,
          aiAccessEnabled: true,
        });
        assert.equal((await res.json()).closesOwnSession, false);
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).planId,
          plan.id,
        );
        assert.equal(
          await db.session.count({ where: { id: "owner-session-" + tag } }),
          1,
        );
        await assert.rejects(
          call(owner, target.id, "PATCH", {
            role: "SUPERVISOR",
            status: "APPROVED",
            planId: custom.id,
            validUntil: null,
          }),
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: target.id } })).role,
          "USER",
        );
        await assert.rejects(
          call(admin, target.id, "PATCH", {
            role: "USER",
            status: "APPROVED",
            planId: plan.id,
          }),
        );
        await assert.rejects(
          call(owner, target.id, "PATCH", {
            role: "USER",
            status: "APPROVED",
            expected: {
              role: "OBSERVER",
              status: "APPROVED",
              planId: null,
              validUntil: null,
            },
          }),
        );
      },
    );
    await t.test(
      "Explicit No AI overrides legacy planless access and OWNER quota exemption",
      async () => {
        await call(owner, target.id, "PATCH", {
          role: "USER",
          status: "APPROVED",
          planId: null,
          validUntil: null,
          aiAccessEnabled: false,
        });
        await assert.rejects(
          db.$transaction((tx) => checkPlanAllowance(tx, target.id, 1, 0n)),
        );
        await call(owner, owner.id, "PATCH", {
          role: "OWNER",
          status: "APPROVED",
          aiAccessEnabled: false,
        });
        await assert.rejects(
          db.$transaction((tx) => checkPlanAllowance(tx, owner.id, 1, 0n)),
        );
        await call(owner, owner.id, "PATCH", {
          role: "OWNER",
          status: "APPROVED",
          aiAccessEnabled: true,
        });
      },
    );
    await t.test(
      "OWNER sets a new hash and issues a one-use link using session authorization; Admin still needs proof",
      async () => {
        const pass = "Nueva-clave-QA-0123456789";
        await call(owner, target.id, "POST", { newPassword: pass }, "password");
        const u = await db.user.findUniqueOrThrow({ where: { id: target.id } });
        assert(await argon2.verify(u.passwordHash, pass));
        assert.notEqual(u.passwordHash, pass);
        const link = await issuePasswordReset(owner, target.id, {});
        assert.match(link.token, /^[a-zA-Z0-9_-]{43}$/);
        await assert.rejects(issuePasswordReset(admin, target.id, {}));
        await assert.rejects(
          call(admin, target.id, "POST", { newPassword: pass }, "password"),
        );
        await call(
          owner,
          target.id,
          "PATCH",
          {
            email: "changed" + tag + "@example.test",
            expectedEmail: target.email,
          },
          "email",
        );
      },
    );
    await t.test(
      "Retire preserves identity and project history, removes sharing with revisions and restores suspended",
      async () => {
        await db.effectivenessGrant.create({
          data: {
            userId: target.id,
            scope: "TABLE:" + table.id,
            permission: "VIEW",
            grantedById: owner.id,
          },
        });
        await db.metaWorkspaceGrant.create({
          data: {
            userId: target.id,
            permission: "VIEW",
            grantedById: owner.id,
          },
        });
        const originalPins=await db.metaWorkspaceSharing.findUnique({where:{id:'global'},select:{pinnedAccountIds:true}});
        await db.metaWorkspaceSharing.upsert({where:{id:'global'},create:{id:'global'},update:{pinnedAccountIds:Prisma.DbNull}});
        await db.metaWorkspaceGrant.update({where:{userId:target.id},data:{pinnedAccountIds:['9911223344']}});
        try{const shared=await readWorkspaceSharing(owner);await saveWorkspaceSharing(owner,{revision:shared.revision,grants:shared.grants,pinnedAccountIds:[],preservePins:true});assert.deepEqual((await db.metaWorkspaceGrant.findUniqueOrThrow({where:{userId:target.id}})).pinnedAccountIds,['9911223344']);}
        finally{await db.metaWorkspaceSharing.update({where:{id:'global'},data:{pinnedAccountIds:originalPins?.pinnedAccountIds??Prisma.DbNull}});}
        await assert.rejects(call(admin, target.id, "DELETE"));
        await call(owner, target.id, "DELETE");
        const u = await db.user.findUniqueOrThrow({ where: { id: target.id } });
        assert(u.archivedAt);
        assert.equal(u.status, "SUSPENDED");
        assert.equal(await db.project.count({ where: { id: project.id } }), 1);
        assert.equal(
          await db.effectivenessGrant.count({ where: { userId: target.id } }),
          0,
        );
        assert.equal(
          await db.metaWorkspaceGrant.count({ where: { userId: target.id } }),
          0,
        );
        assert.equal(
          await db.passwordReset.count({ where: { userId: target.id } }),
          0,
        );
        const listing = await userManagement(
          new NextRequest("http://localhost/api/users"),
          ["users"],
          owner,
          async () => ({}),
        );
        assert(!(await listing.json()).some((x: any) => x.id === target.id));
        await call(owner, target.id, "POST", {}, "restore");
        const restored = await db.user.findUniqueOrThrow({
          where: { id: target.id },
        });
        assert.equal(restored.archivedAt, null);
        assert.equal(restored.status, "SUSPENDED");
        assert.equal(restored.id, target.id);
      },
    );
  } finally {
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.passwordReset.deleteMany({ where: { userId: { in: ids } } });
    await db.ownerRecovery.deleteMany({ where: { userId: { in: ids } } });
    await db.project.delete({ where: { id: project.id } });
    await db.effectivenessGrant.deleteMany({ where: { userId: { in: ids } } });
    await db.effectivenessSharing.deleteMany({
      where: { scope: "TABLE:" + table.id },
    });
    await db.metaWorkspaceGrant.deleteMany({ where: { userId: { in: ids } } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.user.updateMany({
      where: { id: { in: ids } },
      data: { planId: null },
    });
    await db.membershipPlan.deleteMany({
      where: { id: { in: [plan.id, custom.id] } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.rateLimit.deleteMany({
      where: { OR: ids.map((id) => ({ key: { contains: id } })) },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
