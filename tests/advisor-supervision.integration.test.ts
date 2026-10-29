import type { User } from "@prisma/client";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import {
  performanceSettings,
  performanceTeam,
  saveAdvisorTargets,
  createAdvisorAccess,
  savePortalLink,
  advisorPerformance,
} from "../lib/meta-ads/advisor-performance";
import { advisors } from "../lib/meta-ads/advisors";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
import { metaRoutes } from "../lib/meta-ads/routes";
import { userManagement } from "../lib/user-management";
test("Supervisor y Asesor: metas diarias, cuentas, aislamiento y catálogo activo", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    password = "Prueba-supervision-0123456789",
    hash = await argon2.hash(password),
    today = localDay("America/Lima"),
    yesterday = shiftDay(today, -1),
    users: User[] = [];
  for (const role of ["OWNER", "SUPERVISOR", "ADVISOR", "ADMIN"] as const)
    users.push(
      await db.user.create({
        data: {
          name: role + " " + tag,
          email: role.toLowerCase() + tag + "@example.test",
          passwordHash: hash,
          status: "APPROVED",
          role,
        },
      }),
    );
  const [owner, supervisor, advisor, admin] = users,
    active = await db.metaEffectivenessSheet.create({
      data: { kind: "ADVISORS", name: "Equipo " + tag },
    }),
    archived = await db.metaEffectivenessSheet.create({
      data: {
        kind: "ADVISORS",
        name: "Eliminada " + tag,
        archivedAt: new Date(),
      },
    }),
    ana = await db.metaAdvisor.create({
      data: { name: "Ana " + tag, sheetId: active.id },
    }),
    bob = await db.metaAdvisor.create({
      data: { name: "Beto " + tag, sheetId: active.id },
    }),
    gone = await db.metaAdvisor.create({
      data: { name: "Ana " + tag, sheetId: archived.id },
    }),
    table = await db.metaAliasTable.create({
      data: { name: "Prueba " + tag, defaultCountry: "PE" },
    }),
    alias = await db.metaAlias.create({
      data: { tableId: table.id, name: "Curso " + tag },
    }),
    row = await db.metaEffectivenessRow.create({
      data: {
        aliasId: alias.id,
        country: "PE",
        currency: "",
        advisorId: ana.id,
      },
    });
  const fail = async (p: Promise<unknown>, status = 403) =>
    assert.rejects(
      p,
      (e: any) => e.status === status || e.statusCode === status,
    );
  try {
    for (const [day, sales] of [
      [today, 3],
      [yesterday, 5],
    ] as const) {
      await db.metaEffectivenessDay.create({
        data: { rowId: row.id, day, sales, salesOverridden: true },
      });
      await db.metaAdvisorBaseDay.create({
        data: {
          tableId: table.id,
          country: "PE",
          day,
          allocations: [{ advisorId: ana.id, quantity: 150 }],
        },
      });
      await db.metaManualBaseDay.create({
        data: {
          tableId: table.id,
          country: "PE",
          day,
          allocations: [{ advisorId: ana.id, quantity: 358 }],
        },
      });
    }
    await t.test(
      "Solo OWNER y Supervisor gestionan; ADMIN y Asesor no ven el equipo",
      async () => {
        await performanceSettings(supervisor);
        await fail(performanceSettings(advisor));
        await fail(performanceTeam(admin));
        await fail(
          userManagement(
            new NextRequest("http://localhost/api/users"),
            ["users"],
            supervisor,
            async () => ({}),
          ),
        );
      },
    );
    await t.test(
      "Los asesores de pestañas eliminadas no se ofrecen, ni con nombre idéntico",
      async () => {
        const list = await advisors(owner),
          settings = await performanceSettings(supervisor);
        assert(list.some((p) => p.id === ana.id));
        assert(!list.some((p) => p.id === gone.id));
        assert(!settings.people.some((p) => p.id === gone.id));
        assert(!JSON.stringify(list).includes("pestaña eliminada"));
        assert(await db.metaAdvisor.findUnique({ where: { id: gone.id } }));
      },
    );
    const body = {
      advisorId: ana.id,
      targets: [
        { basis: "BC", percent: 4, salesTarget: null, revision: 0 },
        { basis: "BM", percent: 3, salesTarget: 10, revision: 0 },
      ],
    };
    await t.test(
      "Dos metas independientes, ventas opcionales y revisiones atómicas",
      async () => {
        await saveAdvisorTargets(supervisor, body);
        await fail(
          saveAdvisorTargets(supervisor, {
            ...body,
            targets: [
              { ...body.targets[0], percent: 9, revision: 1 },
              body.targets[1],
            ],
          }),
          409,
        );
        assert.equal(
          (
            await db.metaAdvisorTarget.findUnique({
              where: { advisorId_basis: { advisorId: ana.id, basis: "BC" } },
            })
          )?.percent,
          4,
        );
        await fail(saveAdvisorTargets(advisor, body));
        await fail(
          saveAdvisorTargets(supervisor, { ...body, advisorId: gone.id }),
          404,
        );
      },
    );
    await t.test(
      "Resumen y vista del asesor usan ventas/BC hoy y ventas/BM ayer sin elevar rol",
      async () => {
        const team = await performanceTeam(supervisor),
          p = team.people.find((p) => p.id === ana.id)!;
        assert.equal(p.today!.percent, 2);
        assert(Math.abs(p.yesterday!.percent! - (5 / 358) * 100) < 0.00001);
        assert(!team.people.some((p) => p.id === gone.id));
        const report = await advisorPerformance(supervisor, {
          advisorId: ana.id,
        });
        assert.equal(report.today.goal?.percent, 4);
        assert.equal(report.yesterday.goal?.percent, 3);
        assert.equal(
          (await db.user.findUnique({ where: { id: supervisor.id } }))?.role,
          "SUPERVISOR",
        );
      },
    );
    await t.test(
      "El acceso Meta de lectura no bloquea la gestión independiente de desempeño",
      async () => {
        await db.metaWorkspaceGrant.create({
          data: {
            userId: supervisor.id,
            grantedById: owner.id,
            permission: "VIEW",
            pinnedAccountIds: [],
          },
        });
        const r = await metaRoutes(
          new NextRequest(
            "http://localhost/api/meta-ads/my-performance/targets",
            { method: "PUT" },
          ),
          ["meta-ads", "my-performance", "targets"],
          supervisor,
          async () => ({ ...body, advisorId: bob.id }),
        );
        assert.equal(r.status, 200);
      },
    );
    await t.test(
      "Crear cuenta aprobada de Asesor y vincularla en la misma transacción, sin exponer contraseña",
      async () => {
        const r = await createAdvisorAccess(supervisor, {
          advisorId: bob.id,
          revision: 0,
          email: "nuevo-" + tag + "@example.test",
          password,
        });
        users.push(
          await db.user.findUniqueOrThrow({ where: { id: r.user.id } }),
        );
        const user = users.at(-1)!;
        assert.equal(user.role, "ADVISOR");
        assert.equal(user.status, "APPROVED");
        assert(await argon2.verify(user.passwordHash, password));
        assert(!JSON.stringify(r).includes("password"));
        assert.equal(
          (
            await db.metaAdvisorPortal.findUnique({
              where: { advisorId: bob.id },
            })
          )?.userId,
          user.id,
        );
        await fail(advisorPerformance(user, { advisorId: ana.id }));
        assert.equal((await advisorPerformance(user, {})).person.id, bob.id);
        await fail(
          createAdvisorAccess(advisor, {
            advisorId: ana.id,
            revision: 0,
            email: "no-" + tag + "@example.test",
            password,
          }),
        );
      },
    );
    await t.test(
      "Una cuenta representa un solo asesor y no puede enlazar roles elevados",
      async () => {
        await savePortalLink(supervisor, {
          advisorId: ana.id,
          userId: advisor.id,
          revision: 0,
        });
        await fail(
          savePortalLink(supervisor, {
            advisorId: bob.id,
            userId: advisor.id,
            revision: 1,
          }),
          409,
        );
        await fail(
          savePortalLink(supervisor, {
            advisorId: ana.id,
            userId: owner.id,
            revision: 1,
          }),
          400,
        );
        await fail(performanceSettings(advisor));
      },
    );
    await t.test(
      "La revocación del rol se comprueba aunque el actor conserve un rol anterior",
      async () => {
        await db.user.update({
          where: { id: supervisor.id },
          data: { role: "ADVISOR" },
        });
        await fail(performanceTeam(supervisor));
        await fail(
          saveAdvisorTargets(supervisor, {
            ...body,
            targets: body.targets.map((t) => ({ ...t, revision: 1 })),
          }),
        );
      },
    );
  } finally {
    const ids = users.map((u) => u.id),
      people = [ana.id, bob.id, gone.id];
    await db.metaWorkspaceGrant.deleteMany({ where: { userId: { in: ids } } });
    await db.metaAdvisorTarget.deleteMany({
      where: { advisorId: { in: people } },
    });
    await db.metaAdvisorPortal.deleteMany({
      where: { advisorId: { in: people } },
    });
    await db.metaManualBaseDay.deleteMany({ where: { tableId: table.id } });
    await db.metaAdvisorBaseDay.deleteMany({ where: { tableId: table.id } });
    await db.metaEffectivenessRow.deleteMany({ where: { id: row.id } });
    await db.metaAlias.deleteMany({ where: { id: alias.id } });
    await db.metaAliasTable.deleteMany({ where: { id: table.id } });
    await db.metaAdvisor.deleteMany({ where: { id: { in: people } } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [active.id, archived.id] } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.rateLimit.deleteMany({
      where: { key: { in: ids.map((id) => "advisor-account-create:" + id) } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
