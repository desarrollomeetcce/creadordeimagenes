export function openAITextRequest(
  model: string,
  instructions: string,
  input: string,
) {
  // Validate JSON locally; not every Responses model supports the optional JSON mode.
  return { model, instructions, input, max_output_tokens: 14000 };
}
export function openAIRequestDetail(value: unknown) {
  const e = (value as { error?: { code?: unknown; param?: unknown } })?.error;
  const codes = [
    "model_not_found",
    "unsupported_parameter",
    "unsupported_value",
    "invalid_value",
    "invalid_request_error",
    "insufficient_quota",
    "rate_limit_exceeded",
  ];
  const params = [
    "model",
    "text.format",
    "text.format.type",
    "max_output_tokens",
    "input",
    "instructions",
  ];
  const code =
    typeof e?.code === "string" && codes.includes(e.code) ? e.code : "";
  const param =
    typeof e?.param === "string" && params.includes(e.param) ? e.param : "";
  return [code ? "Código: " + code : "", param ? "Parámetro: " + param : ""]
    .filter(Boolean)
    .join(" · ");
}
