import {
  campaignConfigSchema,
  validateCampaignText,
  validateRenderedConversation,
  type CampaignConfig,
  type CampaignItem,
} from "./campaign-policy";
export type CampaignFieldProblem = {
  field: string;
  message: string;
  code?: string;
};
export class StudioRequestError extends Error {
  readonly fields: CampaignFieldProblem[];
  constructor(message: string, fields?: unknown) {
    super(message);
    this.name = "StudioRequestError";
    this.fields = Array.isArray(fields)
      ? fields
          .filter(
            (v): v is CampaignFieldProblem =>
              !!v &&
              typeof v.field === "string" &&
              v.field.length <= 300 &&
              typeof v.message === "string" &&
              v.message.length <= 2000,
          )
          .slice(0, 100)
      : [];
  }
}
const names: Record<string, string> = {
  accountId: "Cuenta publicitaria",
  pageId: "Página de Facebook",
  country: "País de destino",
  dailyBudget: "Presupuesto de campaña",
  adsetDailyBudget: "Presupuesto por conjunto",
  campaignName: "Nombre de campaña",
  objective: "Objetivo",
  body: "Texto principal",
  headline: "Headline",
  description: "Descripción",
  platforms: "Plataformas",
  placements: "Ubicaciones",
  audiences: "Cantidad de conjuntos de anuncios",
  code: "Variable {codigo} guardada",
  name: "Nombre de configuración guardada",
  existingCampaignId: "Campaña existente",
  existingAdsetId: "Conjunto existente",
  existingAdsetIds: "Conjuntos existentes",
  conversation: "Plantilla de conversación",
  beneficiary: "Beneficiario",
  payor: "Pagador",
  specialCategory: "Categoría publicitaria",
  website: "Página web de destino",
  leadFormId: "Formulario de clientes potenciales",
  distribution: "Distribución de anuncios",
  items: "Productos y recursos seleccionados",
  variables: "Variables de los textos",
  targetStatus: "Estado de publicación",
  whatsapp: "WhatsApp de la página",
  ai: "Campos marcados con IA",
  categoryId: "Producto seleccionado",
  requestId: "Preparación de la campaña",
};
export function campaignFieldPath(field: string) {
  const path = field.replace(/^config\./, "");
  return ["autofill", "greeting"].includes(path)
    ? "conversation." + path
    : path;
}
export function campaignProblemLabel(problem: CampaignFieldProblem) {
  const path = campaignFieldPath(problem.field).split(".");
  if (path[0] === "conversation" && path[1]) {
    const labels: Record<string, string> = {
      autofill: "Mensaje inicial del interesado",
      greeting: "Saludo de la conversación",
      name: "Nombre de la plantilla",
    };
    return labels[path[1]] ?? "Plantilla de conversación";
  }
  if (path[0] === "audiences" && /^\d+$/.test(path[1] ?? "")) {
    const suffix: Record<string, string> = {
      ageMin: "edad mínima",
      ageMax: "edad máxima",
      name: "nombre del conjunto",
      gender: "género",
      locations: "ubicaciones",
      interests: "intereses",
      detailedTargeting: "segmentación",
      savedAudienceId: "público guardado",
    };
    return `Público ${Number(path[1]) + 1}${path[2] ? " · " + (suffix[path[2]] ?? "segmentación") : ""}`;
  }
  if (path[0] === "items" && /^\d+$/.test(path[1] ?? ""))
    return `Producto ${Number(path[1]) + 1} · recursos seleccionados`;
  return names[path[0]] ?? "Configuración de campaña";
}
export function campaignProblemMessage(problem: CampaignFieldProblem) {
  const root = campaignFieldPath(problem.field).split(".")[0];
  const message = problem.message;
  // Translate Zod defaults; never replace an explicit Spanish validation reason.
  if (
    /^(Too |Invalid |Expected |Required|Unrecognized |Invalid input)/.test(
      message,
    )
  ) {
    const max = message.match(/<=\s*(\d+)/)?.[1],
      min = message.match(/>=\s*(\d+)/)?.[1];
    if (max)
      return `El máximo permitido es ${max}${/array/.test(message) ? " elementos" : /string/.test(message) ? " caracteres" : ""}.`;
    if (min && min !== "1")
      return `El mínimo permitido es ${min}${/array/.test(message) ? " elementos" : ""}.`;
    if (root === "items")
      return "Selecciona entre 1 y 10 productos, con 1 a 50 recursos válidos por producto.";
    if (["pageId", "accountId", "country", "leadFormId"].includes(root))
      return "Selecciona una opción válida.";
    if (["body", "headline"].includes(root)) return "Completa este texto.";
    if (/ageMin|ageMax/.test(problem.field))
      return "Indica una edad entre 18 y 65 años.";
    if (root === "audiences")
      return "Revisa los datos del público y la cantidad de conjuntos (1 a 10).";
    return "Completa o corrige este dato antes de continuar.";
  }
  return message;
}
export function campaignMessageProblem(
  message: string,
): CampaignFieldProblem | null {
  const rules: [RegExp, string][] = [
    [/marcados con IA/i, "ai"],
    [/presupuesto/i, "dailyBudget"],
    [/beneficiario/i, "beneficiary"],
    [/pagador/i, "payor"],
    [/distribuci|repart|al menos.*afiches/i, "distribution"],
    [/afiches|recursos|variaciones/i, "items"],
    [/edad|público|segmentaci/i, "audiences"],
    [/ubicaci|plataforma/i, "placements"],
    [/plantilla|conversaci/i, "conversation"],
    [/HTTPS|página web/i, "website"],
    [/formulario de clientes/i, "leadFormId"],
    [/variables|texto|headline/i, "body"],
  ];
  const match = rules.find(([pattern]) => pattern.test(message));
  return match ? { field: match[1], message } : null;
}

/** Values relevant to a validation issue; age limits depend on both ends. */
export function campaignProblemValue(
  config: Record<string, any>,
  problem: CampaignFieldProblem,
) {
  const parts = campaignFieldPath(problem.field).split(".");
  if (
    parts[0] === "audiences" &&
    /^\d+$/.test(parts[1] ?? "") &&
    (!parts[2] || ["ageMin", "ageMax"].includes(parts[2]))
  ) {
    const audience = config.audiences?.[Number(parts[1])];
    return JSON.stringify([audience?.ageMin, audience?.ageMax]);
  }
  if (parts[0] === "conversation")
    return JSON.stringify([
      parts[1] ? config.conversation?.[parts[1]] : config.conversation,
      config.country,
    ]);
  let value: any = config;
  for (const part of parts) value = value?.[part];
  return JSON.stringify(value);
}

/** Same campaign rules as preparation; only local checks, no API or paid calls. */
export function collectCampaignProblems(
  config: Record<string, unknown>,
  items: CampaignItem[],
): CampaignFieldProblem[] {
  const parsed = campaignConfigSchema.safeParse({ ...config, planVersion: 2 });
  const problems: CampaignFieldProblem[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
  for (const item of items) {
    try {
      if (parsed.success) validateCampaignText(item, parsed.data);
      else if (config.conversation && typeof config.country === "string")
        validateRenderedConversation(item, config as CampaignConfig);
    } catch (error) {
      if (error && typeof error === "object" && "issues" in error) {
        for (const issue of (
          error as { issues: { path: PropertyKey[]; message: string }[] }
        ).issues)
          problems.push({
            field: issue.path.join("."),
            message: issue.message,
          });
      } else if (error instanceof Error) {
        const problem = campaignMessageProblem(error.message);
        if (problem) problems.push(problem);
      }
    }
  }
  return [
    ...new Map(
      problems.map((problem) => [campaignFieldPath(problem.field), problem]),
    ).values(),
  ];
}
