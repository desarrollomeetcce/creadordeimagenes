import type {
  Prisma,
  ProviderConfiguration,
  ProviderConnection,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { ownerOnly } from "./auth";
import { AppError, demand } from "./errors";
import { encryptKey, decryptKey, maskKey } from "./crypto";
import { adapter, providers, type ModelCapability } from "./providers";
import { recordActivity } from "./activity";
type Actor = { id: string; role: string };
const stale = (row: {
  status: string;
  verifiedAt: Date | null;
  verifiedRevision: number | null;
  revision: number;
}) =>
  row.status !== "VERIFIED" ||
  row.verifiedRevision !== row.revision ||
  !row.verifiedAt ||
  Date.now() - row.verifiedAt.getTime() >= 86400000;
export function publicConnection(
  provider: string,
  row: ProviderConnection | null,
  models = true,
) {
  return {
    provider,
    configured: !!row?.encryptedKey,
    maskedKey: row?.maskedKey ?? null,
    revision: row?.revision ?? 0,
    status:
      row?.status === "VERIFIED" && stale(row)
        ? "EXPIRED"
        : (row?.status ?? "NOT_CONFIGURED"),
    verifiedAt: row?.verifiedAt ?? null,
    verifiedRevision: row?.verifiedRevision ?? null,
    error: row?.error ?? null,
    modelCount: Array.isArray(row?.models) ? row.models.length : 0,
    ...(models ? { models: row?.models ?? [] } : {}),
  };
}
async function checkOwner(tx: Prisma.TransactionClient, user: Actor) {
  const row = await tx.user.findUnique({
    where: { id: user.id },
    select: { role: true, status: true },
  });
  demand(
    row?.role === "OWNER" && row.status === "APPROVED",
    "La cuenta cambió. Inicia sesión nuevamente.",
    403,
  );
}
export async function connections(user: Actor, provider?: string) {
  ownerOnly(user);
  if (provider) {
    adapter(provider);
    return publicConnection(
      provider,
      await db.providerConnection.findUnique({ where: { provider } }),
    );
  }
  const rows = await db.providerConnection.findMany();
  return providers.map((p) => ({
    ...p,
    ...publicConnection(
      p.id,
      rows.find((r) => r.provider === p.id) ?? null,
      false,
    ),
  }));
}
export async function saveConnection(user: Actor, input: unknown) {
  ownerOnly(user);
  const b = z
    .object({
      provider: z.string().max(80),
      apiKey: z.string().trim().min(10).max(1000),
    })
    .strict()
    .parse(input);
  adapter(b.provider);
  const encryptedKey = encryptKey(b.apiKey),
    maskedKey = maskKey(b.apiKey);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await checkOwner(tx, user);
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
    const current = await tx.providerConfiguration.findUnique({
      where: { id: "global" },
    });
    if (current?.provider === b.provider)
      await tx.providerConfiguration.update({
        where: { id: "global" },
        data: {
          encryptedKey,
          maskedKey,
          models: [],
          imageModel: null,
          alternatives: [],
          ...(current.creativeProvider &&
          current.creativeProvider !== b.provider
            ? {}
            : { creativeModel: null }),
          status: "UNVERIFIED",
          verifiedAt: null,
          verifiedRevision: null,
          error: null,
          revision: { increment: 1 },
        },
      });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: "PROVEEDOR_IA_GUARDADO",
        detail: { provider: b.provider },
      },
    });
  });
  return connections(user, b.provider);
}
export async function deleteConnection(user: Actor, provider: string) {
  ownerOnly(user);
  adapter(provider);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await checkOwner(tx, user);
    await tx.providerConnection.updateMany({
      where: { provider },
      data: {
        encryptedKey: null,
        maskedKey: null,
        models: [],
        status: "NOT_CONFIGURED",
        verifiedAt: null,
        verifiedRevision: null,
        error: null,
        revision: { increment: 1 },
      },
    });
    const current = await tx.providerConfiguration.findUnique({
      where: { id: "global" },
    });
    if (current?.provider === provider)
      await tx.providerConfiguration.update({
        where: { id: "global" },
        data: {
          encryptedKey: null,
          maskedKey: null,
          models: [],
          imageModel: null,
          alternatives: [],
          ...(current.creativeProvider && current.creativeProvider !== provider
            ? {}
            : { creativeModel: null }),
          status: "NOT_CONFIGURED",
          verifiedAt: null,
          verifiedRevision: null,
          error: null,
          revision: { increment: 1 },
        },
      });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: "PROVEEDOR_IA_ELIMINADO",
        detail: { provider },
      },
    });
  });
  return { ok: true };
}
export async function verifyConnection(
  user: Actor,
  provider: string,
  query = "",
) {
  ownerOnly(user);
  query = z
    .string()
    .trim()
    .max(100)
    .regex(/^[\p{L}\p{N}._ /-]*$/u)
    .parse(query);
  demand(
    !/(?:sk-|r8_|AIza)[a-zA-Z0-9_-]{16,}/.test(query),
    "Escribe un nombre de modelo, no una clave API.",
  );
  adapter(provider);
  const before = await db.providerConnection.findUnique({
    where: { provider },
  });
  demand(
    before?.encryptedKey,
    "Guarda primero la clave de este proveedor.",
    409,
  );
  try {
    const models = (
      await adapter(provider).listModels(decryptKey(before.encryptedKey), query)
    ).map((model) => ({
      ...model,
      ...(query ? { discoveryQuery: query } : {}),
    }));
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      await checkOwner(tx, user);
      const updated = await tx.providerConnection.updateMany({
        where: { provider, revision: before.revision },
        data: {
          models,
          status: "VERIFIED",
          verifiedAt: new Date(),
          verifiedRevision: before.revision,
          error: null,
        },
      });
      demand(
        updated.count,
        "La credencial cambió durante la consulta. Vuelve a verificarla.",
        409,
      );
      const current = await tx.providerConfiguration.findUnique({
        where: { id: "global" },
      });
      if (
        current?.provider === provider &&
        current.encryptedKey === before.encryptedKey
      )
        await tx.providerConfiguration.update({
          where: { id: "global" },
          data: {
            models,
            status: "VERIFIED",
            verifiedAt: new Date(),
            verifiedRevision: current.revision,
            error: null,
          },
        });
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action: "CATALOGO_IA_CONSULTADO",
          detail: { provider, count: models.length },
        },
      });
    });
    return publicConnection(
      provider,
      await db.providerConnection.findUnique({ where: { provider } }),
    );
  } catch (e) {
    if (e instanceof AppError && [403, 409].includes(e.status)) throw e;
    const message =
      e instanceof AppError
        ? e.message
        : "No se pudo consultar el catálogo del proveedor.";
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      const updated = await tx.providerConnection.updateMany({
        where: { provider, revision: before.revision },
        data: {
          models: [],
          status: "ERROR",
          verifiedAt: null,
          verifiedRevision: null,
          error: message,
        },
      });
      if (updated.count) {
        const current = await tx.providerConfiguration.findUnique({
          where: { id: "global" },
        });
        if (
          current?.provider === provider &&
          current.encryptedKey === before.encryptedKey
        )
          await tx.providerConfiguration.update({
            where: { id: "global" },
            data: {
              models: [],
              status: "ERROR",
              verifiedAt: null,
              verifiedRevision: null,
              error: message,
            },
          });
      }
    });
    throw new AppError(message, e instanceof AppError ? e.status : 502);
  }
}
export async function creativeConnection(
  c: ProviderConfiguration,
  client: Pick<Prisma.TransactionClient, "providerConnection"> = db,
) {
  const provider = c.creativeProvider ?? c.provider;
  const source =
    provider === c.provider
      ? c
      : await client.providerConnection.findUnique({ where: { provider } });
  demand(
    source?.encryptedKey && !stale(source),
    "Guarda y verifica la conexión del proveedor de dirección creativa (válida durante24 horas).",
    409,
  );
  const model = (source.models as ModelCapability[]).find(
    (m) => m.kind === "creative" && m.id === c.creativeModel,
  );
  demand(
    model,
    "Selecciona un modelo de dirección creativa consultado y compatible. Puedes usar Google u OpenAI aunque las imágenes se generen en otro proveedor.",
    409,
  );
  return {
    provider,
    encryptedKey: source.encryptedKey,
    revision: source.revision,
    model,
  };
}
export function capabilityFingerprint(capability: ModelCapability) {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  const { label: _label, discoveryQuery: _query, ...technical } = capability;
  return createHash("sha256")
    .update(JSON.stringify(canonical(technical)))
    .digest("hex");
}
