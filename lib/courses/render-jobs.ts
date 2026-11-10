import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { load, storeVideo, remove } from "../storage";
import { courseOwner, courseTransactionOwner, courseModule } from "./service";
import { lessonSchema } from "./schema";
import { assertNoBuild } from "./builds";
type Actor = { id: string; role: string };
const select = {
  durationSeconds: true,
  sizeBytes: true,
  id: true,
  moduleId: true,
  revision: true,
  resolution: true,
  status: true,
  progress: true,
  error: true,
  assetId: true,
  createdAt: true,
} as const;
export async function classroomAccess(
  u: Actor,
  courseId: string,
  moduleId: string,
) {
  await courseOwner(u);
  demand(
    await db.aICourseModule.findFirst({
      where: { id: moduleId, courseId, course: { archivedAt: null } },
      select: { id: true },
    }),
    "Módulo no encontrado.",
    404,
  );
}
export async function renderStatus(
  u: Actor,
  courseId: string,
  moduleId: string,
) {
  await classroomAccess(u, courseId, moduleId);
  return {
    renders: await db.aICourseRender.findMany({
      where: { moduleId },
      select,
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    available: !process.env.VERCEL,
  };
}
export async function queueRender(
  u: Actor,
  courseId: string,
  moduleId: string,
  input: unknown,
) {
  await courseOwner(u);
  demand(
    !process.env.VERCEL,
    "La exportación requiere el worker del servidor con FFmpeg; no está disponible en funciones serverless.",
    409,
  );
  const b = z
    .object({
      requestId: z.uuid(),
      revision: z.number().int(),
      resolution: z.enum(["720p", "1080p"]),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    const m = await tx.aICourseModule.findFirst({
      where: { id: moduleId, courseId, course: { archivedAt: null } },
      include: { assets: true },
    });
    demand(m, "Módulo no encontrado.", 404);
    const requestId = u.id + ":" + b.requestId,
      old = await tx.aICourseRender.findUnique({ where: { requestId } });
    if (old) {
      demand(
        old.moduleId === moduleId &&
          old.revision === b.revision &&
          old.resolution === b.resolution,
        "La solicitud pertenece a otra exportación.",
        409,
      );
      return {
        render: await tx.aICourseRender.findUnique({
          where: { id: old.id },
          select,
        }),
      };
    }
    await assertNoBuild(tx, courseId);
    demand(
      !(await tx.aICourseTask.count({ where: { courseId, status: { in: ["PENDING", "RUNNING", "RENDERING"] } } })),
      "Espera a que termine la generación del contenido antes de exportar.",
      409,
    );
    demand(
      m.revision === b.revision,
      "La clase cambió. Vuelve a abrirla.",
      409,
    );
    const lesson = lessonSchema.parse(m.lesson);
    demand(
      !lesson.scenes.some((s) => s.kind === "presenter"),
      "El profesor visible requiere clips de video y su exportación local. Puedes usar pizarra con narración para exportar en servidor.",
      409,
    );
    demand(
      !m.assets.some((a) => a.revision === m.revision && a.kind === "VIDEO"),
      "Este exportador prepara pizarra, ilustraciones y demostraciones. Para clips de video utiliza la exportación local existente.",
      409,
    );
    demand(
      lesson.scenes.every((_, i) =>
        m.assets.some(
          (a) =>
            a.revision === m.revision && a.kind === "SPEECH" && a.scene === i,
        ),
      ),
      "Genera primero la narración de todas las escenas.",
      409,
    );
    const active = await tx.aICourseRender.findFirst({
      where: {
        moduleId,
        revision: m.revision,
        resolution: b.resolution,
        status: { in: ["PENDING", "RUNNING", "COMPLETED"] },
      },
      select,
    });
    if (active) return { render: active };
    demand(
      (await tx.aICourseRender.count({
        where: { status: { in: ["PENDING", "RUNNING"] } },
      })) < 100,
      "Hay demasiadas exportaciones pendientes.",
      429,
    );
    return {
      render: await tx.aICourseRender.create({
        data: {
          moduleId,
          actorId: u.id,
          requestId,
          revision: m.revision,
          resolution: b.resolution,
        },
        select,
      }),
    };
  });
}
export async function cancelRender(
  u: Actor,
  courseId: string,
  moduleId: string,
  id: string,
) {
  await courseModule(u, courseId, moduleId);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    await tx.aICourseRender.updateMany({
      where: { id, moduleId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "CANCELLED" },
    });
  });
  return { ok: true };
}
export async function processOneRender() {
  if (
    !(await db.aICourseRender.findFirst({
      where: { status: { in: ["PENDING", "RUNNING"] } },
      select: { id: true },
    }))
  )
    return false;
  const token = randomUUID(),
    job = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893128)`;
      await tx.aICourseRender.updateMany({
        where: {
          status: "RUNNING",
          heartbeatAt: { lt: new Date(Date.now() - 120000) },
        },
        data: {
          status: "FAILED",
          error:
            "El proceso se interrumpió. Puedes solicitar otra exportación sin volver a generar la voz.",
        },
      });
      if (await tx.aICourseRender.count({ where: { status: "RUNNING" } }))
        return null;
      const row = await tx.aICourseRender.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
      });
      if (!row) return null;
      return tx.aICourseRender.update({
        where: { id: row.id },
        data: { status: "RUNNING", leaseToken: token, heartbeatAt: new Date() },
      });
    });
  if (!job) return false;
  const abort = new AbortController();
  let saved: string | null = null,
    timer: ReturnType<typeof setInterval> | undefined,
    checking = false;
  const verify = async () => {
    if (checking) return;
    checking = true;
    try {
      await courseOwner({ id: job.actorId, role: "OWNER" });
      const current = await db.aICourseRender.findFirst({
        where: {
          id: job.id,
          status: "RUNNING",
          leaseToken: token,
          module: { revision: job.revision, course: { archivedAt: null } },
        },
      });
      demand(current, "La exportación se detuvo o la clase cambió.", 409);
      await db.aICourseRender.updateMany({
        where: { id: job.id, leaseToken: token, status: "RUNNING" },
        data: { heartbeatAt: new Date() },
      });
    } catch {
      abort.abort();
    } finally {
      checking = false;
    }
  };
  try {
    await verify();
    abort.signal.throwIfAborted();
    timer = setInterval(() => void verify(), 10000);
    const m = await db.aICourseModule.findUniqueOrThrow({
        where: { id: job.moduleId },
        include: { assets: true },
      }),
      lesson = lessonSchema.parse(m.lesson);
    const media = [];
    let mediaBytes = 0;
    for (let i = 0; i < lesson.scenes.length; i++) {
      const a = m.assets.find(
        (a) =>
          a.revision === job.revision && a.scene === i && a.kind === "SPEECH",
      );
      demand(a, "Falta una narración.", 409);
      const image = m.assets.find(
        (a) =>
          a.revision === job.revision && a.scene === i && a.kind === "IMAGE",
      );
      const item = {
        speech: await load(a.path),
        ...(image ? { image: await load(image.path) } : {}),
      };
      mediaBytes += item.speech.length + (item.image?.length ?? 0);
      demand(
        mediaBytes <= 80 * 1024 * 1024,
        "Divide el contenido en módulos más pequeños para exportar.",
        413,
      );
      media.push(item);
    }
    const { renderClassroom } = await import("./render-engine");
    const result = await renderClassroom(
      lesson,
      media,
      job.resolution as "720p" | "1080p",
      AbortSignal.any([abort.signal, AbortSignal.timeout(30 * 60000)]),
      async (progress) => {
        await db.aICourseRender.updateMany({
          where: { id: job.id, status: "RUNNING", leaseToken: token },
          data: { progress },
        });
      },
    );
    await verify();
    abort.signal.throwIfAborted();
    saved = await storeVideo(result.bytes);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
      await courseTransactionOwner(tx, { id: job.actorId, role: "OWNER" });
      demand(
        await tx.aICourseRender.findFirst({
          where: {
            id: job.id,
            status: "RUNNING",
            leaseToken: token,
            module: { revision: job.revision, course: { archivedAt: null } },
          },
        }),
        "La exportación dejó de estar vigente.",
        409,
      );
      const asset = await tx.aICourseAsset.upsert({
        where: {
          moduleId_revision_scene_kind: {
            moduleId: job.moduleId,
            revision: job.revision,
            scene: -1,
            kind: "RENDER_" + job.resolution,
          },
        },
        create: {
          moduleId: job.moduleId,
          revision: job.revision,
          scene: -1,
          kind: "RENDER_" + job.resolution,
          path: saved!,
          mime: "video/mp4",
        },
        update: { path: saved!, mime: "video/mp4" },
      });
      await tx.aICourseRender.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          durationSeconds: result.duration,
          sizeBytes: result.bytes.length,
          progress: 100,
          assetId: asset.id,
          leaseToken: null,
        },
      });
    });
    saved = null;
  } catch (e) {
    await db.aICourseRender.updateMany({
      where: { id: job.id, status: "RUNNING", leaseToken: token },
      data: {
        status: "FAILED",
        error:
          e instanceof Error ? e.message.slice(0, 300) : "No se pudo exportar.",
        leaseToken: null,
      },
    });
  } finally {
    if (timer) clearInterval(timer);
    if (saved) await remove(saved).catch(() => {});
  }
  return true;
}
