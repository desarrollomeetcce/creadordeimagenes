import { recordActivity } from "./activity";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { projectAccess } from "./auth";
import { demand } from "./errors";

type Actor = { id: string; role: string };
export async function scopedMembers(
  req: NextRequest,
  scope: "project" | "category" | "subproduct",
  resourceId: string,
  memberId: string | undefined,
  user: Actor,
  body: () => Promise<unknown>,
) {
  const category =
    scope === "category"
      ? await db.category.findUnique({ where: { id: resourceId } })
      : null;
  const sub =
    scope === "subproduct"
      ? await db.subproduct.findUnique({
          where: { id: resourceId },
          include: { category: true },
        })
      : null;
  demand(
    scope === "project" || category || (sub && !sub.deletedAt),
    "Espacio no encontrado.",
    404,
  );
  const projectId =
    category?.projectId ?? sub?.category.projectId ?? resourceId;
  const project = await projectAccess(user, projectId);
  demand(
    user.role === "OWNER" ||
      (user.role !== "OBSERVER" && project.ownerId === user.id),
    "Solo el creador del proyecto o el OWNER pueden administrar los accesos.",
    403,
  );
  const send = (b: unknown) =>
    NextResponse.json(b, { headers: { "Cache-Control": "no-store" } });
  if (req.method === "GET" && memberId === "directory") {
    const q = z
      .string()
      .max(200)
      .parse(req.nextUrl.searchParams.get("q") ?? "");
    const users = await db.user.findMany({
      where: {
        status: "APPROVED",
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { email: "asc" }],
      take: 201,
    });
    return send({ users: users.slice(0, 200), hasMore: users.length > 200 });
  }
  const list = async () =>
    scope === "project"
      ? db.projectMember.findMany({
          where: { projectId },
          select: {
            userId: true,
            user: {
              select: { name: true, email: true, role: true, status: true },
            },
          },
        })
      : scope === "category"
        ? db.categoryMember.findMany({
            where: { categoryId: resourceId },
            select: {
              userId: true,
              user: {
                select: { name: true, email: true, role: true, status: true },
              },
            },
          })
        : db.subproductMember.findMany({
            where: { subproductId: resourceId },
            select: {
              userId: true,
              user: {
                select: { name: true, email: true, role: true, status: true },
              },
            },
          });
  if (req.method === "GET" && !memberId)
    return send({
      members: await list(),
      ownerId: project.ownerId,
      allAdministrators: project.allAdministrators,
      canSetAdministrators: user.role === "OWNER",
    });
  demand(
    ["POST", "DELETE", "PATCH"].includes(req.method),
    "Operación no disponible.",
    405,
  );
  if (req.method === "PATCH") {
    demand(!memberId, "Operación no disponible.", 405);
    demand(
      scope === "project" && !memberId && user.role === "OWNER",
      "Solo OWNER establece el acceso grupal de administradores.",
      403,
    );
    const value = z
      .object({ allAdministrators: z.boolean() })
      .strict()
      .parse(await body());
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      demand(
        current?.role === "OWNER" && current.status === "APPROVED",
        "Tu cuenta ya no puede administrar este acceso.",
        403,
      );
      await tx.project.update({ where: { id: projectId }, data: value });
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action: value.allAdministrators
            ? "ACCESO_ADMINISTRADORES_ACTIVADO"
            : "ACCESO_ADMINISTRADORES_DESACTIVADO",
          resourceId: projectId,
        },
      });
    });
    return send({ ok: true });
  }
  demand(
    req.method === "POST" ? !memberId : !!memberId,
    "Ruta no válida.",
    404,
  );
  const payload =
    req.method === "POST"
      ? z
          .object({
            email: z
              .email()
              .max(200)
              .transform((v) => v.toLowerCase()),
          })
          .strict()
          .parse(await body())
      : null;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
    const [current, issuer] = await Promise.all([
      tx.project.findUnique({ where: { id: projectId } }),
      tx.user.findUnique({ where: { id: user.id } }),
    ]);
    demand(
      current &&
        !current.deletedAt &&
        issuer?.status === "APPROVED" &&
        (issuer.role === "OWNER" ||
          (issuer.role !== "OBSERVER" && current.ownerId === issuer.id)),
      "No puedes administrar estos accesos.",
      403,
    );
    const target =
      req.method === "POST"
        ? await tx.user.findUnique({ where: { email: payload!.email } })
        : await tx.user.findUnique({ where: { id: memberId! } });
    demand(
      target && (req.method === "DELETE" || target.status === "APPROVED"),
      "No existe una cuenta aprobada con ese correo.",
      404,
    );
    demand(
      target.id !== current.ownerId,
      "El creador conserva el acceso por propiedad.",
      409,
    );
    if (scope === "project") {
      if (req.method === "POST")
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId, userId: target.id } },
          create: { projectId, userId: target.id, permission: "ROLE" },
          update: { permission: "ROLE" },
        });
      else
        demand(
          (
            await tx.projectMember.deleteMany({
              where: { projectId, userId: target.id },
            })
          ).count,
          "Colaborador no encontrado.",
          404,
        );
    } else if (scope === "category") {
      if (req.method === "POST")
        await tx.categoryMember.upsert({
          where: {
            categoryId_userId: { categoryId: resourceId, userId: target.id },
          },
          create: { categoryId: resourceId, userId: target.id },
          update: {},
        });
      else
        demand(
          (
            await tx.categoryMember.deleteMany({
              where: { categoryId: resourceId, userId: target.id },
            })
          ).count,
          "Colaborador no encontrado.",
          404,
        );
    } else {
      if (req.method === "POST")
        await tx.subproductMember.upsert({
          where: {
            subproductId_userId: {
              subproductId: resourceId,
              userId: target.id,
            },
          },
          create: { subproductId: resourceId, userId: target.id },
          update: {},
        });
      else
        demand(
          (
            await tx.subproductMember.deleteMany({
              where: { subproductId: resourceId, userId: target.id },
            })
          ).count,
          "Colaborador no encontrado.",
          404,
        );
    }
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: `ACCESO_${scope.toUpperCase()}_${req.method === "DELETE" ? "REVOCADO" : "ACTUALIZADO"}`,
        resourceId,
        detail: { userId: target.id },
      },
    });
  });
  return send({ ok: true });
}
export function projectMembers(
  req: NextRequest,
  projectId: string,
  memberId: string | undefined,
  user: Actor,
  body: () => Promise<unknown>,
) {
  return scopedMembers(req, "project", projectId, memberId, user, body);
}
