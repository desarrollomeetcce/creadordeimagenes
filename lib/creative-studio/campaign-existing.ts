import { z } from "zod";
import { demand } from "../errors";
import { rateLimit } from "../auth";
import { reader } from "../meta-ads/service";
import type { MetaReader } from "../meta-ads/provider";
import {
  campaignDestination,
  campaignObjective,
  type CampaignConfig,
} from "./campaign-policy";
import type { Actor } from "./service";
import { metaId } from "./campaign-workbench-policy";

const campaignFields =
  "id,name,account_id,objective,status,effective_status,daily_budget,lifetime_budget,special_ad_categories";
const adsetFields =
  "id,name,account_id,campaign_id,status,effective_status,destination_type,optimization_goal,daily_budget,lifetime_budget,targeting,promoted_object,placement_soft_opt_out";
export async function existingCampaignContext(
  r: MetaReader,
  accountId: string,
  config: CampaignConfig,
) {
  if (!config.existingCampaignId) return {};
  const campaign = await r.launchRequest(
    accountId,
    "object",
    undefined,
    config.existingCampaignId,
    campaignFields,
  );
  demand(
    String(campaign.id) === config.existingCampaignId &&
      String(campaign.account_id).replace(/^act_/, "") === accountId,
    "La campaña no pertenece a la cuenta seleccionada.",
    409,
  );
  demand(
    campaign.status === "ACTIVE" && campaign.effective_status === "ACTIVE",
    "Selecciona una campaña activa; su estado cambió.",
    409,
  );
  demand(
    campaign.objective === campaignObjective(config),
    "El objetivo no coincide con la campaña seleccionada.",
    409,
  );
  const categories = Array.isArray(campaign.special_ad_categories)
    ? campaign.special_ad_categories
    : [];
  demand(
    JSON.stringify(categories) ===
      JSON.stringify(
        config.specialCategory === "NONE" ? [] : [config.specialCategory],
      ),
    "La categoría publicitaria no coincide con la campaña existente.",
    409,
  );
  const ids =
    config.existingAdsetIds ??
    (config.existingAdsetId ? [config.existingAdsetId] : []);
  if (!ids.length) {
    demand(
      Number(campaign.daily_budget) > 0 ||
        Number(campaign.lifetime_budget) > 0 ||
        !!config.adsetDailyBudget,
      "Esta campaña usa presupuesto por conjunto. Indica el presupuesto de los nuevos conjuntos.",
      409,
    );
    return { existingCampaign: campaign };
  }
  const found = await r.launchRequest(
    accountId,
    "objects",
    undefined,
    ids.join(","),
    adsetFields,
  );
  const adsets = ids.map((id) => {
    const adset = found[id];
    demand(
      adset &&
        String(adset.id) === id &&
        String(adset.account_id).replace(/^act_/, "") === accountId &&
        String(adset.campaign_id) === String(campaign.id),
      "El conjunto no pertenece a la campaña y cuenta elegidas.",
      409,
    );
    demand(
      adset.status === "ACTIVE" && adset.effective_status === "ACTIVE",
      "Selecciona un conjunto activo; su estado cambió.",
      409,
    );
    demand(
      adset.destination_type === campaignDestination(config),
      "El destino no coincide con el conjunto seleccionado.",
      409,
    );
    const geo = adset.targeting?.geo_locations ?? {};
    const countries = new Set<string>(
      [
        ...(geo.countries ?? []),
        ...(geo.cities ?? []).map((l: any) => l.country),
        ...(geo.regions ?? []).map((l: any) => l.country),
      ].filter(Boolean),
    );
    demand(
      countries.size === 1 && countries.has(config.country),
      "El país del conjunto no coincide o no se puede verificar. Selecciona otro conjunto.",
      409,
    );
    if (config.objective !== "TRAFFIC")
      demand(
        String(adset.promoted_object?.page_id) === config.pageId,
        "El conjunto pertenece a otra página. Selecciona la misma página para añadir sus anuncios.",
        409,
      );
    return adset;
  });
  return {
    existingCampaign: campaign,
    existingAdset: adsets[0],
    existingAdsets: adsets,
  };
}
export async function searchCampaignParents(
  actor: Actor,
  accountId: string,
  input: unknown,
) {
  const b = z
    .object({
      kind: z.enum(["campaigns", "adsets"]),
      campaignId: metaId.optional(),
      q: z.string().trim().max(80).optional(),
      after: z.string().max(1000).optional(),
    })
    .strict()
    .parse(input);
  const { primaryAccount } = await import("./campaigns");
  const a = await primaryAccount(actor, accountId);
  await rateLimit("studio-search:" + actor.id, 60);
  const { reader: r } = await reader(a.connectionId, false, true);
  if (b.kind === "adsets") {
    demand(b.campaignId, "Selecciona primero una campaña.");
    const parent = await r.launchRequest(
      accountId,
      "object",
      undefined,
      b.campaignId,
      campaignFields,
    );
    demand(
      String(parent.account_id).replace(/^act_/, "") === a.id &&
        parent.status === "ACTIVE",
      "La campaña ya no está activa o autorizada.",
      409,
    );
  }
  const result = await r.campaignDirectory(a.id, b.kind, {
    campaignId: b.campaignId,
    query: b.q,
    after: b.after,
  });
  const rows = result.data.filter(
    (v: any) =>
      /^\d{1,40}$/.test(String(v.id)) &&
      v.status === "ACTIVE" &&
      v.effective_status === "ACTIVE" &&
      (b.kind !== "adsets" || String(v.campaign_id) === b.campaignId),
  );
  return {
    items: rows.map((v: any) => ({
      id: String(v.id),
      name: String(v.name ?? v.id).slice(0, 250),
      objective: v.objective,
      supported:
        b.kind === "campaigns"
          ? ["OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_TRAFFIC"].includes(
              v.objective,
            )
          : ["WHATSAPP", "ON_AD", "WEBSITE"].includes(v.destination_type),
      campaignId: v.campaign_id,
      dailyBudget: typeof v.daily_budget === "string" ? v.daily_budget : null,
      lifetimeBudget:
        typeof v.lifetime_budget === "string" ? v.lifetime_budget : null,
      specialCategories: v.special_ad_categories ?? [],
      destination: v.destination_type,
      optimizationGoal: v.optimization_goal,
      targeting: b.kind === "adsets" ? v.targeting : undefined,
      pageId: v.promoted_object?.page_id,
      placementSoftOptOut: v.placement_soft_opt_out,
    })),
    after: result.after ?? null,
  };
}
