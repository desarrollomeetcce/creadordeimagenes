import { z } from "zod";
import { db } from "./db";
import { ownerOnly } from "./auth";
import { adapter } from "./providers";
import { encryptKey, decryptKey, maskKey } from "./crypto";
import { demand } from "./errors";
import { recordActivity } from "./activity";
type Actor = { id: string; role: string };
const context = (provider: string) => `billing:${provider}:api-key`;
export async function billingCredentialStatus(user: Actor, provider: string) {
  ownerOnly(user);
  adapter(provider);
  const row = await db.providerBillingCredential.findUnique({
    where: { provider },
    select: { maskedKey: true, updatedAt: true },
  });
  return {
    provider,
    configured: !!row,
    maskedKey: row?.maskedKey ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}
export async function saveBillingCredential(user: Actor, input: unknown) {
  ownerOnly(user);
  const b = z
    .object({
      provider: z.string().min(1).max(50),
      apiKey: z.string().trim().min(12).max(1000),
    })
    .strict()
    .parse(input);
  demand(
    adapter(b.provider).dailyCosts,
    "Este proveedor no permite consultar gastos.",
    409,
  );
  const encryptedKey = encryptKey(b.apiKey, context(b.provider)),
    maskedKey = maskKey(b.apiKey);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const current = await tx.user.findUnique({
      where: { id: user.id },
      select: { role: true, status: true },
    });
    demand(
      current?.role === "OWNER" && current.status === "APPROVED",
      "La cuenta cambió. Inicia sesión nuevamente.",
      403,
    );
    await tx.providerBillingCredential.upsert({
      where: { provider: b.provider },
      create: { provider: b.provider, encryptedKey, maskedKey },
      update: { encryptedKey, maskedKey },
    });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: "CREDENCIAL_GASTOS_GUARDADA",
        detail: { provider: b.provider },
      },
    });
  });
  return billingCredentialStatus(user, b.provider);
}
export async function deleteBillingCredential(user: Actor, provider: string) {
  ownerOnly(user);
  adapter(provider);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const current = await tx.user.findUnique({
      where: { id: user.id },
      select: { role: true, status: true },
    });
    demand(
      current?.role === "OWNER" && current.status === "APPROVED",
      "La cuenta cambió. Inicia sesión nuevamente.",
      403,
    );
    await tx.providerBillingCredential.deleteMany({ where: { provider } });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: "CREDENCIAL_GASTOS_ELIMINADA",
        detail: { provider },
      },
    });
  });
  return { ok: true };
}
export async function readDailyCosts(
  user: Actor,
  provider: string,
  from: string,
  to: string,
) {
  ownerOnly(user);
  const { billingRange } = await import("./provider-costs");
  billingRange(from, to);
  const engine = adapter(provider);
  demand(engine.dailyCosts, "Este proveedor no permite consultar gastos.", 409);
  const row = await db.providerBillingCredential.findUnique({
    where: { provider },
  });
  demand(
    row,
    "Guarda la credencial de consulta de gastos en este panel. Tu clave de generación se administra por separado.",
    409,
  );
  return engine.dailyCosts(
    decryptKey(row.encryptedKey, context(provider)),
    from,
    to,
  );
}
