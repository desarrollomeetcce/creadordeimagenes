import { z } from "zod";
import { metaInterestSchema } from "./audience-interests";
import { demand } from "../errors";
import { countryName, isCountryCode } from "../meta-ads/countries";
import {
  conversationSchema,
  eligiblePlatforms,
  eligiblePositions,
  locationSchema,
  metaId,
  platformSchema,
  positionsSchema,
} from "./campaign-workbench-policy";
export const audienceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    interests: z.array(metaInterestSchema).max(10).optional(),
    interestSource: z.enum(["MANUAL", "AI"]).optional(),
    platformPresetId: z.string().uuid().optional(),
    customAudiences: z.array(metaInterestSchema).max(10).optional(),
    excludedCustomAudiences: z.array(metaInterestSchema).max(10).optional(),
    locales: z.array(z.number().int().positive()).max(10).optional(),
    locations: z.array(locationSchema).max(20).optional(),
    selectionProofs: z.array(z.string().max(24000)).max(10).optional(),
    advantageAudience: z.boolean().optional(),
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
    planVersion: z.literal(2).optional(),
    campaignName: z.string().trim().max(250).optional(),
    aiSuggestionJobId: z.string().min(1).max(100).optional(),
    objective: z
      .enum(["WHATSAPP", "LEADS_WHATSAPP", "LEADS", "TRAFFIC"])
      .default("WHATSAPP"),
    existingCampaignId: metaId.optional(),
    existingAdsetId: metaId.optional(),
    existingAdsetIds: z
      .array(metaId)
      .min(1)
      .max(10)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    adsetDailyBudget: z.number().finite().positive().max(1000000).optional(),
    conversation: conversationSchema.optional(),
    placements: positionsSchema.optional(),
    allowExcludedPlacementSpend: z.boolean().optional(),
    multiAdvertiser: z.literal(false).optional(),
    website: z.string().max(2000).default(""),
    leadFormId: z
      .string()
      .regex(/^\d{1,40}$/)
      .or(z.literal(""))
      .default(""),
    platforms: z
      .array(platformSchema)
      .min(1)
      .max(6)
      .refine((v) => new Set(v).size === v.length)
      .default(["facebook", "instagram"]),
    variables: z
      .record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.string().max(500))
      .default({}),
    distribution: z
      .record(
        z.string().min(1).max(100),
        z.array(z.number().int().positive().max(50)).min(1).max(10),
      )
      .default({}),
    accountId: z.string().regex(/^\d{1,40}$/),
    pageId: z.string().regex(/^\d{1,40}$/),
    country: z.string().refine(isCountryCode),
    whatsapp: z
      .string()
      .trim()
      .regex(/^\+?\d{7,15}$/, "WhatsApp de Meta no válido.")
      .or(z.literal(""))
      .default(""),
    dailyBudget: z.number().finite().nonnegative().max(1000000),
    body: z.string().trim().min(1).max(5000),
    headline: z.string().trim().min(1).max(250),
    description: z.string().max(500).default(""),
    code: z.string().max(80).default(""),
    targetStatus: z.enum(["PAUSED", "ACTIVE"]).default("PAUSED"),
    audiences: z.array(audienceSchema).min(1).max(10),
    specialCategory: z
      .enum(["NONE", "EMPLOYMENT", "HOUSING", "FINANCIAL_PRODUCTS_SERVICES"])
      .default("NONE"),
    beneficiary: z.string().max(200).default(""),
    payor: z.string().max(200).default(""),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!c.existingCampaignId && c.dailyBudget <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["dailyBudget"],
        message: "Indica un presupuesto diario mayor que cero.",
      });
    if (
      c.existingAdsetId &&
      (!c.existingCampaignId || c.audiences.length !== 1)
    )
      ctx.addIssue({
        code: "custom",
        path: ["existingAdsetId"],
        message: "Selecciona una campaña y un solo conjunto existente.",
      });
    if (
      c.existingAdsetIds &&
      (!c.existingCampaignId ||
        c.existingAdsetId ||
        c.audiences.length !== c.existingAdsetIds.length)
    )
      ctx.addIssue({
        code: "custom",
        path: ["existingAdsetIds"],
        message:
          "Cada conjunto existente debe corresponder a un espacio de distribución.",
      });
  });
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
  existing?: boolean;
  wait?: { reason: "pacing" | "quota"; until: string };
  receipt?: Record<string, any>;
};
export function campaignText(
  template: string,
  item: CampaignItem,
  c: CampaignConfig,
) {
  return template.replace(
    /\{([a-z][a-z0-9_]{0,39})\}|\[([a-z][a-z0-9_]{0,39})\]/g,
    (m, first, second) => {
      const k = first ?? second;
      return k === "pais"
        ? countryName(c.country)
        : k === "codigo"
          ? (c.variables?.codigo ?? c.code)
          : ["diplomado", "producto"].includes(k)
            ? item.name
            : (c.variables?.[k] ?? m);
    },
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
  const special = config.specialCategory && config.specialCategory !== "NONE";
  const savedSelected = !!a.savedAudienceId && !!saved;
  const genders =
    savedSelected && Array.isArray(saved?.genders) ? saved.genders : undefined;
  const automation =
    savedSelected &&
    saved?.targeting_automation &&
    typeof saved.targeting_automation === "object"
      ? (saved.targeting_automation as Record<string, unknown>)
      : null;
  const {
    publisher_platforms: _p,
    facebook_positions: _f,
    instagram_positions: _i,
    messenger_positions: _m,
    audience_network_positions: _n,
    whatsapp_positions: _w,
    threads_positions: _t,
    genders: _g,
    device_platforms: _d,
    excluded_geo_locations: _eg,
    ...safeSaved
  } = saved ?? {};
  for (const key of Object.keys(safeSaved))
    if (
      key.startsWith("effective_") ||
      [
        "page_types",
        "dt_consolidation_state",
        "targeting_optimization",
      ].includes(key)
    )
      delete safeSaved[key];
  if (a.interests?.length) {
    delete safeSaved.interests;
    delete safeSaved.flexible_spec;
  }
  return {
    ...safeSaved,
    publisher_platforms: config.platforms ?? ["facebook", "instagram"],
    ...Object.fromEntries(
      Object.entries(config.placements ?? {})
        .filter(
          ([p, positions]) =>
            config.platforms.includes(p as any) && positions?.length,
        )
        .map(([p, positions]) => [p + "_positions", positions]),
    ),
    geo_locations: a.locations?.length
      ? {
          ...(a.locations.some((l) => l.kind === "cities")
            ? {
                cities: a.locations
                  .filter((l) => l.kind === "cities")
                  .map((l) => ({ key: l.id })),
              }
            : {}),
          ...(a.locations.some((l) => l.kind === "regions")
            ? {
                regions: a.locations
                  .filter((l) => l.kind === "regions")
                  .map((l) => ({ key: l.id })),
              }
            : {}),
        }
      : { countries: [config.country] },
    ...(a.customAudiences?.length
      ? { custom_audiences: a.customAudiences.map(({ id }) => ({ id })) }
      : {}),
    ...(a.excludedCustomAudiences?.length
      ? {
          excluded_custom_audiences: a.excludedCustomAudiences.map(
            ({ id }) => ({ id }),
          ),
        }
      : {}),
    ...(a.locales?.length ? { locales: a.locales } : {}),
    ...(special
      ? {}
      : {
          age_min:
            savedSelected && typeof saved?.age_min === "number"
              ? saved.age_min
              : a.ageMin,
          age_max:
            savedSelected && typeof saved?.age_max === "number"
              ? saved.age_max
              : a.ageMax,
        }),
    ...(a.interests?.length
      ? { flexible_spec: [{ interests: a.interests }] }
      : {}),
    ...(savedSelected && !special
      ? genders
        ? { genders }
        : {}
      : special || a.gender === "ALL"
        ? {}
        : { genders: [a.gender === "MEN" ? 1 : 2] }),
    targeting_automation: {
      ...(automation ?? {}),
      advantage_audience:
        a.advantageAudience !== undefined
          ? Number(a.advantageAudience)
          : savedSelected
            ? automation?.advantage_audience === 0
              ? 0
              : 1
            : special || !a.strictAge
              ? 1
              : 0,
    },
  };
}
export function launchPlan(
  campaigns: CampaignItem[],
  active: boolean,
  config?: CampaignConfig,
): LaunchStep[] {
  const steps: LaunchStep[] = [];
  const add = (
    key: string,
    kind: LaunchStep["kind"],
    campaign: number,
    extra: Partial<LaunchStep> = {},
  ) => steps.push({ key, kind, campaign, state: "PENDING", ...extra });
  const count = config?.audiences.length ?? 2;
  const balanced = config?.planVersion === 2;
  campaigns.forEach((c, i) => {
    c.variationIds.forEach((_v, j) =>
      add(`image:${i}:${j}`, "IMAGE", i, { image: j }),
    );
    add(
      `campaign:${i}`,
      "CAMPAIGN",
      i,
      config?.existingCampaignId
        ? {
            existing: true,
            state: "DONE",
            receipt: { id: config.existingCampaignId },
          }
        : {},
    );
    for (let a = 0; a < count; a++)
      add(`set:${i}:${a}`, "ADSET", i, {
        audience: a,
        ...((config?.existingAdsetIds?.[a] ?? config?.existingAdsetId)
          ? {
              existing: true,
              state: "DONE" as const,
              receipt: {
                id: config!.existingAdsetIds?.[a] ?? config!.existingAdsetId,
              },
            }
          : {}),
      });
    c.variationIds.forEach((_v, j) => {
      add(`creative:${i}:${j}`, "CREATIVE", i, { image: j });
      add(`verify-creative:${i}:${j}`, "VERIFY_CREATIVE", i, { image: j });
      for (let a = 0; a < count; a++)
        if (!balanced || imageAudience(c, j, config!) === a)
          add(`ad:${i}:${a}:${j}`, "AD", i, { audience: a, image: j });
    });
    add(`verify:${i}`, "VERIFY", i);
  });
  if (balanced) {
    const prepared = steps.filter((s) =>
      ["IMAGE", "CREATIVE", "VERIFY_CREATIVE"].includes(s.kind),
    );
    const objects = steps.filter(
      (s) => !["IMAGE", "CREATIVE", "VERIFY_CREATIVE"].includes(s.kind),
    );
    steps.splice(0, steps.length, ...prepared, ...objects);
  }
  if (active) {
    campaigns.forEach((c, i) => {
      for (let a = 0; a < count; a++)
        for (let j = 0; j < c.variationIds.length; j++)
          if (!balanced || imageAudience(c, j, config!) === a)
            add(`active-ad:${i}:${a}:${j}`, "ACTIVATE", i, {
              target: `ad:${i}:${a}:${j}`,
            });
      for (let a = 0; a < count; a++)
        if (!config?.existingAdsetId && !config?.existingAdsetIds?.length)
          add(`active-set:${i}:${a}`, "ACTIVATE", i, {
            target: `set:${i}:${a}`,
          });
      if (!config?.existingCampaignId)
        add(`active-campaign:${i}`, "ACTIVATE", i, { target: `campaign:${i}` });
      add(`verify-live:${i}`, "VERIFY_LIVE", i);
    });
  }
  return steps;
}
export function launchSummary(items: CampaignItem[], c: CampaignConfig) {
  return {
    campaigns: c.existingCampaignId ? 1 : items.length,
    newCampaigns: c.existingCampaignId ? 0 : items.length,
    existingCampaigns: c.existingCampaignId ? 1 : 0,
    adsets:
      c.existingAdsetIds?.length ??
      (c.existingAdsetId ? 1 : items.length * c.audiences.length),
    ads: items.reduce(
      (n, i) =>
        n +
        i.variationIds.length * (c.planVersion === 2 ? 1 : c.audiences.length),
      0,
    ),
    dailyTotal: c.existingCampaignId
      ? c.existingAdsetId || c.existingAdsetIds?.length
        ? 0
        : (c.adsetDailyBudget ?? 0) * items.length * c.audiences.length
      : Math.round(c.dailyBudget * items.length * 1000000) / 1000000,
  };
}

export function whatsappPromotedObject(
  config: Pick<CampaignConfig, "pageId" | "whatsapp">,
) {
  return {
    page_id: config.pageId,
    ...(config.whatsapp
      ? { whatsapp_phone_number: config.whatsapp.replace(/^\+/, "") }
      : {}),
  };
}

export function imageDistribution(item: CampaignItem, config: CampaignConfig) {
  const n = config.audiences.length,
    images = item.variationIds.length;
  const custom = config.distribution?.[item.subproductId];
  if (custom) {
    demand(
      custom.length === n &&
        custom.every((v) => Number.isInteger(v) && v > 0) &&
        custom.reduce((a, b) => a + b, 0) === images,
      "La distribución debe asignar todos los afiches una sola vez, sin conjuntos vacíos.",
    );
    return custom;
  }
  demand(
    images >= n,
    `Selecciona al menos ${n} afiches para ${item.name}, o reduce los conjuntos.`,
  );
  return Array.from(
    { length: n },
    (_, i) => Math.floor(images / n) + (i < images % n ? 1 : 0),
  );
}
export function imageAudience(
  item: CampaignItem,
  image: number,
  config: CampaignConfig,
) {
  let end = 0;
  return imageDistribution(item, config).findIndex((n) => (end += n) > image);
}
export function campaignObjective(c: Pick<CampaignConfig, "objective">) {
  return c.objective === "LEADS" || c.objective === "LEADS_WHATSAPP"
    ? "OUTCOME_LEADS"
    : c.objective === "TRAFFIC"
      ? "OUTCOME_TRAFFIC"
      : "OUTCOME_ENGAGEMENT";
}
export function campaignDestination(c: Pick<CampaignConfig, "objective">) {
  return c.objective === "LEADS"
    ? "ON_AD"
    : c.objective === "TRAFFIC"
      ? "WEBSITE"
      : "WHATSAPP";
}
export function campaignOptimization(c: Pick<CampaignConfig, "objective">) {
  return c.objective === "LEADS"
    ? "LEAD_GENERATION"
    : c.objective === "TRAFFIC"
      ? "LINK_CLICKS"
      : "CONVERSATIONS";
}
export function campaignLink(
  c: Pick<CampaignConfig, "objective" | "website" | "pageId">,
) {
  return c.objective === "TRAFFIC"
    ? c.website
    : "https://www.facebook.com/" + c.pageId;
}
export function campaignCTA(
  c: Pick<CampaignConfig, "objective" | "leadFormId" | "website">,
) {
  return c.objective === "LEADS"
    ? { type: "SIGN_UP", value: { lead_gen_form_id: c.leadFormId } }
    : c.objective === "TRAFFIC"
      ? { type: "LEARN_MORE", value: { link: c.website } }
      : { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } };
}
export function validateCampaignDestination(c: CampaignConfig) {
  if (!c.existingAdsetId && !c.existingAdsetIds?.length) {
    demand(
      c.platforms.every((p) => eligiblePlatforms(c.objective).includes(p)),
      "Una plataforma seleccionada no admite el destino de esta campaña.",
    );
    for (const p of c.platforms)
      demand(
        (c.placements?.[p] ?? []).every((id) =>
          eligiblePositions(c.objective, p).some((v) => v.id === id),
        ),
        "Una ubicación seleccionada no es compatible con el destino de esta campaña.",
      );
  }
  demand(
    !c.conversation || ["WHATSAPP", "LEADS_WHATSAPP"].includes(c.objective),
    "La plantilla de conversación requiere un destino WhatsApp.",
  );
  demand(
    !c.existingAdsetId || c.existingCampaignId,
    "Selecciona la campaña del conjunto existente.",
  );
  for (const a of c.audiences) {
    demand(
      (a.locations ?? []).every((l) => l.country === c.country),
      "Las ubicaciones del público deben pertenecer al país elegido.",
    );
  }
  if (c.specialCategory !== "NONE")
    demand(
      c.audiences.every(
        (a) =>
          a.ageMin === 18 &&
          a.ageMax === 65 &&
          a.gender === "ALL" &&
          !a.savedAudienceId &&
          !a.interests?.length &&
          !a.customAudiences?.length &&
          !a.excludedCustomAudiences?.length,
      ),
      "Las categorías especiales requieren público amplio sin edad, género ni público guardado restringido.",
    );
  if (c.objective === "TRAFFIC") {
    let url: URL | undefined;
    try {
      url = new URL(c.website);
    } catch {}
    demand(
      url?.protocol === "https:" && !url.username && !url.password,
      "Indica una página web HTTPS válida para el objetivo de visitas.",
    );
  }
  if (c.objective === "LEADS")
    demand(
      c.leadFormId,
      "Selecciona un formulario de clientes potenciales de esta página.",
    );
  const keys = Object.keys(c.variables);
  demand(
    keys.length <= 20 &&
      !keys.some((k) => ["diplomado", "producto", "pais"].includes(k)),
    "Usa hasta 20 variables propias; los nombres predeterminados están reservados.",
  );
}

export function validateCampaignText(item: CampaignItem, c: CampaignConfig) {
  const known = new Set([
    "diplomado",
    "producto",
    "pais",
    "codigo",
    ...Object.keys(c.variables ?? {}),
  ]);
  for (const [key, max] of [
    ["headline", 250],
    ["body", 5000],
    ["description", 500],
  ] as const) {
    const value = c[key];
    for (const match of value.matchAll(
      /\{([a-z][a-z0-9_]{0,39})\}|\[([a-z][a-z0-9_]{0,39})\]/g,
    ))
      demand(
        known.has(match[1] ?? match[2]),
        `Falta definir la variable {${match[1] ?? match[2]}}.`,
      );
    const rendered = campaignText(value, item, c);
    demand(
      rendered.length <= max &&
        (key === "description" || rendered.trim().length > 0),
      `El ${key === "headline" ? "headline" : key === "body" ? "texto" : "detalle"} de ${item.name} excede el límite o está vacío después de reemplazar variables.`,
    );
  }
  const name = campaignDisplayName(item, c);
  demand(
    name.length > 0 && name.length <= 250,
    "El nombre de campaña supera 250 caracteres.",
  );
  for (const match of (c.campaignName ?? "").matchAll(
    /\{([a-z][a-z0-9_]{0,39})\}|\[([a-z][a-z0-9_]{0,39})\]/g,
  ))
    demand(
      known.has(match[1] ?? match[2]),
      `Falta definir la variable {${match[1] ?? match[2]}}.`,
    );
}

export function campaignDisplayName(item: CampaignItem, c: CampaignConfig) {
  return campaignText(
    c.campaignName?.trim() || "{pais} · {diplomado}",
    item,
    c,
  );
}

export function requiresMetaPayer(country: string) {
  return "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE"
    .split(" ")
    .includes(country);
}
