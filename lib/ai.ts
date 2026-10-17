import {
  creativeConnection,
  capabilityFingerprint,
} from "./provider-connections";
import type { ProviderConfiguration } from "@prisma/client";
import { db } from "./db";
import { decryptKey } from "./crypto";
import { adapter, type ModelCapability } from "./providers";
import { demand } from "./errors";
import { checkReservationBudget } from "./reservation-budget";
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
    image,
    "Selecciona modelos disponibles de imagen y dirección creativa.",
    409,
  );
  await creativeConnection(c);
  demand(
    image.qualities.includes(c.quality) &&
      image.resolutions.includes(c.resolution),
    "La calidad o resolución no es compatible.",
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
        items.length > 0 && items.length <= 1000,
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
      if (pendingCount === 0)
        return items.map((item) =>
          known.find((job) => job.idempotencyKey === item.key)!,
        );
      const capabilities = c.models as ModelCapability[];
      const imageCapability = capabilities.find(
        (m) => m.kind === "image" && m.id === c.imageModel,
      );
      const creative =
        c.creativeProvider && c.creativeProvider !== c.provider
          ? await creativeConnection(c, tx)
          : null;
      const creativeCapability =
        creative?.model ??
        capabilities.find(
          (m) => m.kind === "creative" && m.id === c.creativeModel,
        );
      const providerSnapshot = {
        ...(imageCapability
          ? {
              imageCapabilityFingerprint:
                capabilityFingerprint(imageCapability),
            }
          : {}),
        ...(creativeCapability
          ? {
              creativeCapabilityFingerprint:
                capabilityFingerprint(creativeCapability),
            }
          : {}),
        imageProvider: c.provider,
        imageModel: c.imageModel,
        creativeModel: c.creativeModel,
        creativeProvider: c.creativeProvider ?? c.provider,
        creativeConnectionRevision: creative?.revision ?? c.revision,
      };
      const reserve = await checkReservationBudget(
        tx,
        c,
        actorId,
        projectId,
        pendingCount,
      );
      for (const item of items) {
        const snapshot = item.snapshot as Record<string, unknown>;
        if (typeof snapshot.editVariationId === "string") {
          const active = await tx.generationJob.findFirst({
            where: {
              status: { in: ["PENDING", "RUNNING"] },
              snapshot: {
                path: ["editVariationId"],
                equals: snapshot.editVariationId,
              },
            },
          });
          demand(
            !active,
            "Este afiche ya tiene una edición de IA en curso. Espera su resultado antes de otra.",
            409,
          );
        }
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
            snapshot: {
              ...item.snapshot,
              ...providerSnapshot,
              configRevision: revision,
            },
            reservedMicros: reserve,
          },
        });
        await tx.usageLedger.create({
          data: {
            jobId: job.id,
            actorId,
            projectId,
            model: c.imageModel!,
            reservedMicros: reserve,
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
      (c.models as ModelCapability[])[0]?.discoveryQuery,
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
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      const current = await tx.providerConfiguration.findUnique({
        where: { id: "global" },
      });
      if (
        current?.revision !== c.revision ||
        current.encryptedKey !== c.encryptedKey ||
        current.status !== "VERIFIED"
      )
        return;
      const profile = await tx.providerConnection.findUnique({
        where: { provider: c.provider },
      });
      if (profile && profile.encryptedKey !== c.encryptedKey) return;
      await tx.providerConnection.upsert({
        where: { provider: c.provider },
        create: {
          provider: c.provider,
          encryptedKey: c.encryptedKey,
          maskedKey: c.maskedKey,
          models,
          status: "VERIFIED",
          verifiedAt: current.verifiedAt,
          verifiedRevision: 1,
        },
        update: {
          models,
          status: "VERIFIED",
          verifiedAt: current.verifiedAt,
          verifiedRevision: profile?.revision ?? 1,
          error: null,
        },
      });
    });
    return safeConfiguration(
      await db.providerConfiguration.findUnique({ where: { id: "global" } }),
    );
  } catch (e) {
    const message =
      e instanceof (await import("./errors")).AppError
        ? e.message
        : "No se pudo consultar el catálogo del proveedor.";
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
