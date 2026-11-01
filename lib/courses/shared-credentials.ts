import { db } from "../db";
import { decryptKey } from "../crypto";
import { demand } from "../errors";
export const sharedProvider = (p: string) => (p === "gemini" ? "google" : p);
export async function sharedSource(provider: string, readSecret = true) {
  const name = sharedProvider(provider);
  if (!["openai", "google", "fal", "replicate"].includes(name)) return null;
  const p = await db.providerConnection.findUnique({
    where: { provider: name },
  });
  if (p?.encryptedKey)
    return {
      key: readSecret ? decryptKey(p.encryptedKey) : "",
      maskedKey: p.maskedKey,
      revision: p.revision,
    };
  const c = await db.providerConfiguration.findUnique({
    where: { id: "global" },
  });
  if (c?.provider === name && c.encryptedKey)
    return {
      key: readSecret ? decryptKey(c.encryptedKey) : "",
      maskedKey: c.maskedKey,
      revision: -c.revision,
    };
  return null;
}
export async function useSharedCredential(provider: string) {
  const source = await sharedSource(provider);
  demand(
    source,
    "Guarda primero la clave compartida en Ajustes IA → Conexiones.",
    409,
  );
  return db.aICourseCredential.upsert({
    where: { provider },
    create: {
      provider,
      shared: true,
      encryptedKey: null,
      maskedKey: null,
      sourceRevision: source.revision,
    },
    update: {
      shared: true,
      encryptedKey: null,
      maskedKey: null,
      sourceRevision: source.revision,
      revision: { increment: 1 },
      models: [],
      voices: [],
      verifiedAt: null,
    },
    select: { provider: true, shared: true },
  });
}
export async function courseConnections() {
  const rows = await db.aICourseCredential.findMany();
  const sources = await Promise.all(
    ["openai", "gemini", "fal"].map(
      async (p) => [p, await sharedSource(p, false)] as const,
    ),
  );
  return ["openai", "gemini", "fal", "anthropic", "elevenlabs"].flatMap(
    (provider) => {
      const c = rows.find((c) => c.provider === provider),
        s = sources.find(([p]) => p === provider)?.[1],
        shared = !c || c.shared,
        ready = !!c && (!shared || c.sourceRevision === s?.revision);
      if (!c && !s) return [];
      return [
        {
          provider,
          maskedKey: shared ? (s?.maskedKey ?? null) : c!.maskedKey,
          shared,
          hasShared: !!s,
          verifiedAt: ready ? c?.verifiedAt : null,
          models: ready ? (c?.models ?? []) : [],
          voices: ready ? (c?.voices ?? []) : [],
        },
      ];
    },
  );
}
