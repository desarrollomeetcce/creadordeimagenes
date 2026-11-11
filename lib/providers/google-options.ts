/** GenerateContent image parameters vary by model family, not only provider. */
export function googleImageResolutions(model: string): string[] {
  if (/^gemini-3\.1-flash-lite-image(?:-|$)/.test(model)) return ["1K"];
  if (model.startsWith("imagen-")) return ["1:1", "3:4", "4:3", "9:16", "16:9"];
  if (
    /^gemini-3(?:\.\d+)?-(?:pro|flash)-image(?:-|$)/.test(model) ||
    /^gemini-nano-banana-2(?:\.1)?(?:-|$)/.test(model)
  )
    return ["1K", "2K", "4K"];
  return ["default"];
}
/** Public enums and field names only; never include Google messages, prompts or metadata. */
export function googleErrorDetail(value: unknown) {
  const root =
    value && typeof value === "object" ? (value as Record<string, any>) : {};
  const error = root.error && typeof root.error === "object" ? root.error : {};
  const statuses: Record<string, string> = {
    INVALID_ARGUMENT: "Google rechazó un parámetro de la solicitud.",
    NOT_FOUND: "El modelo o recurso no está disponible en esta API.",
    PERMISSION_DENIED: "Google denegó el acceso al modelo o proyecto.",
    UNAUTHENTICATED: "Google no pudo autenticar la clave.",
    RESOURCE_EXHAUSTED: "Google informa un límite de cuota o saldo.",
    FAILED_PRECONDITION: "Falta un requisito de la cuenta o del modelo.",
  };
  const reasons: Record<string, string> = {
    API_KEY_INVALID: "La clave API de Google no es válida.",
    API_KEY_EXPIRED: "La clave API de Google venció.",
    API_KEY_SERVICE_BLOCKED: "La clave no permite este servicio.",
    API_KEY_HTTP_REFERRER_BLOCKED:
      "Las restricciones de la clave bloquean esta solicitud desde el servidor.",
    API_KEY_IP_ADDRESS_BLOCKED:
      "Las restricciones IP de la clave bloquean este servidor.",
    SERVICE_DISABLED: "La API no está habilitada en el proyecto de Google.",
    BILLING_DISABLED:
      "La facturación del proyecto de Google no está habilitada.",
    FREE_TIER_VERIFICATION_REQUIRED:
      "Google requiere verificar el proyecto para usar el nivel gratuito.",
  };
  const fields: Record<string, string> = {
    model: "modelo",
    generationconfigimageconfigimagesize: "resolución de imagen",
    generationconfigimageconfigaspectratio: "proporción de imagen",
    generationconfigresponsemodalities: "modalidades de salida",
    generationconfigthinkingconfigthinkingbudget: "presupuesto de razonamiento",
    generationconfigthinkingconfigthinkinglevel: "nivel de razonamiento",
    generationconfigmaxoutputtokens: "límite de salida",
    generationconfigresponsemimetype: "formato de respuesta",
    contentspartsinlinedatamimetype: "tipo de imagen de referencia",
  };
  const descriptions = new Set<string>();
  if (typeof error.status === "string" && Object.hasOwn(statuses, error.status))
    descriptions.add(`${error.status}: ${statuses[error.status]}`);
  for (const detail of (Array.isArray(error.details)
    ? error.details
    : []
  ).slice(0, 10)) {
    if (!detail || typeof detail !== "object") continue;
    if (
      typeof detail.reason === "string" &&
      Object.hasOwn(reasons, detail.reason)
    )
      descriptions.add(`${detail.reason}: ${reasons[detail.reason]}`);
    for (const violation of (Array.isArray(detail.fieldViolations)
      ? detail.fieldViolations
      : []
    ).slice(0, 20)) {
      if (typeof violation?.field !== "string" || violation.field.length > 300)
        continue;
      const field = violation.field
        .replace(/\[\d+\]/g, "")
        .replace(/[_.]/g, "")
        .toLowerCase();
      if (Object.hasOwn(fields, field))
        descriptions.add(`Campo: ${fields[field]}.`);
    }
  }
  return [...descriptions].join(" ");
}
