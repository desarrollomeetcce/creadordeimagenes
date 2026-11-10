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
  audiences: "Públicos",
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
  return field.replace(/^config\./, "");
}
export function campaignProblemLabel(problem: CampaignFieldProblem) {
  const path = campaignFieldPath(problem.field).split(".");
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
