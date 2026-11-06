import { z } from "zod";

export const metaId = z.string().regex(/^\d{1,40}$/);
export const platformNames = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  whatsapp: "WhatsApp",
  threads: "Threads",
} as const;
export type CampaignPlatform = keyof typeof platformNames;
export function eligiblePlatforms(objective: string): CampaignPlatform[] {
  return objective === "TRAFFIC"
    ? ["facebook", "instagram", "messenger", "audience_network", "threads"]
    : objective === "LEADS"
      ? ["facebook", "instagram"]
      : ["facebook", "instagram", "whatsapp"];
}
export function eligiblePositions(
  objective: string,
  platform: CampaignPlatform,
) {
  const choices = placementChoices[platform];
  if (objective === "WHATSAPP" || objective === "LEADS_WHATSAPP")
    return choices.filter(
      (p) =>
        platform !== "facebook" ||
        ["feed", "story", "facebook_reels", "marketplace"].includes(p.id),
    );
  return choices;
}
// Leaving a platform's positions empty means all its eligible placements in Meta.
export const placementChoices: Record<
  CampaignPlatform,
  { id: string; name: string }[]
> = {
  facebook: [
    { id: "feed", name: "Feed" },
    { id: "story", name: "Historias" },
    { id: "facebook_reels", name: "Reels" },
    { id: "marketplace", name: "Marketplace" },
    { id: "search", name: "Búsqueda" },
    { id: "right_hand_column", name: "Columna derecha" },
  ],
  instagram: [
    { id: "stream", name: "Feed" },
    { id: "story", name: "Historias" },
    { id: "reels", name: "Reels" },
    { id: "explore", name: "Explorar" },
    { id: "explore_home", name: "Inicio de Explorar" },
    { id: "ig_search", name: "Búsqueda" },
    { id: "profile_feed", name: "Feed del perfil" },
  ],
  messenger: [
    { id: "messenger_home", name: "Bandeja de entrada" },
    { id: "story", name: "Historias" },
  ],
  audience_network: [{ id: "classic", name: "Nativo, banner e intersticial" }],
  whatsapp: [{ id: "status", name: "Estados" }],
  threads: [{ id: "feed", name: "Feed" }],
};
export const platformSchema = z.enum([
  "facebook",
  "instagram",
  "messenger",
  "audience_network",
  "whatsapp",
  "threads",
]);
export const positionsSchema = z
  .partialRecord(platformSchema, z.array(z.string().max(60)).max(12))
  .refine(
    (v) =>
      Object.entries(v).every(
        ([platform, positions]) =>
          new Set(positions).size === positions.length &&
          positions.every((p) =>
            placementChoices[platform as CampaignPlatform].some(
              (c) => c.id === p,
            ),
          ),
      ),
    "Una ubicación no pertenece a la plataforma seleccionada.",
  );
export const conversationSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    greeting: z.string().trim().min(1).max(1024),
    autofill: z.string().trim().min(1).max(80),
  })
  .strict();
export type ConversationTemplate = z.infer<typeof conversationSchema>;
export const locationSchema = z
  .object({
    id: metaId,
    name: z.string().min(1).max(250),
    country: z.string().regex(/^[A-Z]{2}$/),
    kind: z.enum(["cities", "regions"]),
  })
  .strict();

// Country, identity, counts, audiences and selected assets are intentionally absent.
export const campaignPresetSettingsSchema = z
  .object({
    objective: z.enum(["WHATSAPP", "LEADS_WHATSAPP", "LEADS", "TRAFFIC"]),
    platforms: z
      .array(platformSchema)
      .min(1)
      .max(6)
      .refine((v) => new Set(v).size === v.length),
    placements: positionsSchema.optional(),
    multiAdvertiser: z.literal(false).optional(),
    allowExcludedPlacementSpend: z.boolean().optional(),
    body: z.string().max(5000),
    headline: z.string().max(250),
    description: z.string().max(500),
  })
  .strict();
export type CampaignPresetSettings = z.infer<
  typeof campaignPresetSettingsSchema
>;
export function reusableCampaignSettings(
  input: Record<string, any>,
): CampaignPresetSettings {
  return campaignPresetSettingsSchema.parse({
    objective: input.objective ?? "WHATSAPP",
    platforms: input.platforms ?? ["facebook", "instagram"],
    placements: input.placements,
    multiAdvertiser: false,
    allowExcludedPlacementSpend: input.allowExcludedPlacementSpend ?? false,
    body: input.body ?? "",
    headline: input.headline ?? "{diplomado}",
    description: input.description ?? "",
  });
}
export function templateForAnotherDiploma(
  input: Record<string, any> | undefined,
) {
  const source = input ?? {};
  return {
    objective: source.objective ?? "WHATSAPP",
    dailyBudget: source.dailyBudget ?? 0,
    platforms: source.platforms ?? ["facebook", "instagram"],
    placements: source.placements,
    accountId: source.accountId ?? "",
    pageId: source.pageId ?? "",
    specialCategory: source.specialCategory ?? "NONE",
    beneficiary: source.beneficiary ?? "",
    payor: source.payor ?? "",
    campaignName: "{pais} · {diplomado}",
    headline: /\{(?:diplomado|producto)\}|\[(?:diplomado|producto)\]/.test(
      source.headline ?? "",
    )
      ? source.headline
      : "{diplomado}",
    body: /\{(?:diplomado|producto)\}|\[(?:diplomado|producto)\]/.test(
      source.body ?? "",
    )
      ? source.body
      : "Solicita información sobre el diplomado en {diplomado}.",
    description: "",
    multiAdvertiser: false as const,
    allowExcludedPlacementSpend: source.allowExcludedPlacementSpend ?? false,
  };
}
export function placementSoftOptOut(config: {
  platforms?: CampaignPlatform[];
  placements?: Partial<Record<CampaignPlatform, string[]>>;
  allowExcludedPlacementSpend?: boolean;
}) {
  return Object.fromEntries(
    Object.entries(placementChoices).map(([p, choices]) => {
      const platform = p as CampaignPlatform;
      const included = config.platforms?.includes(platform)
        ? config.placements?.[platform]
        : [];
      const excluded = config.allowExcludedPlacementSpend
        ? choices
            .filter((c) => included !== undefined && !included.includes(c.id))
            .map((c) => c.id)
        : [];
      return [platform + "_positions", excluded];
    }),
  );
}
export function whatsappConversationPayload(
  template: ConversationTemplate,
  render: (text: string) => string,
) {
  const greeting = render(template.greeting),
    autofill = render(template.autofill);
  conversationSchema.parse({ ...template, greeting, autofill });
  return JSON.stringify({
    type: "VISUAL_EDITOR",
    version: 2,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: {
      customer_action_type: "autofill_message",
      message: { text: greeting, autofill_message: { content: autofill } },
    },
  });
}
