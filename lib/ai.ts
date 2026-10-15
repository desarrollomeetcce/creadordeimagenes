import type { ProviderConfiguration } from "@prisma/client";
import { db } from "./db";
import { decryptKey } from "./crypto";
import { adapter, type ModelCapability } from "./providers";
import { demand } from "./errors";
export function safeConfiguration(c: ProviderConfiguration | null) {
  if (!c)
    return {
      provider: "openai",
      status: "NOT_CONFIGURED",
      models: [],
      alternatives: [],
      quality: "low",
      resolution: "1024x1024",
      monthlyLimitMicros: "0",
      dailyLimitMicros: "0",
      operationLimitMicros: "0",
      imageReserveMicros: "0",
      maxGenerations: 100,
    };
  const { encryptedKey: _key, ...safe } = c;
  if (
    safe.status === "VERIFIED" &&
    safe.verifiedAt &&
    Date.now() - safe.verifiedAt.getTime() >= 86400000
  )
    safe.status = "EXPIRED";
  return {
    ...safe,
    monthlyLimitMicros: String(c.monthlyLimitMicros),
    dailyLimitMicros: String(c.dailyLimitMicros),
    operationLimitMicros: String(c.operationLimitMicros),
    imageReserveMicros: String(c.imageReserveMicros),
  };
}
export async function configured() {
  const c = await db.providerConfiguration.findUnique({
    where: { id: "global" },
  });
  demand(
    c?.encryptedKey &&
      c.status === "VERIFIED" &&
      c.verifiedRevision === c.revision &&
      c.verifiedAt &&
      Date.now() - c.verifiedAt.getTime() < 86400000,
    "El OWNER debe guardar y verificar la conexión de IA (válida durante 24 horas).",
    409,
  );
  const models = c.models as ModelCapability[];
  const image = models.find((m) => m.id === c.imageModel && m.kind === "image");
  demand(
    image &&
      models.some((m) => m.id === c.creativeModel && m.kind === "creative"),
    "Selecciona modelos disponibles de imagen y dirección creativa.",
    409,
  );
  demand(
    image.qualities.includes(c.quality) &&
      image.resolutions.includes(c.resolution),
    "La calidad o resolución no es compatible.",
    409,
  );
  demand(
    c.imageReserveMicros > 0n,
    "Configura una reserva de costo por afiche, incluyendo dirección creativa.",
    409,
  );
  return c;
}
export async function reserveJobs(
  actorId: string,
  projectId: string,
  items: { subproductId?: string; key: string; snapshot: object }[],
  revision: number,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      const c = await tx.providerConfiguration.findUniqueOrThrow({
        where: { id: "global" },
      });
      demand(
        c.revision === revision &&
          c.status === "VERIFIED" &&
          c.verifiedRevision === revision,
        "La configuración cambió. Vuelve a verificarla.",
        409,
      );
      demand(
        items.length > 0 && items.length <= c.maxGenerations,
        "La operación supera el máximo de generaciones.",
      );
      const known = await tx.generationJob.findMany({
        where: { idempotencyKey: { in: items.map((i) => i.key) } },
      });
      demand(
        known.every((j) => j.actorId === actorId),
        "La solicitud ya existe.",
        409,
      );
      const pendingCount = items.filter(
        (i) => !known.some((j) => j.idempotencyKey === i.key),
      ).length;
      if (pendingCount === 0) return known;
      const total = c.imageReserveMicros * BigInt(pendingCount);
      demand(
        total > 0n && total <= c.operationLimitMicros,
        "La operación supera el presupuesto por operación.",
      );
      const now = new Date(),
        month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        day = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
      for (const [since, limit, label] of [
        [month, c.monthlyLimitMicros, "mensual"],
        [day, c.dailyLimitMicros, "diario"],
      ] as const) {
        const usage = await tx.usageLedger.aggregate({
          where: { createdAt: { gte: since }, status: { not: "RELEASED" } },
          _sum: { reservedMicros: true },
        });
        demand(
          (usage._sum.reservedMicros ?? 0n) + total <= limit,
          `Se supera el límite ${label} de reservas de consumo.`,
        );
      }
      const jobs = [];
      for (const item of items) {
        const existing = await tx.generationJob.findUnique({
          where: { idempotencyKey: item.key },
        });
        if (existing) {
          demand(existing.actorId === actorId, "La solicitud ya existe.", 409);
          jobs.push(existing);
          continue;
        }
        const job = await tx.generationJob.create({
          data: {
            actorId,
            projectId,
            subproductId: item.subproductId,
            idempotencyKey: item.key,
            snapshot: { ...item.snapshot, configRevision: revision },
            reservedMicros: c.imageReserveMicros,
          },
        });
        await tx.usageLedger.create({
          data: {
            jobId: job.id,
            actorId,
            projectId,
            model: c.imageModel!,
            reservedMicros: c.imageReserveMicros,
          },
        });
        jobs.push(job);
      }
      return jobs;
    },
    { timeout: 20000 },
  );
}
export async function connectionCheck() {
  const c = await db.providerConfiguration.findUniqueOrThrow({
    where: { id: "global" },
  });
  demand(c.encryptedKey, "Guarda una clave API antes de verificar.");
  try {
    const models = await adapter(c.provider).listModels(
      decryptKey(c.encryptedKey),
    );
    const result = await db.providerConfiguration.updateMany({
      where: { id: "global", revision: c.revision },
      data: {
        models,
        status: "VERIFIED",
        error: null,
        verifiedAt: new Date(),
        verifiedRevision: c.revision,
      },
    });
    demand(
      result.count,
      "La clave cambió durante la verificación. Repite la comprobación.",
      409,
    );
    return safeConfiguration(
      await db.providerConfiguration.findUnique({ where: { id: "global" } }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de conexión.";
    await db.providerConfiguration.updateMany({
      where: { id: "global", revision: c.revision },
      data: {
        status: "ERROR",
        error: message,
        verifiedAt: null,
        verifiedRevision: null,
        models: [],
      },
    });
    throw e;
  }
}
