import {
  campaignConfigSchema,
  imageDistribution,
  validateCampaignDestination,
  validateCampaignText,
  type CampaignConfig,
  type CampaignItem,
} from "./campaign-policy";
export function aiCampaignConfig(input: CampaignConfig, items: CampaignItem[]) {
  const checked = campaignConfigSchema.safeParse({
    ...input,
    body: "Texto generado por IA",
    description: input.description,
    targetStatus: "PAUSED",
    planVersion: 2,
  });
  if (!checked.success) {
    const labels: Record<string, string> = {
      accountId: "cuenta publicitaria",
      pageId: "página de Facebook",
      country: "país de destino",
      dailyBudget: "presupuesto diario mayor que cero",
      headline: "headline",
      platforms: "al menos una ubicación",
      audiences: "cantidad y configuración de conjuntos",
      campaignName: "nombre de campaña",
    };
    throw Error(
      "Revisa: " +
        [
          ...new Set(
            checked.error.issues.map(
              (i) => labels[String(i.path[0])] ?? String(i.path[0]),
            ),
          ),
        ].join(", ") +
        ".",
    );
  }
  const c = checked.data;
  if (!items.length)
    throw Error("Selecciona al menos un afiche para crear las campañas.");
  validateCampaignDestination(c);
  items.forEach((i) => {
    imageDistribution(i, c);
    validateCampaignText(i, c);
  });
  if (
    "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE"
      .split(" ")
      .includes(c.country) &&
    (!c.beneficiary.trim() || !c.payor.trim())
  )
    throw Error(
      "Indica beneficiario y pagador en Configuración legal para este país.",
    );
  return c;
}
export async function createAiPausedCampaigns(options: {
  requestId: string;
  categoryId: string;
  config: CampaignConfig;
  items: CampaignItem[];
  prompt: string;
  request: (path: string, method: string, body: any) => Promise<any>;
  onPrepared: (draft: any, config: CampaignConfig) => void;
  isCurrent: () => boolean;
  proposal?: any;
  onProposal: (proposal: any) => void;
}) {
  const c = aiCampaignConfig(options.config, options.items);
  const proposal =
    options.proposal ??
    (
      await options.request("/campaign-suggestion", "POST", {
        requestId: options.requestId,
        categoryId: options.categoryId,
        confirmAi: true,
        prompt:
          options.prompt.trim() ||
          "Redacta el texto y la descripción del anuncio para {diplomado} en {pais} y elige públicos demográficos apropiados. No inventes beneficios ni acreditaciones.",
        config: c,
        subproductIds: options.items.map((i) => i.subproductId),
      })
    ).proposal;
  if (!options.isCurrent())
    throw Error(
      "Cambió la selección o configuración. Revisa los datos antes de crear las campañas.",
    );
  options.onProposal(proposal);
  const config = campaignConfigSchema.parse({
    ...c,
    body: proposal.body,
    description: options.config.description.trim() || proposal.description,
    audiences: proposal.audiences,
    targetStatus: "PAUSED",
  });
  validateCampaignDestination(config);
  options.items.forEach((i) => {
    imageDistribution(i, config);
    validateCampaignText(i, config);
  });
  const draft = await options.request("/launches", "POST", {
    requestId: options.requestId,
    categoryId: options.categoryId,
    config,
    items: options.items.map((i) => ({
      subproductId: i.subproductId,
      variationIds: i.variationIds,
    })),
  });
  if (draft.config?.targetStatus !== "PAUSED")
    throw Error(
      "Esta publicación no está configurada como pausada. Revisa el borrador.",
    );
  options.onPrepared(draft, config);
  if (!options.isCurrent())
    throw Error(
      "Cambió la selección. El borrador quedó guardado sin iniciar la publicación.",
    );
  return options.request("/launches/" + draft.id + "/publish", "POST", {
    revision: draft.revision,
    confirmPublish: true,
    confirmSpend: false,
  });
}
