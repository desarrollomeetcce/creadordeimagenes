import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { resourceAccess } from "../auth";
import { demand } from "../errors";
import {
  audienceSchema,
  campaignConfigSchema,
  validateCampaignDestination,
  type CampaignConfig,
} from "./campaign-policy";
import { verifyManualAudienceSelections } from "./campaign-audience-selection";
import { studioAccess, object, json, type Actor } from "./service";
import { platformSchema } from "./campaign-workbench-policy";
import { isCountryCode } from "../meta-ads/countries";
type Account = {
  id: string;
  connectionId: string;
  connection: { revision: number };
};
async function projectPresets(categoryId: string) {
  const category = await db.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { projectId: true },
  });
  const project = await db.project.findUniqueOrThrow({
    where: { id: category.projectId },
    select: { studio: true },
  });
  return {
    projectId: category.projectId,
    rows: Array.isArray(object(project.studio).audiencePresets)
      ? object(project.studio).audiencePresets
      : [],
  };
}
export async function resolvePlatformAudiencePresets(
  account: Account,
  categoryId: string,
  config: CampaignConfig,
) {
  const trusted = new Set<string>();
  if (!config.audiences.some((a) => a.platformPresetId))
    return { audiences: config.audiences, trusted };
  const { rows } = await projectPresets(categoryId);
  const audiences = config.audiences.map((a) => {
    if (!a.platformPresetId) return a;
    const preset = rows.find(
      (p: any) =>
        p.id === a.platformPresetId &&
        p.accountId === account.id &&
        p.country === config.country,
    );
    demand(
      preset,
      "Este público guardado no corresponde a la cuenta y país seleccionados.",
      409,
    );
    const target = audienceSchema.parse(preset.audience);
    trusted.add(preset.id);
    return {
      ...target,
      name: a.name,
      platformPresetId: preset.id,
      interestSource: "MANUAL" as const,
    };
  });
  return { audiences, trusted };
}
export async function platformAudiencePresets(
  actor: Actor,
  categoryId: string,
  input: unknown,
) {
  studioAccess(actor);
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const b = z
    .object({
      accountId: z.string().regex(/^\d{1,40}$/),
      country: z.string().refine(isCountryCode),
    })
    .strict()
    .parse(input);
  const { primaryAccount } = await import("./campaigns");
  await primaryAccount(actor, b.accountId);
  const { rows } = await projectPresets(categoryId);
  return {
    items: rows
      .filter(
        (p: any) => p.accountId === b.accountId && p.country === b.country,
      )
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        audience: audienceSchema.parse(p.audience),
      })),
  };
}
export async function savePlatformAudience(
  actor: Actor,
  accountId: string,
  input: unknown,
) {
  studioAccess(actor);
  const b = z
    .object({
      requestId: z.string().uuid(),
      categoryId: z.string().min(1).max(100),
      name: z.string().trim().min(1).max(100),
      country: z.string(),
      audience: audienceSchema,
      platforms: z.array(platformSchema).min(1).max(6),
      specialCategory: campaignConfigSchema.shape.specialCategory,
      aiSuggestionJobId: z.string().max(100).optional(),
    })
    .strict()
    .parse(input);
  await resourceAccess(actor, "category", b.categoryId, "EDIT");
  const { primaryAccount } = await import("./campaigns");
  const account = await primaryAccount(actor, accountId);
  const { projectId } = await projectPresets(b.categoryId);
  await resourceAccess(actor, "project", projectId, "EDIT");
  const config = campaignConfigSchema.parse({
    accountId,
    pageId: "0",
    country: b.country,
    dailyBudget: 1,
    body: "Público",
    headline: "Público",
    platforms: b.platforms,
    specialCategory: b.specialCategory,
    audiences: [b.audience],
    aiSuggestionJobId: b.aiSuggestionJobId,
  });
  const resolved = await resolvePlatformAudiencePresets(
    account,
    b.categoryId,
    config,
  );
  config.audiences = verifyManualAudienceSelections(
    actor,
    account,
    { ...config, audiences: resolved.audiences },
    resolved.trusted,
  );
  validateCampaignDestination(config);
  const a = config.audiences[0];
  if (a.interests?.length && a.interestSource !== "MANUAL") {
    const job = b.aiSuggestionJobId
        ? await db.generationJob.findUnique({
            where: { id: b.aiSuggestionJobId },
          })
        : null,
      snapshot = object(job?.snapshot);
    demand(
      job?.actorId === actor.id &&
        job.status === "COMPLETED" &&
        Date.now() - job.createdAt.getTime() < 3600000 &&
        snapshot.categoryId === b.categoryId &&
        snapshot.accountId === account.id &&
        snapshot.country === b.country &&
        snapshot.connectionRevision === account.connection.revision,
      "Vuelve a generar o seleccionar este público antes de guardarlo.",
      409,
    );
    const catalog = new Map<string, any>(
      (snapshot.interestCatalog ?? []).map((i: any) => [i.id, i]),
    );
    a.interests = a.interests.map((i) => {
      const hit = catalog.get(i.id);
      demand(
        hit,
        "La selección contiene intereses no confirmados por Meta.",
        409,
      );
      return { id: hit.id, name: hit.name };
    });
  }
  const {
    selectionProofs: _proofs,
    platformPresetId: _presetId,
    ...target
  } = a;
  const audience = { ...target, interestSource: "MANUAL" as const };
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({ name: b.name, audience, country: b.country, accountId }),
    )
    .digest("hex");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: { status: true, role: true },
    });
    demand(
      user?.status === "APPROVED" && user.role === actor.role,
      "Tu acceso cambió.",
      403,
    );
    const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { studio: true },
      }),
      studio = object(project.studio),
      rows = Array.isArray(studio.audiencePresets)
        ? studio.audiencePresets
        : [],
      old = rows.find((p: any) => p.id === b.requestId);
    if (old) {
      demand(
        old.fingerprint === fingerprint,
        "La solicitud corresponde a otro público.",
        409,
      );
      return { id: old.id, name: old.name, audience: old.audience };
    }
    demand(
      rows.length < 100,
      "Puedes guardar hasta 100 públicos por proyecto.",
      409,
    );
    const preset = {
      id: b.requestId,
      name: b.name,
      audience,
      accountId,
      country: b.country,
      fingerprint,
    };
    await tx.project.update({
      where: { id: projectId },
      data: { studio: json({ ...studio, audiencePresets: [...rows, preset] }) },
    });
    return { id: preset.id, name: preset.name, audience: preset.audience };
  });
}
