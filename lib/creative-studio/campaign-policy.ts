import { z } from "zod";
import { demand } from "../errors";
import { countryName, isCountryCode } from "../meta-ads/countries";
export const audienceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    ageMin: z.number().int().min(18).max(65).default(18),
    ageMax: z.number().int().min(18).max(65).default(65),
    gender: z.enum(["ALL", "MEN", "WOMEN"]).default("ALL"),
    strictAge: z.boolean().default(false),
    savedAudienceId: z
      .string()
      .regex(/^\d{1,40}$/)
      .optional(),
  })
  .strict()
  .refine((a) => a.ageMax >= a.ageMin, "El rango de edades no es válido.");
export const campaignConfigSchema = z
  .object({
    accountId: z.string().regex(/^\d{1,40}$/),
    pageId: z.string().regex(/^\d{1,40}$/),
    country: z.string().refine(isCountryCode),
    whatsapp: z
      .string()
      .trim()
      .regex(
        /^\+?\d{7,15}$/,
        "WhatsApp de Meta no válido.",
      ).or(z.literal("")).default(""),
    dailyBudget: z.number().finite().positive().max(1000000),
    body: z.string().trim().min(1).max(5000),
    headline: z.string().trim().min(1).max(250),
    description: z.string().max(500).default(""),
    code: z.string().max(80).default(""),
    targetStatus: z.enum(["PAUSED", "ACTIVE"]).default("PAUSED"),
    audiences: z.array(audienceSchema).length(2),
    specialCategory: z
      .enum(["NONE", "EMPLOYMENT", "HOUSING", "FINANCIAL_PRODUCTS_SERVICES"])
      .default("NONE"),
    beneficiary: z.string().max(200).default(""),
    payor: z.string().max(200).default(""),
  })
  .strict();
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;
export type CampaignItem = {
  subproductId: string;
  name: string;
  variationIds: string[];
  source?: { listId?: string; itemId?: string };
};
export type LaunchStep = {
  key: string;
  kind:
    | "IMAGE"
    | "CAMPAIGN"
    | "ADSET"
    | "CREATIVE"
    | "VERIFY_CREATIVE"
    | "AD"
    | "VERIFY"
    | "ACTIVATE"
    | "VERIFY_LIVE";
  campaign: number;
  image?: number;
  audience?: number;
  target?: string;
  state: "PENDING" | "RUNNING" | "DONE" | "UNCERTAIN";
  startedAt?: string;
  receipt?: Record<string, any>;
};
export function campaignText(
  template: string,
  item: CampaignItem,
  c: CampaignConfig,
) {
  return template.replace(/\{(diplomado|producto|pais|codigo)\}/g, (_m, k) =>
    k === "pais" ? countryName(c.country) : k === "codigo" ? c.code : item.name,
  );
}
export function minorBudget(value: number, currency: string) {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const minor = Math.round(value * 10 ** digits);
  demand(
    Number.isSafeInteger(minor) && minor > 0,
    "El presupuesto no es válido.",
  );
  demand(
    Math.abs(minor / 10 ** digits - value) < 0.000001,
    "El presupuesto tiene demasiados decimales para esa moneda.",
  );
  return minor;
}
export function audienceTargeting(
  config: CampaignConfig,
  index: number,
  saved?: Record<string, unknown>,
) {
  const a = config.audiences[index];
  return {
    ...(saved ?? {}),
    geo_locations: { countries: [config.country] },
    age_min: a.ageMin,
    age_max: a.ageMax,
    ...(a.gender === "ALL" ? {} : { genders: [a.gender === "MEN" ? 1 : 2] }),
    targeting_automation: { advantage_audience: a.strictAge ? 0 : 1 },
  };
}
export function launchPlan(
  campaigns: CampaignItem[],
  active: boolean,
): LaunchStep[] {
  const steps: LaunchStep[] = [];
  const add = (
    key: string,
    kind: LaunchStep["kind"],
    campaign: number,
    extra: Partial<LaunchStep> = {},
  ) => steps.push({ key, kind, campaign, state: "PENDING", ...extra });
  campaigns.forEach((c, i) => {
    c.variationIds.forEach((_v, j) =>
      add(`image:${i}:${j}`, "IMAGE", i, { image: j }),
    );
    add(`campaign:${i}`, "CAMPAIGN", i);
    for (let a = 0; a < 2; a++)
      add(`set:${i}:${a}`, "ADSET", i, { audience: a });
    c.variationIds.forEach((_v, j) => {
      add(`creative:${i}:${j}`, "CREATIVE", i, { image: j });
      add(`verify-creative:${i}:${j}`, "VERIFY_CREATIVE", i, { image: j });
      for (let a = 0; a < 2; a++)
        add(`ad:${i}:${a}:${j}`, "AD", i, { audience: a, image: j });
    });
    add(`verify:${i}`, "VERIFY", i);
  });
  if (active) {
    campaigns.forEach((c, i) => {
      for (let a = 0; a < 2; a++)
        for (let j = 0; j < c.variationIds.length; j++)
          add(`active-ad:${i}:${a}:${j}`, "ACTIVATE", i, {
            target: `ad:${i}:${a}:${j}`,
          });
      for (let a = 0; a < 2; a++)
        add(`active-set:${i}:${a}`, "ACTIVATE", i, { target: `set:${i}:${a}` });
      add(`active-campaign:${i}`, "ACTIVATE", i, { target: `campaign:${i}` });
      add(`verify-live:${i}`, "VERIFY_LIVE", i);
    });
  }
  return steps;
}
export function launchSummary(items: CampaignItem[], c: CampaignConfig) {
  return {
    campaigns: items.length,
    adsets: items.length * 2,
    ads: items.reduce((n, i) => n + i.variationIds.length * 2, 0),
    dailyTotal: Math.round(c.dailyBudget * items.length * 1000000) / 1000000,
  };
}

export function whatsappPromotedObject(config:Pick<CampaignConfig,"pageId"|"whatsapp">){return {page_id:config.pageId,...(config.whatsapp?{whatsapp_phone_number:config.whatsapp.replace(/^\+/,"")}:{})};}
