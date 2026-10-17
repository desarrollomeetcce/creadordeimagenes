import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { demand } from "./errors";
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function actor() {
  const c = await cookies();
  const raw = c.get("session")?.value;
  demand(raw, "Inicia sesión para continuar.", 401);
  const s = await db.session.findUnique({
    where: { id: tokenHash(raw) },
    include: { user: true },
  });
  demand(
    s && s.expiresAt > new Date() && s.user.status === "APPROVED",
    "La sesión ha caducado o la cuenta no está aprobada.",
    401,
  );
  return s.user;
}
export async function session(userId: string, expectedPasswordHash: string) {
  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 8 * 3600000);
  await db.$transaction(async (tx) => {
    const users = await tx.$queryRaw<
      { passwordHash: string; status: string }[]
    >`SELECT "passwordHash", "status" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    demand(
      users[0]?.passwordHash === expectedPasswordHash &&
        users[0]?.status === "APPROVED",
      "La cuenta cambió. Inicia sesión con la contraseña vigente.",
      401,
    );
    await tx.session.create({
      data: { id: tokenHash(raw), userId, expiresAt: expires },
    });
  });
  (await cookies()).set("session", raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires,
  });
}
export async function rateLimit(key: string, max = 10) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(179231)`;
    const previous = await tx.rateLimit.findUnique({ where: { key } });
    const fresh = !previous || previous.expiresAt < new Date();
    demand(
      fresh || previous.count < max,
      "Demasiados intentos. Espera quince minutos.",
      429,
    );
    await tx.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt: new Date(Date.now() + 900000) },
      update: fresh
        ? { count: 1, expiresAt: new Date(Date.now() + 900000) }
        : { count: { increment: 1 } },
    });
  });
}
export function ownerOnly(u: { role: string }) {
  demand(u.role === "OWNER", "Esta sección es exclusiva del OWNER.", 403);
}
type AccessActor = { id: string; role: string };
export function fullProjectFilter(
  u: AccessActor,
): import("@prisma/client").Prisma.ProjectWhereInput {
  if (u.role === "OWNER") return {};
  return {
    OR: [
      ...(u.role !== "OBSERVER" ? [{ ownerId: u.id }] : []),
      { members: { some: { userId: u.id } } },
      ...(u.role === "ADMIN" ? [{ allAdministrators: true }] : []),
    ],
  };
}
export function categoryFullFilter(
  u: AccessActor,
): import("@prisma/client").Prisma.CategoryWhereInput {
  if (u.role === "OWNER") return {};
  return {
    OR: [
      { project: fullProjectFilter(u) },
      { members: { some: { userId: u.id } } },
    ],
  };
}
export function categoryFilter(
  u: AccessActor,
): import("@prisma/client").Prisma.CategoryWhereInput {
  if (u.role === "OWNER") return { deletedAt:null, project: { deletedAt: null } };
  return {
    deletedAt:null,
    project: { deletedAt: null },
    OR: [
      categoryFullFilter(u),
      {
        subproducts: {
          some: { deletedAt: null, members: { some: { userId: u.id } } },
        },
      },
    ],
  };
}
export function subproductFilter(
  u: AccessActor,
): import("@prisma/client").Prisma.SubproductWhereInput {
  if (u.role === "OWNER")
    return { deletedAt: null, category: { deletedAt:null, project: { deletedAt: null } } };
  return {
    deletedAt: null,
    category: { deletedAt:null, project: { deletedAt: null } },
    OR: [
      { category: categoryFullFilter(u) },
      { members: { some: { userId: u.id } } },
    ],
  };
}
export function projectFilter(
  u: AccessActor,
): import("@prisma/client").Prisma.ProjectWhereInput {
  if (u.role === "OWNER") return {};
  return {
    OR: [
      fullProjectFilter(u),
      {
        categories: {
          some: {
            deletedAt:null,
            OR: [
              { members: { some: { userId: u.id } } },
              {
                subproducts: {
                  some: {
                    deletedAt: null,
                    members: { some: { userId: u.id } },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}
export async function projectAccess(
  u: AccessActor,
  id: string,
  permission = "VIEW",
  allowDeleted = false,
) {
  const p = await db.project.findFirst({
    where: {
      id,
      ...(permission === "NAVIGATE" ? projectFilter(u) : fullProjectFilter(u)),
      ...(allowDeleted ? {} : { deletedAt: null }),
    },
    include: { members: true },
  });
  demand(p, "No tienes acceso a este proyecto.", 404);
  demand(
    ["VIEW", "NAVIGATE"].includes(permission) || u.role !== "OBSERVER",
    "El rol Observador solo permite ver y descargar.",
    403,
  );
  return p;
}
export async function resourceAccess(
  u: AccessActor,
  scope: string,
  id: string,
  permission = "VIEW",
) {
  if (scope === "preset") {
    const { presetAccess } = await import("./preset-access");
    return presetAccess(u, id, permission !== "VIEW");
  }
  if (scope === "variation") {
    const { accessibleVariation } = await import("./versions");
    return accessibleVariation(u, id, permission);
  }
  if (scope === "project") return projectAccess(u, id, permission);
  demand(
    ["VIEW", "NAVIGATE"].includes(permission) || u.role !== "OBSERVER",
    "El rol Observador solo permite ver y descargar.",
    403,
  );
  if (scope === "category") {
    const c = await db.category.findFirst({
      where: {
        id,
        ...(permission === "NAVIGATE"
          ? categoryFilter(u)
          : categoryFullFilter(u)),
        project: { deletedAt: null },
        deletedAt:null,
      },
    });
    demand(c, "No tienes acceso a este producto.", 404);
    return c;
  }
  if (scope === "subproduct") {
    const s = await db.subproduct.findFirst({
      where: { id, ...subproductFilter(u) },
      include: { category: true },
    });
    demand(s, "No tienes acceso a este subproducto.", 404);
    return s;
  }
  throw new Error("Ámbito inválido");
}
export async function jobResourceAccess(
  u: AccessActor,
  job: { projectId: string; subproductId?: string | null },
  permission = "VIEW",
) {
  if (job.projectId === "connection-test") {
    ownerOnly(u);
    return;
  }
  if (job.subproductId)
    return resourceAccess(u, "subproduct", job.subproductId, permission);
  return projectAccess(u, job.projectId, permission);
}
export async function accessFlags(
  u: AccessActor,
  scope: string,
  id: string,
  projectId: string,
) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
  });
  let fullAccess = true;
  try {
    await resourceAccess(u, scope, id);
  } catch {
    fullAccess = false;
  }
  return {
    fullAccess,
    canEdit: fullAccess && u.role !== "OBSERVER",
    canManageAccess:
      u.role === "OWNER" || (u.role !== "OBSERVER" && project.ownerId === u.id),
  };
}
