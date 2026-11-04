import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { userManagement } from "../lib/user-management";
import { defaultAccountView, hasAiModuleAccess } from "../lib/roles";
import { fullProjectFilter, categoryFullFilter } from "../lib/auth";

test("Editar identidad y promover OWNER conserva cuenta y acceso completo", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = "user-profile-" + randomUUID(),
    ids = [tag + "-owner", tag + "-target", tag + "-other"],
    actor = { id: ids[0], role: "OWNER" };
  const call = (
    target: string,
    input: unknown,
    as = actor,
    suffix = "profile",
  ) =>
    userManagement(
      new NextRequest("http://localhost/api/users/" + target + "/" + suffix, {
        method: "PATCH",
      }),
      suffix ? ["users", target, suffix] : ["users", target],
      as,
      async () => input,
    );
  const payload = async (
    id: string,
    edits: { name?: string; email?: string } = {},
  ) => {
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    return {
      name: u.name,
      email: u.email,
      ...edits,
      expected: { name: u.name, email: u.email },
    };
  };
  try {
    await db.user.createMany({
      data: ids.map((id, i) => ({
        id,
        email: id + "@example.test",
        name: "QA " + i,
        role: i === 0 ? "OWNER" : i === 1 ? "ADVISOR" : "USER",
        status: "APPROVED",
        passwordHash: "synthetic",
        aiAccessEnabled: i === 2,
      })),
    });
    const immutable = (
      u: Awaited<ReturnType<typeof db.user.findUniqueOrThrow>>,
    ) => ({
      id: u.id,
      role: u.role,
      status: u.status,
      planId: u.planId,
      planValidUntil: u.planValidUntil,
      aiAccessEnabled: u.aiAccessEnabled,
      passwordHash: u.passwordHash,
      archivedAt: u.archivedAt,
    });
    const original = immutable(
      await db.user.findUniqueOrThrow({ where: { id: ids[1] } }),
    );
    await db.session.createMany({
      data: ids.slice(0, 2).map((id) => ({
        id: tag + "-session-" + id,
        userId: id,
        expiresAt: new Date(Date.now() + 3600000),
      })),
    });
    await t.test(
      "OWNER con marca antigua Sin IA conserva lectura de Cursos IA y permisos completos",
      async () => {
        const { courseList } = await import("../lib/courses/service");
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: ids[0] } }))
            .aiAccessEnabled,
          false,
        );
        assert(Array.isArray(await courseList(actor)));
        assert(hasAiModuleAccess({ role: "OWNER", aiAccessEnabled: false }));
        assert(!hasAiModuleAccess({ role: "ADVISOR", aiAccessEnabled: false }));
      },
    );
    await t.test(
      "Nombre de otra cuenta conserva ID, sesión, contraseña, rol y plan",
      async () => {
        const r = await call(
          ids[1],
          await payload(ids[1], { name: "  Nombre actualizado  " }),
        );
        assert(r);
        assert.equal(r.status, 200);
        const current = await db.user.findUniqueOrThrow({
          where: { id: ids[1] },
        });
        assert.equal(current.name, "Nombre actualizado");
        assert.deepEqual(immutable(current), original);
        assert.equal(await db.session.count({ where: { userId: ids[1] } }), 1);
      },
    );
    await t.test(
      "Correo y nombre se guardan juntos normalizados y revocan credenciales antiguas",
      async () => {
        const data = await payload(ids[1], {
          name: "Identidad nueva",
          email: "  NUEVO-" + tag + "@example.test  ",
        });
        const r = await call(ids[1], data);
        assert(r);
        assert.equal(r.status, 200);
        const current = await db.user.findUniqueOrThrow({
          where: { id: ids[1] },
        });
        assert.equal(current.email, data.email.trim().toLowerCase());
        assert.equal(current.name, "Identidad nueva");
        assert.deepEqual(immutable(current), original);
        assert.equal(await db.session.count({ where: { userId: ids[1] } }), 0);
      },
    );
    await t.test(
      "Correo duplicado y CAS obsoleto no escriben ningún campo",
      async () => {
        const before = await db.user.findUniqueOrThrow({
          where: { id: ids[1] },
        });
        await assert.rejects(
          call(
            ids[1],
            await payload(ids[1], {
              name: "No guardar",
              email: ids[2].toUpperCase() + "@EXAMPLE.TEST",
            }),
          ),
          /Ya existe/,
        );
        const data = await payload(ids[1], { name: "No guardar" });
        data.expected.name = "Nombre obsoleto";
        await assert.rejects(call(ids[1], data), /cambió/);
        assert.deepEqual(
          await db.user.findUniqueOrThrow({ where: { id: ids[1] } }),
          before,
        );
      },
    );
    await t.test(
      "OWNER puede editarse; cambiar nombre conserva sesión y correo propio la cierra",
      async () => {
        let r = await call(
          ids[0],
          await payload(ids[0], { name: "Owner nuevo" }),
        );
        assert(r);
        let data = await r.json();
        assert(data.reloadOwn);
        assert(!data.closesOwnSession);
        assert.equal(await db.session.count({ where: { userId: ids[0] } }), 1);
        r = await call(
          ids[0],
          await payload(ids[0], { email: "own-new-" + tag + "@example.test" }),
        );
        assert(r);
        data = await r.json();
        assert(data.closesOwnSession);
        assert.equal(await db.session.count({ where: { userId: ids[0] } }), 0);
      },
    );
    await t.test(
      "Permiso vigente y campos estrictos evitan edición ajena o de roles por este formulario",
      async () => {
        await assert.rejects(
          call(ids[1], await payload(ids[1]), { id: ids[2], role: "ADMIN" }),
          /OWNER/,
        );
        await db.user.update({
          where: { id: ids[0] },
          data: { role: "ADVISOR" },
        });
        await assert.rejects(
          call(ids[1], await payload(ids[1])),
          /autorización/,
        );
        await db.user.update({
          where: { id: ids[0] },
          data: { role: "OWNER" },
        });
        await assert.rejects(
          call(ids[1], { ...(await payload(ids[1])), role: "OWNER" }),
        );
      },
    );
    await t.test(
      "Promoción de asesor a OWNER elimina sesión antigua y la vinculación no limita navegación ni proyectos",
      async () => {
        await db.session.create({
          data: {
            id: tag + "-old-advisor",
            userId: ids[1],
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        const r = await call(
          ids[1],
          { role: "OWNER", status: "APPROVED" },
          actor,
          "",
        );
        assert(r);
        assert.equal(r.status, 200);
        const target = await db.user.findUniqueOrThrow({
          where: { id: ids[1] },
        });
        assert.equal(target.role, "OWNER");
        assert(hasAiModuleAccess({ role: "OWNER", aiAccessEnabled: false }));
        assert(!hasAiModuleAccess({ role: "ADVISOR", aiAccessEnabled: false }));
        assert.equal(
          await db.session.count({ where: { userId: target.id } }),
          0,
        );
        assert.equal(
          defaultAccountView({ role: target.role, advisorLinked: true }),
          "projects",
        );
        assert.deepEqual(fullProjectFilter(target), {});
        assert.deepEqual(categoryFullFilter(target), {});
        assert.equal(
          defaultAccountView({ role: "ADVISOR", advisorLinked: true }),
          "performance",
        );
        assert.notDeepEqual(
          fullProjectFilter({ id: ids[2], role: "USER" }),
          {},
        );
      },
    );
  } finally {
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.rateLimit.deleteMany({
      where: { key: { in: ids.map((id) => "account-profile:" + id) } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
