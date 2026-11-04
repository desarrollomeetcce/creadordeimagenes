import { hasAiModuleAccess } from "../roles";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { AppError, demand } from "../errors";
import { courseOwner, dispatchCourse } from "./service";
import { pollVideo } from "./video";
import { settingsSchema } from "./schema";
import { storeVideo, remove } from "../storage";
import type { Prisma } from "@prisma/client";
export async function pollVideoTask(id: string) {
  const token = randomUUID();
  const t = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    const t = await tx.aICourseTask.findUnique({
      where: { id },
      include: { course: true },
    });
    if (t?.status !== "RENDERING") return null;
    const b = t.input as any;
    if (
      b.remote?.pollAfter > Date.now() ||
      (t.leaseToken &&
        t.heartbeatAt &&
        t.heartbeatAt > new Date(Date.now() - 360000))
    )
      return "WAIT" as const;
    await tx.aICourseTask.update({
      where: { id },
      data: { leaseToken: token, heartbeatAt: new Date() },
    });
    return t;
  });
  if (!t) return "DONE" as const;
  if (t === "WAIT") return t;
  let path: string | null = null;
  try {
    await courseOwner({ id: t.actorId, role: "OWNER" });
    demand(!t.course.archivedAt, "El curso está archivado.", 409);
    const b = t.input as any;
    const bytes = await pollVideo(
      settingsSchema.parse(b.settings),
      b.remote,
      b.credentialRevision,
    );
    if (!bytes) {
      await db.aICourseTask.updateMany({
        where: { id, status: "RENDERING", leaseToken: token },
        data: {
          leaseToken: null,
          heartbeatAt: new Date(),
          input: {
            ...b,
            remote: { ...b.remote, pollAfter: Date.now() + 15000 },
          },
        },
      });
      return "WAIT" as const;
    }
    path = await storeVideo(bytes);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${t.actorId} FOR SHARE`;
      const u = await tx.user.findUnique({ where: { id: t.actorId } });
      demand(
        u?.role === "OWNER" &&
          u.status === "APPROVED" &&
          !u.archivedAt &&
          hasAiModuleAccess(u),
        "El permiso cambió.",
        403,
      );
      const task = await tx.aICourseTask.findFirst({
        where: {
          id,
          status: "RENDERING",
          leaseToken: token,
          course: { archivedAt: null },
        },
      });
      demand(task, "La solicitud dejó de estar vigente.", 409);
      const m = await tx.aICourseModule.findFirst({
        where: {
          id: b.module.id,
          courseId: t.courseId,
          revision: b.module.revision,
        },
      });
      demand(m, "El módulo cambió; se conserva el seguimiento del video.", 409);
      const exists = await tx.aICourseAsset.findUnique({
        where: {
          moduleId_revision_scene_kind: {
            moduleId: m.id,
            revision: m.revision,
            scene: b.scene,
            kind: "VIDEO",
          },
        },
      });
      if (!exists)
        await tx.aICourseAsset.create({
          data: {
            moduleId: m.id,
            revision: m.revision,
            scene: b.scene,
            kind: "VIDEO",
            path: path!,
            mime: "video/mp4",
          },
        });
      await tx.aICourseTask.update({
        where: { id },
        data: {
          status: "COMPLETED",
          leaseToken: null,
          heartbeatAt: new Date(),
        },
      });
      await tx.aICourse.update({
        where: { id: t.courseId },
        data: { revision: { increment: 1 } },
      });
    });
    const saved = await db.aICourseAsset.findFirst({ where: { path } });
    if (saved) path = null;
  } catch (e) {
    await db.aICourseTask.updateMany({
      where: { id, status: "RENDERING", leaseToken: token },
      data: {
        status: "NEEDS_REVIEW",
        leaseToken: null,
        error:
          e instanceof AppError
            ? e.message
            : "No se pudo recuperar el video. Conservamos el seguimiento; no se generó otro.",
      },
    });
  } finally {
    if (path && !(await db.aICourseAsset.count({ where: { path } })))
      await remove(path).catch(() => {});
  }
  return "DONE" as const;
}
export async function resumeVideo(
  actor: { id: string; role: string },
  courseId: string,
  id: string,
  dispatch = dispatchCourse,
) {
  await courseOwner(actor);
  const t = await db.aICourseTask.findFirst({
    where: {
      id,
      courseId,
      kind: "VIDEO",
      status: { in: ["UNCERTAIN", "NEEDS_REVIEW"] },
      course: { archivedAt: null },
    },
  });
  demand(
    t && (t.input as any).remote,
    "No hay un video pendiente de recuperar.",
    409,
  );
  const changed = await db.aICourseTask.updateMany({
    where: { id, status: t.status },
    data: {
      status: "RENDERING",
      leaseToken: null,
      error: null,
      heartbeatAt: new Date(),
    },
  });
  if (changed.count)
    try {
      await dispatch(id);
    } catch {
      await db.aICourseTask.updateMany({
        where: { id, status: "RENDERING" },
        data: {
          status: "UNCERTAIN",
          error:
            "No se confirmó la recuperación. El seguimiento sigue guardado.",
        },
      });
    }
  return { ok: true };
}
