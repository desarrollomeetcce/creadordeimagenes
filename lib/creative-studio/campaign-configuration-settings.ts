import { z } from "zod";
import {
  campaignPresetSettingsSchema,
  conversationSchema,
} from "./campaign-workbench-policy";

export const campaignConfigurationSettingsSchema = campaignPresetSettingsSchema
  .pick({
    objective: true,
    platforms: true,
    placements: true,
    allowExcludedPlacementSpend: true,
  })
  .extend({
    campaignName: z.string().trim().min(1).max(250),
    adsetCount: z.number().int().min(1).max(10).optional(),
  })
  .strict();
export const adConfigurationSettingsSchema = z
  .object({
    body: z.string().max(5000),
    headline: z.string().max(250),
    description: z.string().max(500),
    multiAdvertiser: z.boolean().default(false),
    conversation: conversationSchema.optional(),
  })
  .strict();
export type CampaignConfigurationSettings = z.infer<
  typeof campaignConfigurationSettingsSchema
>;
export type AdConfigurationSettings = z.infer<
  typeof adConfigurationSettingsSchema
>;
export function campaignConfigurationSettings(
  form: Record<string, any>,
): CampaignConfigurationSettings {
  return campaignConfigurationSettingsSchema.parse({
    campaignName: form.campaignName ?? "{pais} · {diplomado}",
    objective: form.objective,
    platforms: form.platforms,
    placements: form.placements,
    allowExcludedPlacementSpend: form.allowExcludedPlacementSpend ?? false,
    adsetCount: form.audiences?.length,
  });
}
export function adConfigurationSettings(
  form: Record<string, any>,
): AdConfigurationSettings {
  return adConfigurationSettingsSchema.parse({
    body: form.body ?? "",
    headline: form.headline ?? "",
    description: form.description ?? "",
    multiAdvertiser: form.multiAdvertiser ?? false,
    conversation: ["WHATSAPP", "LEADS_WHATSAPP"].includes(form.objective)
      ? form.conversation
      : undefined,
  });
}
export const campaignConfigurationSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  revision: z.number().int().positive(),
  settings: campaignConfigurationSettingsSchema,
});
export const adConfigurationSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  revision: z.number().int().positive(),
  settings: adConfigurationSettingsSchema,
});
export function configurationDirectory(studio: Record<string, any>) {
  const read = (key: string, schema: z.ZodType<any>) =>
    (Array.isArray(studio[key]) ? studio[key] : []).flatMap((row: any) => {
      const p = schema.safeParse(row);
      return p.success ? [p.data] : [];
    });
  const campaigns = read("campaignConfigurations", campaignConfigurationSchema),
    ads = read("adConfigurations", adConfigurationSchema);
  // Keep historical combined presets available without rewriting or applying their other scope.
  for (const old of Array.isArray(studio.campaignPresets)
    ? studio.campaignPresets
    : []) {
    const settings = campaignPresetSettingsSchema.safeParse(old.settings);
    if (
      !settings.success ||
      !z.uuid().safeParse(old.id).success ||
      typeof old.name !== "string" ||
      !Number.isInteger(old.revision) ||
      old.revision < 1
    )
      continue;
    if (!campaigns.some((p: any) => p.id === old.id))
      campaigns.push({
        ...old,
        legacy: true,
        settings: {
          campaignName: "{pais} · {diplomado}",
          objective: settings.data.objective,
          platforms: settings.data.platforms,
          placements: settings.data.placements,
          allowExcludedPlacementSpend:
            settings.data.allowExcludedPlacementSpend,
        },
      });
    if (!ads.some((p: any) => p.id === old.id))
      ads.push({
        ...old,
        legacy: true,
        settings: {
          body: settings.data.body,
          headline: settings.data.headline,
          description: settings.data.description,
          multiAdvertiser: false,
        },
      });
  }
  return { campaignConfigurations: campaigns, adConfigurations: ads };
}

export function configurationMatches(
  kind: "campaign" | "ad",
  saved: Record<string, any>,
  form: Record<string, any>,
): boolean {
  try {
    const expected = { ...saved };
    const current: any =
      kind === "campaign"
        ? campaignConfigurationSettings(form)
        : adConfigurationSettings(form);
    if (kind === "campaign" && saved.adsetCount === undefined)
      delete current.adsetCount;
    if (
      kind === "ad" &&
      !["WHATSAPP", "LEADS_WHATSAPP"].includes(form.objective)
    ) {
      delete current.conversation;
      delete expected.conversation;
    }
    const canonical = (v: any): any =>
      Array.isArray(v)
        ? v.map(canonical)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .filter((k) => v[k] !== undefined)
                .map((k) => [k, canonical(v[k])]),
            )
          : v;
    return (
      JSON.stringify(canonical(current)) === JSON.stringify(canonical(expected))
    );
  } catch {
    return false;
  }
}
