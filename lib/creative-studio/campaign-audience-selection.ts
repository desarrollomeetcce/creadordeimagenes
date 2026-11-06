import { z } from "zod";
import { detailedFieldSchema } from "./detailed-targeting";
import { encryptKey, decryptKey } from "../crypto";
import { demand } from "../errors";
import { rateLimit } from "../auth";
import { reader } from "../meta-ads/service";
import { isCountryCode } from "../meta-ads/countries";
import type { Actor } from "./service";
import type { CampaignConfig } from "./campaign-policy";

const kinds = z.enum([
  "interests",
  "detailed",
  "custom_audiences",
  "cities",
  "regions",
  "locales",
]);
const proofSchema = z.object({
  v: z.literal(1),
  actorId: z.string(),
  accountId: z.string(),
  connectionId: z.string(),
  revision: z.number(),
  country: z.string(),
  kind: kinds,
  expiresAt: z.number(),
  items: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        country: z.string().optional(),
        field: detailedFieldSchema.optional(),
      }),
    )
    .max(50),
});
export async function campaignAudienceOptions(
  actor: Actor,
  accountId: string,
  input: unknown,
) {
  const b = z
    .object({
      kind: kinds,
      q: z.string().trim().max(80).optional(),
      country: z.string().refine(isCountryCode),
      after: z.string().max(1000).optional(),
      browse: z.enum(["interests", "behaviors", "demographics"]).optional(),
    })
    .strict()
    .parse(input);
  const { primaryAccount } = await import("./campaigns");
  const a = await primaryAccount(actor, accountId);
  await rateLimit("studio-audience-search:" + actor.id, 60);
  const { reader: r } = await reader(a.connectionId, false, true);
  const result = await r.campaignDirectory(a.id, b.kind, {
    query: b.q,
    country: b.country,
    after: b.after,
    browse: b.browse,
  });
  const items = result.data.flatMap((v: any) => {
    const id = String(v.id ?? v.key ?? "");
    if (
      !/^\d{1,40}$/.test(id) ||
      typeof v.name !== "string" ||
      !v.name.trim() ||
      v.valid === false
    )
      return [];
    if (
      (b.kind === "cities" || b.kind === "regions") &&
      v.country_code !== b.country &&
      v.country !== b.country
    )
      return [];
    const field = detailedFieldSchema.safeParse(v.type);
    if (b.kind === "detailed" && !field.success) return [];
    const path = Array.isArray(v.path)
      ? v.path
          .filter((p: unknown) => typeof p === "string")
          .slice(0, 6)
          .map((p: string) => p.slice(0, 150))
      : [];
    return [
      {
        id,
        name: v.name.slice(0, 250),
        ...(b.kind === "detailed" && field.success
          ? {
              field: field.data,
              path,
              ...(Number.isSafeInteger(v.audience_size_lower_bound) &&
              v.audience_size_lower_bound >= 0
                ? { audienceLower: v.audience_size_lower_bound }
                : {}),
              ...(Number.isSafeInteger(v.audience_size_upper_bound) &&
              v.audience_size_upper_bound >= 0
                ? { audienceUpper: v.audience_size_upper_bound }
                : {}),
            }
          : {}),
        ...(b.kind === "cities" || b.kind === "regions"
          ? { country: b.country, kind: b.kind }
          : {}),
        ...(v.subtype ? { subtype: String(v.subtype).slice(0, 50) } : {}),
      },
    ];
  });
  const proof = encryptKey(
    JSON.stringify({
      v: 1,
      actorId: actor.id,
      accountId: a.id,
      connectionId: a.connectionId,
      revision: a.connection.revision,
      country: b.country,
      kind: b.kind,
      expiresAt: Date.now() + 3600000,
      items: items.map(({ id, name, country, field }: any) => ({
        id,
        name,
        ...(country ? { country } : {}),
        ...(field ? { field } : {}),
      })),
    }),
    "studio:audience-selection:v1",
  );
  return { items, proof, after: result.after ?? null };
}
export function verifyManualAudienceSelections(
  actor: Actor,
  account: {
    id: string;
    connectionId: string;
    connection: { revision: number };
  },
  config: CampaignConfig,
  trustedPresetIds: ReadonlySet<string> = new Set(),
) {
  return config.audiences.map((a) => {
    if (a.platformPresetId) {
      demand(
        trustedPresetIds.has(a.platformPresetId),
        "Carga un público guardado autorizado para esta campaña.",
        409,
      );
      return a;
    }
    const proofs = (a.selectionProofs ?? []).map((token) => {
      let proof: z.infer<typeof proofSchema> | undefined;
      try {
        proof = proofSchema.parse(
          JSON.parse(decryptKey(token, "studio:audience-selection:v1")),
        );
      } catch {}
      demand(
        proof &&
          proof.actorId === actor.id &&
          proof.accountId === account.id &&
          proof.connectionId === account.connectionId &&
          proof.revision === account.connection.revision &&
          proof.country === config.country &&
          proof.expiresAt > Date.now(),
        "Actualiza la búsqueda del público: su autorización cambió o venció.",
        409,
      );
      return proof;
    });
    const known = (kind: z.infer<typeof kinds>, id: string, field?: string) =>
      proofs
        .flatMap((p) => (p.kind === kind ? p.items : []))
        .find((p) => p.id === id && (!field || p.field === field));
    const verified = (
      kind: z.infer<typeof kinds>,
      values: { id: string; name: string }[] | undefined,
    ) =>
      (values ?? []).map((value) => {
        const hit = known(kind, value.id);
        demand(
          hit,
          "Selecciona valores confirmados por Meta para este público.",
          409,
        );
        return { id: hit.id, name: hit.name };
      });
    const detailedTargeting = (a.detailedTargeting ?? []).map((value) => {
      const hit = known("detailed", value.id, value.field);
      demand(
        hit?.field,
        "Selecciona una segmentación detallada confirmada por Meta.",
        409,
      );
      return { id: hit.id, name: hit.name, field: hit.field };
    });
    const interests =
      a.interestSource === "MANUAL" || !config.aiSuggestionJobId
        ? verified("interests", a.interests)
        : a.interests;
    const customAudiences = verified("custom_audiences", a.customAudiences),
      excludedCustomAudiences = verified(
        "custom_audiences",
        a.excludedCustomAudiences,
      );
    const locales = (a.locales ?? []).map((id) => {
      demand(
        known("locales", String(id)),
        "Selecciona un idioma confirmado por Meta.",
        409,
      );
      return id;
    });
    const locations = (a.locations ?? []).map((l) => {
      const hit = known(l.kind, l.id);
      demand(
        hit?.country === config.country,
        "Selecciona un lugar confirmado dentro del país de destino.",
        409,
      );
      return { ...l, name: hit.name, country: hit.country };
    });
    return {
      ...a,
      interests,
      detailedTargeting,
      customAudiences,
      excludedCustomAudiences,
      locales,
      locations,
    };
  });
}
