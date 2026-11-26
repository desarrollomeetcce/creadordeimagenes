import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";

type Account = { id: string; role: string };
const eligible = { role: "SUPERADMIN", status: "APPROVED", archivedAt: null } as const;

export async function hasSharedCourses(user: Account) {
  return user.role === "SUPERADMIN" && Boolean(await db.aICourseViewer.findFirst({
    where: { userId: user.id, user: eligible, course: { archivedAt: null } },
    select: { courseId: true },
  }));
}

export async function sharedCourses(user: Account, courseId?: string) {
  demand(user.role === "SUPERADMIN", "No tienes cursos compartidos.", 403);
  const where = { archivedAt: null, viewers: { some: { userId: user.id, user: eligible } } };
  const select = { id: true, title: true, description: true } as const;
  if (!courseId) return db.aICourse.findMany({ where, select, orderBy: [{ title: "asc" }, { id: "asc" }] });
  const course = await db.aICourse.findFirst({ where: { ...where, id: courseId }, select: {
    ...select, modules: { orderBy: { position: "asc" }, select: { id: true, title: true, brief: true, minutes: true } },
  } });
  demand(course, "Curso no disponible.", 404);
  return course;
}

export async function courseViewers(courseId: string) {
  const course = await db.aICourse.findFirst({ where: { id: courseId, archivedAt: null }, select: {
    viewers: { select: { userId: true } },
  } });
  demand(course, "Curso no disponible.", 404);
  return {
    users: await db.user.findMany({ where: eligible, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    granted: course.viewers.map(({ userId }) => userId),
  };
}

export async function setCourseViewer(actor: Account, courseId: string, input: unknown) {
  const { userId, allowed } = z.object({ userId: z.string().min(1).max(100), allowed: z.boolean() }).strict().parse(input);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    demand(await tx.user.findFirst({ where: { id: actor.id, role: "OWNER", status: "APPROVED", archivedAt: null }, select: { id: true } }), "La autorización cambió.", 403);
    demand(await tx.aICourse.findFirst({ where: { id: courseId, archivedAt: null }, select: { id: true } }), "Curso no disponible.", 404);
    if (allowed) {
      demand(await tx.user.findFirst({ where: { ...eligible, id: userId }, select: { id: true } }), "Selecciona un Superadministrador activo.");
      await tx.aICourseViewer.createMany({ data: { courseId, userId }, skipDuplicates: true });
    } else {
      await tx.aICourseViewer.deleteMany({ where: { courseId, userId } });
    }
    await recordActivity(tx, { data: {
      actorId: actor.id, action: "CURSO_ACCESO_ACTUALIZADO", resourceId: courseId, detail: { userId, allowed },
    } });
  });
  return courseViewers(courseId);
}
