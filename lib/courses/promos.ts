import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { courseOwner, courseTransactionOwner, prepareTask } from "./service";
import { assertNoBuild } from "./builds";
import { settingsSchema, lessonSchema, parseGenerated } from "./schema";
import {
  requireModel,
  generateText,
  speech,
  CourseOutputError,
} from "./providers";
import { teachingDirection } from "./teaching";
import { store, remove } from "../storage";
export const promoActiveStates = [
  "PENDING",
  "RUNNING",
  "STOPPING",
  "DISPATCH_UNCERTAIN",
];
export const promoMeta = {
  id: true,
  batchId: true,
  moduleId: true,
  scope: true,
  title: true,
  seconds: true,
  status: true,
  error: true,
  revision: true,
  updatedAt: true,
} as const;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function startPromos(
  u: { id: string; role: string },
  courseId: string,
  input: unknown,
  dispatch = dispatchPromos,
) {
  await courseOwner(u);
  const b = z
    .object({
      requestId: z.uuid(),
      revision: z.number().int(),
      scope: z.enum(["course", "modules"]),
      modules: z
        .union([z.literal("all"), z.array(z.string()).min(1).max(200)])
        .default("all"),
      seconds: z.number().int().min(15).max(90),
      cta: z.string().trim().max(300),
    })
    .strict()
    .parse(input);
  const result = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
      await courseTransactionOwner(tx, u);
      const batchId = u.id + ":" + b.requestId,
        old = await tx.aICoursePromo.findMany({
          where: { batchId },
          select: { ...promoMeta, courseId: true, cta: true, context: true },
        });
      if (old.length) {
        demand(
          old.every(
            (p) =>
              p.courseId === courseId &&
              p.scope === b.scope &&
              p.seconds === b.seconds &&
              p.cta === b.cta &&
              JSON.stringify((p.context as any).selection) ===
                JSON.stringify(b.modules),
          ),
          "La solicitud ya pertenece a otros clips.",
          409,
        );
        return { ids: old.map((p) => p.id), created: false };
      }
      await assertNoBuild(tx, courseId);
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
        "Revisa los trabajos pendientes o inciertos antes de generar clips.",
        409,
      );
      const c = await tx.aICourse.findFirst({
        where: { id: courseId, archivedAt: null },
        include: {
          modules: {
            select: { id: true, title: true, brief: true },
            orderBy: { position: "asc" },
          },
        },
      });
      demand(
        c && c.revision === b.revision,
        "El curso cambió. Guarda y actualiza antes de crear clips.",
        409,
      );
      const settings = settingsSchema.parse(c.settings),
        text = await requireModel(settings.provider, settings.model, "text"),
        voice = await requireModel(
          settings.voiceProvider,
          settings.voiceModel,
          "speech",
        );
      demand(
        (voice.voices as any[]).some((v) => v.id === settings.voiceId),
        "Selecciona una voz disponible.",
        409,
      );
      const revisions = {
        [settings.provider]: text.revision,
        [settings.voiceProvider]: voice.revision,
      };
      const selected =
        b.modules === "all"
          ? c.modules
          : c.modules.filter((m) => b.modules.includes(m.id));
      if (b.scope === "modules")
        demand(
          selected.length > 0 &&
            (b.modules === "all" || selected.length === b.modules.length),
          "Selecciona módulos de este curso.",
        );
      const targets = b.scope === "course" ? [null] : selected,
        ids: string[] = [];
      for (const m of targets) {
        const p = await tx.aICoursePromo.create({
          data: {
            courseId,
            moduleId: m?.id,
            actorId: u.id,
            batchId,
            requestId: batchId + ":" + (m?.id ?? "course"),
            scope: b.scope,
            title: m ? "Avance · " + m.title : "Tráiler · " + c.title,
            seconds: b.seconds,
            cta: b.cta,
            settings: json(settings),
            credentialRevisions: revisions,
            context: json({
              course: {
                title: c.title,
                description: c.description,
                prompt: c.prompt,
                kind: c.kind,
              },
              module: m,
              outline: c.modules,
              selection: b.modules,
            }),
          },
          select: { id: true },
        });
        ids.push(p.id);
      }
      await tx.aICourse.update({
        where: { id: courseId },
        data: { revision: { increment: 1 } },
      });
      return { ids, created: true };
    },
    { timeout: 15000 },
  );
  if (result.created)
    try {
      await dispatch(result.ids);
    } catch {
      await db.aICoursePromo.updateMany({
        where: { id: { in: result.ids }, status: "PENDING" },
        data: {
          status: "DISPATCH_UNCERTAIN",
          error:
            "No se confirmó el inicio. Revisa los clips antes de volver a generar; no se reintentó.",
        },
      });
    }
  return result;
}
async function dispatchPromos(ids: string[]) {
  const { start } = await import("workflow/api"),
    { coursePromosWorkflow } = await import("../../workflows/courses-ai");
  await start(coursePromosWorkflow, [ids]);
}
export async function preparePromoTask(
  tx: Prisma.TransactionClient,
  u: { id: string; role: string },
  courseId: string,
  b: any,
) {
  const p = await tx.aICoursePromo.findFirst({
    where: { id: b.promoId, courseId },
  });
  demand(p, "Clip no encontrado.", 404);
  const s = settingsSchema.parse(p.settings),
    kind = b.kind === "PROMO_SCRIPT" ? "text" : "speech",
    provider = kind === "text" ? s.provider : s.voiceProvider,
    model = kind === "text" ? s.model : s.voiceModel,
    revision = (p.credentialRevisions as any)[provider];
  await requireModel(provider, model, kind, revision);
  let narration = "";
  if (kind === "speech") {
    const lesson = lessonSchema.parse(p.lesson);
    demand(
      b.scene !== undefined && lesson.scenes[b.scene],
      "Escena de clip no disponible.",
    );
    narration = lesson.scenes[b.scene].narration;
  }
  return tx.aICourseTask
    .create({
      data: {
        actorId: u.id,
        courseId,
        requestId: u.id + ":" + b.requestId,
        kind: b.kind,
        input: json({
          ...b,
          settings: s,
          credentialRevision: revision,
          promo: {
            id: p.id,
            revision: p.revision,
            title: p.title,
            seconds: p.seconds,
            cta: p.cta,
          },
          context: p.context,
          narration,
        }),
      },
      select: { id: true },
    })
    .then((t) => ({ ...t, created: true }));
}
export async function processPromoTask(
  t: {
    id: string;
    actorId: string;
    courseId: string;
    kind: string;
    input: unknown;
  },
  token: string,
) {
  const b = t.input as any,
    s = settingsSchema.parse(b.settings);
  let path: string | null = null,
    usage: unknown = {};
  try {
    let output: unknown,
      mime = "audio/mpeg";
    if (t.kind === "PROMO_SCRIPT") {
      const r = await generateText(
        s.provider,
        s.model,
        teachingDirection(s) +
          "\nCrea un tráiler promocional original y atractivo, con un gancho inicial, qué aprenderás y beneficios concretos de este curso o módulo. Nunca inventes títulos acreditados, fechas, descuentos, testimonios, precios ni resultados garantizados. Usa solo el contexto aportado. Incluye literalmente la llamada a la acción. Duración objetivo " +
          b.promo.seconds +
          " segundos, de1 a3 escenas con narración breve adecuada al tiempo. Cada escena tipo slides,whiteboard,story o animation. Devuelve JSON {objectives:[...],scenes:[{title,kind,narration,steps:[...]}],exercise:'',solution:'',references:[]}.\nCTA: " +
          b.promo.cta +
          "\nContexto: " +
          JSON.stringify(b.context),
        b.credentialRevision,
      );
      usage = r.usage;
      output = parseGenerated(
        r.text,
        lessonSchema.extend({ scenes: lessonSchema.shape.scenes.max(3) }),
      );
    } else {
      const r = await speech(
        s.voiceProvider,
        s.voiceModel,
        s.voiceId,
        b.narration,
        b.credentialRevision,
        s.voiceSpeed,
        s.tone,
      );
      path = await store(r.bytes);
      mime = r.mime;
    }
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
      await courseTransactionOwner(tx, { id: t.actorId, role: "OWNER" });
      const active = await tx.aICourseTask.findFirst({
        where: {
          id: t.id,
          status: "RUNNING",
          leaseToken: token,
          course: { archivedAt: null },
        },
      });
      demand(active, "El trabajo dejó de estar vigente.", 409);
      const p = await tx.aICoursePromo.findFirst({
        where: {
          id: b.promo.id,
          courseId: t.courseId,
          revision: b.promo.revision,
        },
      });
      demand(p, "El clip cambió durante la generación.", 409);
      if (t.kind === "PROMO_SCRIPT")
        await tx.aICoursePromo.update({
          where: { id: p.id },
          data: { lesson: json(output), revision: { increment: 1 } },
        });
      else
        await tx.aICoursePromoAsset.create({
          data: {
            promoId: p.id,
            revision: p.revision,
            scene: b.scene,
            kind: "SPEECH",
            path: path!,
            mime,
          },
        });
      await tx.aICourseTask.update({
        where: { id: t.id },
        data: {
          status: "COMPLETED",
          usage: json(usage),
          leaseToken: null,
          heartbeatAt: new Date(),
        },
      });
    });
  } catch (e) {
    throw new CourseOutputError(
      e instanceof Error
        ? e.message
        : "El clip no pudo completarse; no se reintentó.",
      usage,
    );
  } finally {
    if (
      path &&
      !(await db.aICoursePromoAsset.findFirst({
        where: { path },
        select: { id: true },
      }))
    )
      await remove(path).catch(() => {});
  }
  return "DONE" as const;
}
export async function nextPromoTask(
  id: string,
): Promise<{ state: "DONE" | "TASK" | "WAIT" | "FAIL"; taskId?: string }> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
      let p = await tx.aICoursePromo.findUniqueOrThrow({ where: { id } });
      if (
        !promoActiveStates.includes(p.status) ||
        p.status === "DISPATCH_UNCERTAIN"
      )
        return { state: p.status === "NEEDS_REVIEW" ? "FAIL" : "DONE" };
      await courseTransactionOwner(tx, { id: p.actorId, role: "OWNER" });
      if (p.currentTaskId) {
        const t = await tx.aICourseTask.findUniqueOrThrow({
          where: { id: p.currentTaskId },
        });
        if (["PENDING", "RUNNING", "RENDERING"].includes(t.status))
          return { state: "TASK", taskId: t.id };
        if (t.status !== "COMPLETED") {
          await tx.aICoursePromo.update({
            where: { id },
            data: {
              status: p.status === "STOPPING" ? "CANCELLED" : "NEEDS_REVIEW",
              error: t.error ?? "Revisa la generación. No se reintentó.",
            },
          });
          return { state: "FAIL" };
        }
        p = await tx.aICoursePromo.update({
          where: { id },
          data: { currentTaskId: null },
        });
      }
      if (p.status === "STOPPING") {
        await tx.aICoursePromo.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
        return { state: "DONE" };
      }
      const lesson = lessonSchema.safeParse(p.lesson);
      let kind: "PROMO_SCRIPT" | "PROMO_SPEECH" = "PROMO_SCRIPT",
        scene: number | undefined;
      if (lesson.success) {
        kind = "PROMO_SPEECH";
        const assets = await tx.aICoursePromoAsset.findMany({
          where: { promoId: id, revision: p.revision },
          select: { scene: true },
        });
        scene = lesson.data.scenes.findIndex(
          (_, i) => !assets.some((a) => a.scene === i),
        );
        if (scene < 0) {
          await tx.aICoursePromo.update({
            where: { id },
            data: { status: "COMPLETED" },
          });
          return { state: "DONE" };
        }
      }
      const c = await tx.aICourse.findUniqueOrThrow({
        where: { id: p.courseId },
        select: { revision: true },
      });
      const t = await prepareTask(
        tx,
        { id: p.actorId, role: "OWNER" },
        p.courseId,
        {
          kind,
          promoId: id,
          scene,
          requestId: randomUUID(),
          revision: c.revision,
        },
        id,
      );
      await tx.aICoursePromo.update({
        where: { id },
        data: { status: "RUNNING", currentTaskId: t.id },
      });
      return { state: "TASK", taskId: t.id };
    },
    { timeout: 15000 },
  );
}
export async function interruptPromos(ids: string[]) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    const rows = await tx.aICoursePromo.findMany({
      where: { id: { in: ids }, status: { in: promoActiveStates } },
    });
    for (const p of rows) {
      let uncertain = false;
      if (p.currentTaskId) {
        await tx.aICourseTask.updateMany({
          where: { id: p.currentTaskId, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        const running = await tx.aICourseTask.updateMany({
          where: {
            id: p.currentTaskId,
            status: { in: ["RUNNING", "RENDERING"] },
          },
          data: {
            status: "UNCERTAIN",
            error:
              "El clip se interrumpió. Revisa el proveedor; no se reintentó.",
          },
        });
        const task = await tx.aICourseTask.findUnique({
          where: { id: p.currentTaskId },
          select: { status: true },
        });
        uncertain =
          !!running.count ||
          ["UNCERTAIN", "NEEDS_REVIEW"].includes(task?.status ?? "");
      }
      await tx.aICoursePromo.update({
        where: { id: p.id },
        data: {
          status: uncertain ? "NEEDS_REVIEW" : "CANCELLED",
          error: uncertain
            ? "Revisa la actividad antes de generar otra vez."
            : null,
        },
      });
    }
  });
}
export async function stopPromos(
  u: { id: string; role: string },
  courseId: string,
  batchId: string,
) {
  await courseOwner(u);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    const ps = await tx.aICoursePromo.findMany({
      where: { courseId, batchId, status: { in: promoActiveStates } },
    });
    for (const p of ps) {
      if (p.currentTaskId)
        await tx.aICourseTask.updateMany({
          where: { id: p.currentTaskId, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
      await tx.aICoursePromo.update({
        where: { id: p.id },
        data: { status: p.currentTaskId ? "STOPPING" : "CANCELLED" },
      });
    }
  });
  return { ok: true };
}
export async function promoDetail(
  u: { id: string; role: string },
  courseId: string,
  id: string,
) {
  await courseOwner(u);
  const p = await db.aICoursePromo.findFirst({
    where: { id, courseId, course: { archivedAt: null } },
    select: {
      ...promoMeta,
      lesson: true,
      settings: true,
      assets: { select: { id: true, revision: true, scene: true, kind: true } },
    },
  });
  demand(p, "Clip no encontrado.", 404);
  const s = settingsSchema.parse(p.settings);
  return {
    ...p,
    settings: {
      exportAspect: s.exportAspect,
      exportResolution: s.exportResolution,
    },
  };
}
