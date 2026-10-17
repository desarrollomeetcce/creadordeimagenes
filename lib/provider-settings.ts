import type { ProviderConfiguration } from "@prisma/client";
import { db } from "./db";
import { ownerOnly } from "./auth";
import { demand } from "./errors";
import { encryptKey, maskKey } from "./crypto";
import { adapter, type ModelCapability } from "./providers";
import { safeConfiguration } from "./ai";
import { recordActivity } from "./activity";
type Actor = { id: string; role: string };
type Input = Pick<
  ProviderConfiguration,
  | "provider"
  | "quality"
  | "resolution"
  | "monthlyLimitMicros"
  | "dailyLimitMicros"
  | "operationLimitMicros"
  | "imageReserveMicros"
  | "maxGenerations"
> & {
  apiKey?: string;
  imageModel?: string | null;
  creativeModel?: string | null;
  creativeProvider?: string | null;
  alternatives: string[];
};
export async function aiConfigurationView(meta = false) {
  if (meta) {
    const row = await db.providerConfiguration.findUnique({
      where: { id: "global" },
      select: {
        id: true,
        provider: true,
        maskedKey: true,
        revision: true,
        verifiedRevision: true,
        verifiedAt: true,
        status: true,
        error: true,
        imageModel: true,
        creativeModel: true,
        creativeProvider: true,
        alternatives: true,
        quality: true,
        resolution: true,
        monthlyLimitMicros: true,
        dailyLimitMicros: true,
        operationLimitMicros: true,
        imageReserveMicros: true,
        maxGenerations: true,
        updatedAt: true,
      },
    });
    if (!row) {
      const { models: _models, ...base } = safeConfiguration(null);
      return {
        ...base,
        creativeStatus: "NOT_CONFIGURED",
        creativeVerifiedAt: null,
      };
    }
    const source =
      row.creativeProvider && row.creativeProvider !== row.provider
        ? await db.providerConnection.findUnique({
            where: { provider: row.creativeProvider },
            select: {
              status: true,
              verifiedAt: true,
              verifiedRevision: true,
              revision: true,
            },
          })
        : row;
    const valid =
      source?.status === "VERIFIED" &&
      source.verifiedRevision === source.revision &&
      source.verifiedAt &&
      Date.now() - source.verifiedAt.getTime() < 86400000;
    return {
      ...row,
      status:
        row.status === "VERIFIED" &&
        row.verifiedAt &&
        Date.now() - row.verifiedAt.getTime() >= 86400000
          ? "EXPIRED"
          : row.status,
      monthlyLimitMicros: String(row.monthlyLimitMicros),
      dailyLimitMicros: String(row.dailyLimitMicros),
      operationLimitMicros: String(row.operationLimitMicros),
      imageReserveMicros: String(row.imageReserveMicros),
      creativeStatus: valid
        ? "VERIFIED"
        : source?.status === "VERIFIED"
          ? "EXPIRED"
          : (source?.status ?? "NOT_CONFIGURED"),
      creativeVerifiedAt: source?.verifiedAt ?? null,
    };
  }
  const c = await db.providerConfiguration.findUnique({
    where: { id: "global" },
  });
  const provider = c?.creativeProvider ?? c?.provider ?? "openai";
  const profile =
    provider !== c?.provider
      ? await db.providerConnection.findUnique({ where: { provider } })
      : null;
  const source = provider === c?.provider ? c : profile;
  const valid =
    source?.status === "VERIFIED" &&
    source.verifiedRevision === source.revision &&
    source.verifiedAt &&
    Date.now() - source.verifiedAt.getTime() < 86400000;
  return {
    ...safeConfiguration(c),
    creativeModels: ((source?.models ?? []) as ModelCapability[]).filter(
      (m) => m.kind === "creative",
    ),
    creativeStatus: valid
      ? "VERIFIED"
      : source?.status === "VERIFIED"
        ? "EXPIRED"
        : (source?.status ?? "NOT_CONFIGURED"),
    creativeVerifiedAt: source?.verifiedAt ?? null,
  };
}
export async function saveAIConfiguration(
  user: Actor,
  b: Input,
  modelsOnly = false,
) {
  ownerOnly(user);
  adapter(b.provider);
  if (b.creativeProvider) adapter(b.creativeProvider);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const account = await tx.user.findUnique({
      where: { id: user.id },
      select: { role: true, status: true },
    });
    demand(
      account?.role === "OWNER" && account.status === "APPROVED",
      "La cuenta cambió. Inicia sesión nuevamente.",
      403,
    );
    const old = await tx.providerConfiguration.findUnique({
      where: { id: "global" },
    });
    if (modelsOnly)
      b = {
        ...b,
        monthlyLimitMicros: old?.monthlyLimitMicros ?? 0n,
        dailyLimitMicros: old?.dailyLimitMicros ?? 0n,
        operationLimitMicros: old?.operationLimitMicros ?? 0n,
        imageReserveMicros: old?.imageReserveMicros ?? 0n,
        maxGenerations: old?.maxGenerations ?? 10,
      };
    const profile = await tx.providerConnection.findUnique({
      where: { provider: b.provider },
    });
    const source = old?.provider === b.provider ? old : profile;
    demand(
      b.apiKey || source?.encryptedKey,
      "Introduce una clave o conecta este proveedor en Conexiones de IA.",
    );
    const changed = !!b.apiKey;
    const imageModels = changed
      ? []
      : ((source?.models ?? []) as ModelCapability[]);
    const creativeProvider = b.creativeProvider ?? b.provider;
    const creativeSource =
      creativeProvider === b.provider
        ? source
        : await tx.providerConnection.findUnique({
            where: { provider: creativeProvider },
          });
    const creativeModels = (creativeSource?.models ?? []) as ModelCapability[];
    if (!changed && source?.status === "VERIFIED") {
      if (b.imageModel) {
        const image = imageModels.find(
          (m) => m.kind === "image" && m.id === b.imageModel,
        );
        demand(
          image &&
            image.qualities.includes(b.quality) &&
            image.resolutions.includes(b.resolution),
          "Modelo o parámetros de imagen incompatibles.",
        );
      }
      if (b.creativeModel)
        demand(
          creativeModels.some(
            (m) => m.id === b.creativeModel && m.kind === "creative",
          ),
          "El modelo creativo no está disponible.",
        );
      demand(
        b.alternatives.every((id) =>
          imageModels.some((m) => m.id === id && m.kind === "image"),
        ),
        "Un modelo alternativo no está disponible.",
      );
    }
    const { apiKey, ...data } = b;
    const encryptedKey = apiKey ? encryptKey(apiKey) : source!.encryptedKey!,
      maskedKey = apiKey ? maskKey(apiKey) : source!.maskedKey;
    const reset = changed
      ? { models: [], imageModel: null, creativeModel: null, alternatives: [] }
      : {};
    await tx.providerConfiguration.upsert({
      where: { id: "global" },
      create: {
        ...data,
        ...reset,
        encryptedKey,
        maskedKey,
        models: changed ? [] : imageModels,
        status: "UNVERIFIED",
      },
      update: {
        ...data,
        ...reset,
        encryptedKey,
        maskedKey,
        models: changed ? [] : imageModels,
        revision: { increment: 1 },
        status: "UNVERIFIED",
        verifiedAt: null,
        verifiedRevision: null,
        error: null,
      },
    });
    if (changed || !profile)
      await tx.providerConnection.upsert({
        where: { provider: b.provider },
        create: {
          provider: b.provider,
          encryptedKey,
          maskedKey,
          status: "UNVERIFIED",
        },
        update: {
          encryptedKey,
          maskedKey,
          models: [],
          status: "UNVERIFIED",
          verifiedAt: null,
          verifiedRevision: null,
          error: null,
          revision: { increment: 1 },
        },
      });
    await recordActivity(tx, {
      data: { actorId: user.id, action: "CONFIGURACION_IA_GUARDADA" },
    });
  });
  return aiConfigurationView();
}

// Solo metadatos públicos: una prueba anterior no acredita otro proveedor.
export async function latestConnectionTest() {
  const job = await db.generationJob.findFirst({
    where: { projectId: "connection-test" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      status: true,
      error: true,
      createdAt: true,
      completedAt: true,
      snapshot: true,
    },
  });
  if (!job) return null;
  const snapshot = job.snapshot as Record<string, unknown>;
  const { snapshot: _privateSnapshot, ...visible } = job;
  return {
    ...visible,
    provider:
      typeof snapshot.imageProvider === "string"
        ? snapshot.imageProvider
        : "openai",
    model: typeof snapshot.imageModel === "string" ? snapshot.imageModel : null,
  };
}

export async function saveAIBudgets(
  user: Actor,
  data: Pick<
    Input,
    | "monthlyLimitMicros"
    | "dailyLimitMicros"
    | "operationLimitMicros"
    | "imageReserveMicros"
    | "maxGenerations"
  >,
) {
  ownerOnly(user);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const actor = await tx.user.findUnique({
      where: { id: user.id },
      select: { role: true, status: true },
    });
    demand(
      actor?.role === "OWNER" && actor.status === "APPROVED",
      "La autorización cambió.",
      403,
    );
    demand(
      await tx.providerConfiguration.findUnique({
        where: { id: "global" },
        select: { id: true },
      }),
      "Guarda primero la conexión del proveedor.",
      409,
    );
    await tx.providerConfiguration.update({ where: { id: "global" }, data });
    await recordActivity(tx, {
      data: { actorId: user.id, action: "LIMITES_IA_GUARDADOS" },
    });
  });
  return aiConfigurationView();
}
