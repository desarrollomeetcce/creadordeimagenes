import type { Prisma, ProviderConfiguration } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { ownerOnly, fullProjectFilter, subproductFilter } from "./auth";
import { checkPlanAllowance } from "./membership-plans";
import { recordActivity } from "./activity";
export const engineSchema = z.enum(["ai", "propiox", "hybrid"]);
export type GenerationEngine = z.infer<typeof engineSchema>;
export const engineDefaults = {
  id: "global",
  aiEnabled: true,
  propioxEnabled: false,
  defaultEngine: "ai",
  quality: "high",
  resolution: "1024x1024",
  revision: 0,
};
export async function engineConfiguration(
  client: Pick<Prisma.TransactionClient, "generationEngineConfiguration"> = db,
) {
  return (
    (await client.generationEngineConfiguration.findUnique({
      where: { id: "global" },
    })) ?? engineDefaults
  );
}
export function requireEngine(
  config: Awaited<ReturnType<typeof engineConfiguration>>,
  requested: unknown,
): GenerationEngine {
  const engine = engineSchema.parse(requested ?? "ai");
  demand(engine === "ai", "PropioX y el modo híbrido se retiraron. Selecciona la generación con IA.",409);
  return engine;
}
export async function saveEngineConfiguration(
  actor: { id: string; role: string },
  input: unknown,
) {
  ownerOnly(actor);
  const b = z
    .object({
      aiEnabled: z.boolean(),
      propioxEnabled: z.boolean(),
      defaultEngine: engineSchema,
      quality: z.enum(["high", "medium", "low"]),
      resolution: z.enum([
        "1024x1024",
        "1536x1024",
        "1024x1536",
        "1536x1536",
        "2048x2048",
      ]),
      revision: z.number().int().min(0),
    })
    .strict()
    .parse(input);
  demand(b.aiEnabled&&!b.propioxEnabled&&b.defaultEngine==="ai","Solo está disponible la generación con IA.",409);
  requireEngine({ ...engineDefaults, ...b }, b.defaultEngine);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const account = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true, status: true },
    });
    demand(
      account?.status === "APPROVED" && account.role === "OWNER",
      "Los permisos de la cuenta cambiaron.",
      403,
    );
    const current = await engineConfiguration(tx);
    demand(
      current.revision === b.revision,
      "Los ajustes cambiaron. Recarga antes de guardar.",
      409,
    );
    const { revision, ...values } = b;
    const saved = await tx.generationEngineConfiguration.upsert({
      where: { id: "global" },
      create: { id: "global", ...values, revision: 1 },
      update: { ...values, revision: current.revision + 1 },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "MOTORES_GENERACION_ACTUALIZADOS",
        detail: {
          aiEnabled: b.aiEnabled,
          propioxEnabled: b.propioxEnabled,
          defaultEngine: b.defaultEngine,
        },
      },
    });
    return saved;
  });
}
/** A local runtime configuration contains no API credential or discovered AI model. */
export function propioxRuntime(
  config: Awaited<ReturnType<typeof engineConfiguration>>,
): ProviderConfiguration {
  return {
    id: "local-propiox",
    provider: "propiox",
    encryptedKey: null,
    maskedKey: null,
    revision: config.revision,
    verifiedRevision: null,
    verifiedAt: null,
    status: "LOCAL",
    error: null,
    models: [],
    imageModel: "PropioX",
    creativeModel: null,
    creativeProvider: null,
    alternatives: [],
    quality: config.quality,
    resolution: config.resolution,
    monthlyLimitMicros: 0n,
    dailyLimitMicros: 0n,
    operationLimitMicros: 0n,
    imageReserveMicros: 0n,
    maxGenerations: 1000,
    updatedAt: new Date(),
  };
}
export async function reservePropioxJobs(
  actorId: string,
  projectId: string,
  items: { subproductId?: string; key: string; snapshot: object }[],
  revision: number,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      const c = await engineConfiguration(tx);
      requireEngine(c, "propiox");
      demand(
        c.revision === revision,
        "PropioX cambió. Revisa y autoriza de nuevo.",
        409,
      );
      demand(
        items.length > 0 && items.length <= 1000,
        "La solicitud supera el máximo de generaciones.",
      );
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { id: true, status: true, role: true },
      });
      demand(
        actor?.status === "APPROVED" && actor.role !== "OBSERVER",
        "La cuenta ya no puede generar.",
        403,
      );
      const subIds = [
        ...new Set(
          items.flatMap((item) =>
            item.subproductId ? [item.subproductId] : [],
          ),
        ),
      ];
      const available = await tx.subproduct.count({
        where: {
          id: { in: subIds },
          AND: [subproductFilter(actor), { category: { projectId } }],
        },
      });
      demand(
        available === subIds.length,
        "Un subproducto ya no está disponible para generar.",
        404,
      );
      if (items.some((item) => !item.subproductId))
        demand(
          await tx.project.findFirst({
            where: {
              id: projectId,
              deletedAt: null,
              ...fullProjectFilter(actor),
            },
            select: { id: true },
          }),
          "Proyecto no disponible.",
          404,
        );
      const known = await tx.generationJob.findMany({
        where: { idempotencyKey: { in: items.map((i) => i.key) } },
      });
      demand(
        known.every((j) => j.actorId === actorId),
        "La solicitud ya existe.",
        409,
      );
      const fresh = items.filter(
        (i) => !known.some((j) => j.idempotencyKey === i.key),
      );
      await checkPlanAllowance(
        tx,
        actorId,
        fresh.length,
        0n,
        new Date(),
        false,
      );
      const jobs = [];
      for (const item of items) {
        const previous = known.find((j) => j.idempotencyKey === item.key);
        if (previous) {
          jobs.push(previous);
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
              engine: "propiox",
              engineRevision: c.revision,
              configRevision: c.revision,
              imageProvider: "propiox",
              imageModel: "PropioX",
              localQuality: c.quality,
              localResolution: c.resolution,
            },
            reservedMicros: 0n,
          },
        });
        await tx.usageLedger.create({
          data: {
            jobId: job.id,
            actorId,
            projectId,
            model: "PropioX",
            reservedMicros: 0n,
          },
        });
        jobs.push(job);
      }
      return jobs;
    },
    { timeout: 20000 },
  );
}
