import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { projectAccess } from "./auth";
import { demand } from "./errors";

export async function projectMembers(
  req: NextRequest,
  projectId: string,
  memberId: string | undefined,
  user: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  const project = await projectAccess(user, projectId);
  demand(
    project.ownerId === user.id || user.role === "OWNER",
    "Solo el creador o el OWNER pueden administrar los accesos.",
    403,
  );
  if (req.method === "GET" && !memberId) {
    const members = await db.projectMember.findMany({
      where: { projectId },
      orderBy: { user: { email: "asc" } },
      select: {
        userId: true,
        permission: true,
        user: { select: { name: true, email: true, status: true, role: true } },
      },
    });
    return NextResponse.json(
      { members, ownerId: project.ownerId },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  demand(
    ["POST", "DELETE"].includes(req.method),
    "Operación no disponible.",
    405,
  );
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
    const current = await tx.project.findUnique({ where: { id: projectId } });
    demand(current && !current.deletedAt, "Proyecto no encontrado.", 404);
    demand(
      current.ownerId === user.id || user.role === "OWNER",
      "No puedes administrar estos accesos.",
      403,
    );
    const target =
      req.method === "POST"
        ? await tx.user.findUnique({
            where: {
              email: payload?.email ?? "",
            },
          })
        : await tx.user.findUnique({ where: { id: memberId! } });
    demand(
      target && (req.method === "DELETE" || target.status === "APPROVED"),
      "Usuario aprobado no encontrado.",
      404,
    );
    demand(
      target.id !== current.ownerId,
      "El creador conserva el acceso por propiedad; no se modifica como colaborador.",
      409,
    );
    if (req.method === "POST")
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: target.id } },
        create: {
          projectId,
          userId: target.id,
          permission: "ROLE",
        },
        update: { permission: "ROLE" },
      });
    else {
      const where = { projectId, userId: target.id };
      const changed = await tx.projectMember.deleteMany({ where });
      demand(changed.count, "Colaborador no encontrado.", 404);
    }
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action:
          req.method === "DELETE"
            ? "ACCESO_PROYECTO_REVOCADO"
            : "ACCESO_PROYECTO_ACTUALIZADO",
        resourceId: projectId,
        detail: {
          userId: target.id,
        },
      },
    });
  });
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
