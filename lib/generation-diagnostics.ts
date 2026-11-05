/** Public identifiers only. Never return the full generation snapshot or provider body. */
export function generationDiagnostics(jobs: { id: string; status: string; error?: string | null; snapshot: unknown }[]) {
  return jobs.filter(j => ["FAILED", "UNCERTAIN"].includes(j.status)).slice(0, 5).map(j => {
    const s = j.snapshot && typeof j.snapshot === "object" ? j.snapshot as Record<string, unknown> : {};
    const identifier = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_./:-]{1,150}$/.test(value) ? value : null;
    return {
      jobId: j.id,
      status: j.status,
      error: j.error ?? null,
      imageProvider: identifier(s.imageProvider),
      imageModel: identifier(s.imageModel),
      creativeProvider: identifier(s.creativeProvider),
      creativeModel: identifier(s.creativeModel),
    };
  });
}

/** Translate known rejection codes; never interpolate upstream error messages. */
export function openAIRejection(status: number, code?: string, param?: string) {
  const codes: Record<string, string> = {
    model_not_found: "El modelo no existe o tu cuenta no tiene acceso a él.",
    unsupported_parameter: "La solicitud contiene un parámetro que ese modelo no admite.",
    unsupported_value: "Uno de los valores no es compatible con ese modelo.",
    string_above_max_length: "Las instrucciones superan la longitud admitida por el proveedor.",
    string_too_long: "Las instrucciones superan la longitud admitida por el proveedor.",
    invalid_value: "Uno de los valores enviados no es válido.",
    content_policy_violation: "El proveedor rechazó el contenido por sus políticas.",
    organization_not_verified: "La organización debe completar la verificación para utilizar ese modelo.",
  };
  const fields: Record<string, string> = {
    model: "modelo", quality: "calidad", size: "resolución", output_format: "formato de salida",
    n: "cantidad", image: "imagen de referencia", "image[]": "imágenes de referencia",
    "reasoning.effort": "nivel de razonamiento", reasoning: "razonamiento",
    max_output_tokens: "límite de salida", input: "instrucciones", prompt: "instrucciones",
  };
  const reason = code ? codes[code] : undefined;
  const field = param ? fields[param] : undefined;
  if (![400, 403, 404, 422].includes(status) || (!reason && !field)) return null;
  return `OpenAI rechazó la solicitud (HTTP ${status}). ${reason ?? "Revisa la configuración del modelo."}${field ? ` Campo: ${field}.` : ""} No se repetirá automáticamente.`;
}
