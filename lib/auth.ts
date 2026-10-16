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
export function projectFilter(u: { id: string; role: string }) {
  return u.role === "OWNER"
    ? {}
    : {
        OR: [
          { ownerId: u.id },
          { members: { some: { userId: u.id } } },
          ...(u.role === "ADMIN" ? [{ owner: { role: "USER" as const } }] : []),
        ],
      };
}
export async function projectAccess(
  u: { id: string; role: string },
  id: string,
  permission = "VIEW",
  allowDeleted = false,
) {
  const p = await db.project.findFirst({
    where: {
      id,
      ...projectFilter(u),
      ...(allowDeleted ? {} : { deletedAt: null }),
    },
    include: { members: true },
  });
  demand(p, "No tienes acceso a este proyecto.", 404);
  if (permission !== "VIEW" && u.role !== "OWNER" && p.ownerId !== u.id) {
    const member = p.members.find((m) => m.userId === u.id);
    demand(
      member &&
        (member.permission === "MANAGE" ||
          member.permission === "EDIT" ||
          (permission === "GENERATE" && member.permission === "GENERATE")),
      "No tienes permiso para esta operación.",
      403,
    );
  }
  return p;
}
export async function resourceAccess(
  u: { id: string; role: string },
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
  if (scope === "category") {
    const c = await db.category.findUnique({ where: { id } });
    demand(c, "Categoría no encontrada.", 404);
    await projectAccess(u, c.projectId, permission);
    return c;
  }
  if (scope === "subproduct") {
    const s = await db.subproduct.findUnique({
      where: { id },
      include: { category: true },
    });
    demand(s, "Subproducto no encontrado.", 404);
    await projectAccess(u, s.category.projectId, permission);
    return s;
  }
  throw new Error("Ámbito inválido");
}
