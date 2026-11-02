import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import type { Prisma } from "@prisma/client";
import {
  courseOwner,
  courseTransactionOwner,
  prepareTask,
  courseTasks,
} from "./service";
import { lessonSchema, materialOutput, settingsSchema } from "./schema";
import {
  resourcePlanSchema,
  resourceLabels,
  type ResourceChoice,
} from "./resources";
export const activeBuildStates = [
  "PENDING",
  "RUNNING",
  "STOPPING",
  "DISPATCH_UNCERTAIN",
];
export async function assertNoBuild(
  tx: Prisma.TransactionClient,
  courseId: string,
  allowed?: string,
) {
  const b = await tx.aICourseBuild.findFirst({
    where: { courseId, status: { in: activeBuildStates } },
    select: { id: true },
  });
  demand(
    !b || b.id === allowed,
    "Espera a que termine el desarrollo del curso o detenlo antes de editar.",
    409,
  );
}
const publicBuild = {
  id: true,
  status: true,
  moduleIndex: true,
  totalModules: true,
  completed: true,
  error: true,
  updatedAt: true,
} as const;
export async function buildStatus(
  u: { id: string; role: string },
  courseId: string,
) {
  await courseOwner(u);
  demand(
    await db.aICourse.findFirst({
      where: { id: courseId, archivedAt: null },
      select: { id: true },
    }),
    "Curso no encontrado.",
    404,
  );
  return {
    build: await db.aICourseBuild.findFirst({
      where: { courseId },
      select: publicBuild,
      orderBy: { createdAt: "desc" },
    }),
    tasks: await courseTasks(u, courseId),
  };
}
export async function startBuild(
  u: { id: string; role: string },
  courseId: string,
  input: unknown,
  dispatch = dispatchBuild,
) {
  await courseOwner(u);
  const b = z
    .object({
      requestId: z.uuid(),
      revision: z.number().int(),
      resources: resourcePlanSchema,
      modules: z
        .union([
          z.literal("all"),
          z
            .array(z.string())
            .min(1)
            .max(200)
            .refine(
              (ids) => new Set(ids).size === ids.length,
              "Módulos repetidos",
            ),
        ])
        .default("all"),
    })
    .strict()
    .parse(input);
  const r = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    const requestId = u.id + ":" + b.requestId,
      old = await tx.aICourseBuild.findUnique({ where: { requestId } });
    if (old) {
      demand(
        old.courseId === courseId &&
          JSON.stringify(
            resourcePlanSchema.parse(
              Array.isArray(old.resources)
                ? old.resources
                : (old.resources as any).items,
            ),
          ) === JSON.stringify(b.resources) &&
          (Array.isArray(old.resources)
            ? b.modules === "all"
            : JSON.stringify((old.resources as any).selection) ===
              JSON.stringify(b.modules)),
        "La solicitud pertenece a otro desarrollo.",
        409,
      );
      return { id: old.id, created: false };
    }
    await assertNoBuild(tx, courseId);
    const c = await tx.aICourse.findFirst({
      where: { id: courseId, archivedAt: null },
      include: {
        modules: { select: { id: true }, orderBy: { position: "asc" } },
      },
    });
    demand(
      c && c.revision === b.revision,
      "El curso cambió. Guarda y actualiza antes de desarrollar.",
      409,
    );
    demand(
      !(await tx.aICourseTask.count({
        where: {
          courseId,
          status: {
            in: [
              "PENDING",
              "RUNNING",
              "RENDERING",
              "UNCERTAIN",
              "DISPATCH_UNCERTAIN",
            ],
          },
        },
      })),
      "Hay solicitudes pendientes o sin confirmar. Revisa la actividad antes de desarrollar el curso.",
      409,
    );
    if (b.modules !== "all")
      demand(
        b.modules.every((id) => c.modules.some((m) => m.id === id)),
        "Selecciona módulos de este curso.",
      );
    for (const r of b.resources)
      if (r.modules !== "all")
        demand(
          r.modules.every((id) => c.modules.some((m) => m.id === id)),
          "Los recursos deben apuntar a módulos del curso.",
        );
    const settings = settingsSchema.parse(c.settings);
    demand(
      settings.model,
      "Selecciona un modelo de texto en la configuración del curso.",
      409,
    );
    if (b.resources.some((r) => r.kind === "audio" || r.kind === "video"))
      demand(
        settings.voiceModel && settings.voiceId,
        "Selecciona un modelo y una voz para narrar el curso.",
        409,
      );
    if (b.resources.some((r) => r.kind === "illustrations"))
      demand(settings.imageModel, "Selecciona un modelo de ilustración.", 409);
    if (b.resources.some((r) => r.kind === "videoScenes"))
      demand(settings.videoModel, "Selecciona un modelo de video IA.", 409);
    const creds = await tx.aICourseCredential.findMany({
        select: { provider: true, revision: true },
      }),
      revisions = Object.fromEntries(
        creds.map((c) => [c.provider, c.revision]),
      );
    const created = await tx.aICourseBuild.create({
      data: {
        courseId,
        actorId: u.id,
        requestId,
        resources: { items: b.resources, selection: b.modules },
        credentialRevisions: revisions,
        moduleIds: c.modules
          .filter((m) => b.modules === "all" || b.modules.includes(m.id))
          .map((m) => m.id),
        totalModules:
          b.modules === "all"
            ? c.modules.length || settingsSchema.parse(c.settings).moduleCount
            : b.modules.length,
      },
      select: { id: true },
    });
    return { ...created, created: true };
  });
  if (r.created)
    try {
      await dispatch(r.id);
    } catch {
      await db.aICourseBuild.updateMany({
        where: { id: r.id, status: "PENDING" },
        data: {
          status: "DISPATCH_UNCERTAIN",
          error:
            "No se confirmó el inicio. Actualiza el estado antes de autorizar otro desarrollo.",
        },
      });
    }
  return { id: r.id };
}
async function dispatchBuild(id: string) {
  const { start } = await import("workflow/api");
  const { courseBuildWorkflow } = await import("../../workflows/courses-ai");
  await start(courseBuildWorkflow, [id]);
}
export async function stopBuild(
  u: { id: string; role: string },
  courseId: string,
) {
  await courseOwner(u);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    await tx.aICourseBuild.updateMany({
      where: { courseId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "STOPPING" },
    });
    return { ok: true };
  });
}
export async function nextBuildStep(
  id: string,
): Promise<{ state: "DONE" | "NEXT" | "TASK"; taskId?: string }> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
      const b = await tx.aICourseBuild.findUniqueOrThrow({ where: { id } });
      if (!activeBuildStates.includes(b.status)) return { state: "DONE" };
      await courseTransactionOwner(tx, { id: b.actorId, role: "OWNER" });
      const c = await tx.aICourse.findFirst({
        where: { id: b.courseId, archivedAt: null },
        include: {
          modules: { select: { id: true }, orderBy: { position: "asc" } },
        },
      });
      demand(c, "Curso no disponible.", 409);
      if (b.currentTaskId) {
        if (b.status === "STOPPING") {
          const pending = await tx.aICourseTask.updateMany({
            where: { id: b.currentTaskId, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
          if (pending.count) {
            await tx.aICourseBuild.update({
              where: { id },
              data: { status: "CANCELLED", currentTaskId: null },
            });
            return { state: "DONE" };
          }
        }
        return { state: "TASK", taskId: b.currentTaskId };
      }
      if (b.status === "STOPPING") {
        await tx.aICourseBuild.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
        return { state: "DONE" };
      }
      if (b.status !== "RUNNING")
        await tx.aICourseBuild.update({
          where: { id },
          data: { status: "RUNNING", error: null },
        });
      const settings = settingsSchema.parse(c.settings),
        resources = resourcePlanSchema.parse(
          Array.isArray(b.resources) ? b.resources : (b.resources as any).items,
        );
      let ids = b.moduleIds as string[];
      const enqueue = async (
        kind: "OUTLINE" | "LESSON" | "MATERIAL" | "SPEECH" | "IMAGE" | "VIDEO",
        moduleId?: string,
        scene?: number,
        materialId?: string,
      ) => {
        const provider =
          kind === "SPEECH"
            ? settings.voiceProvider
            : kind === "IMAGE"
              ? settings.imageProvider
              : kind === "VIDEO"
                ? settings.videoProvider
                : settings.provider;
        const cred = await tx.aICourseCredential.findUnique({
          where: { provider },
          select: { revision: true },
        });
        demand(
          cred &&
            cred.revision ===
              (b.credentialRevisions as Record<string, number>)[provider],
          "La conexión IA cambió o falta configurarla. Se detuvo el desarrollo antes de otra solicitud.",
          409,
        );
        const t = await prepareTask(
          tx,
          { id: b.actorId, role: "OWNER" },
          c.id,
          {
            kind,
            moduleId,
            scene,
            materialId,
            revision: c.revision,
            requestId: randomUUID(),
          },
          b.id,
        );
        await tx.aICourseBuild.update({
          where: { id },
          data: { currentTaskId: t.id },
        });
        return { state: "TASK" as const, taskId: t.id };
      };
      if (!ids.length) {
        if (!c.modules.length) return enqueue("OUTLINE");
        ids = c.modules.map((m) => m.id);
        await tx.aICourseBuild.update({
          where: { id },
          data: { moduleIds: ids, totalModules: ids.length },
        });
      }
      if (b.moduleIndex >= ids.length) {
        await tx.aICourseBuild.update({
          where: { id },
          data: { status: "COMPLETED" },
        });
        return { state: "DONE" };
      }
      const m = await tx.aICourseModule.findFirst({
        where: { id: ids[b.moduleIndex], courseId: c.id },
        include: {
          materials: true,
          assets: {
            where: { revision: { gte: 1 } },
            select: { scene: true, kind: true, revision: true },
          },
        },
      });
      demand(m, "El módulo ya no está disponible.", 409);
      const lesson = lessonSchema.safeParse(m.lesson);
      if (!lesson.success) return enqueue("LESSON", m.id);
      const chosen = resources.filter(
        (r) => r.modules === "all" || r.modules.includes(m.id),
      );
      for (const r of chosen) {
        if (
          [
            "guide",
            "workshop",
            "exam",
            "book",
            "slides",
            "bibliography",
            "infographic",
          ].includes(r.kind)
        ) {
          const existing = m.materials.filter((x) => x.kind === r.kind),
            pending = existing.find(
              (x) => !materialOutput.safeParse(x.content).success,
            );
          if (pending) return enqueue("MATERIAL", m.id, undefined, pending.id);
          if (existing.length >= r.count) continue;
          if (r.kind === "slides" || r.kind === "bibliography") {
            let sections: { title: string; body: string }[];
            if (r.kind === "slides")
              sections = lesson.data.scenes.map((s) => ({
                title: s.title,
                body: s.steps.join("\n") + "\n\n" + s.narration,
              }));
            else {
              const refs = await tx.aICourseReference.findMany({
                where: { courseId: c.id },
                select: { name: true, url: true },
              });
              sections = [
                {
                  title: "Fuentes y lecturas",
                  body: refs.length
                    ? refs
                        .map((r) => r.name + (r.url ? " — " + r.url : ""))
                        .join("\n")
                    : lesson.data.references.length
                      ? lesson.data.references.join("\n")
                      : "No hay fuentes identificables incorporadas. Añade referencias y revisa las citas antes de publicar.",
                },
              ];
            }
            await tx.aICourseMaterial.create({
              data: {
                moduleId: m.id,
                kind: r.kind,
                title: resourceLabels[r.kind] + " · " + m.title,
                instructions: r.instructions,
                content: { sections, answerKey: "" },
              },
            });
            await tx.aICourseBuild.update({
              where: { id },
              data: { completed: { increment: 1 } },
            });
            return { state: "NEXT" };
          }
          const material = await tx.aICourseMaterial.create({
            data: {
              moduleId: m.id,
              kind: r.kind,
              title:
                resourceLabels[r.kind] +
                " " +
                (existing.length + 1) +
                " · " +
                m.title,
              instructions:
                r.instructions ||
                "Desarrolla este recurso para el módulo y el público del curso. Variante " +
                  (existing.length + 1),
              content: {},
            },
          });
          return enqueue("MATERIAL", m.id, undefined, material.id);
        }
      }
      for (let scene = 0; scene < lesson.data.scenes.length; scene++) {
        const kinds: ("SPEECH" | "IMAGE" | "VIDEO")[] = [];
        if (chosen.some((r) => r.kind === "video" || r.kind === "audio"))
          kinds.push("SPEECH");
        if (
          chosen.some((r) => r.kind === "illustrations") &&
          lesson.data.scenes[scene].illustrationPrompt
        )
          kinds.push("IMAGE");
        if (chosen.some((r) => r.kind === "videoScenes")) kinds.push("VIDEO");
        for (const kind of kinds)
          if (
            !m.assets.some(
              (a) =>
                a.scene === scene &&
                a.kind === kind &&
                a.revision === m.revision,
            )
          )
            return enqueue(kind, m.id, scene);
      }
      await tx.aICourseBuild.update({
        where: { id },
        data: { moduleIndex: { increment: 1 } },
      });
      return { state: "NEXT" };
    },
    { timeout: 15000 },
  );
}
export async function finishBuildTask(id: string, taskId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    const b = await tx.aICourseBuild.findUniqueOrThrow({ where: { id } });
    if (b.currentTaskId !== taskId) return;
    const task = await tx.aICourseTask.findUniqueOrThrow({
      where: { id: taskId },
    });
    if (["PENDING", "RUNNING", "RENDERING"].includes(task.status)) return false;
    if (task.status === "COMPLETED")
      await tx.aICourseBuild.update({
        where: { id },
        data: { currentTaskId: null, completed: { increment: 1 } },
      });
    else
      await tx.aICourseBuild.update({
        where: { id },
        data: {
          status: "NEEDS_REVIEW",
          error:
            task.error ??
            "La solicitud no se completó. No se reintentó automáticamente.",
        },
      });
  });
}
export async function interruptBuild(id: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    const b = await tx.aICourseBuild.findUnique({ where: { id } });
    if (!b || !activeBuildStates.includes(b.status)) return;
    if (b.currentTaskId)
      await tx.aICourseTask.updateMany({
        where: {
          id: b.currentTaskId,
          status: { in: ["PENDING", "RUNNING", "RENDERING"] },
        },
        data: {
          status: "UNCERTAIN",
          error:
            "El desarrollo se interrumpió. Revisa la solicitud; no se reintentó.",
        },
      });
    await tx.aICourseBuild.update({
      where: { id },
      data: {
        status: "NEEDS_REVIEW",
        error:
          "El desarrollo se detuvo. Revisa la conexión, el proveedor y la actividad antes de continuar; no se repitieron solicitudes.",
      },
    });
  });
}
