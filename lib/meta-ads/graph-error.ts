import { AppError } from "../errors";
export type GraphDiagnostic = {
  httpStatus: number;
  code: number | null;
  subcode: number | null;
  message: string;
  version: string;
  endpoint: string;
  fields: string;
};
export function redactGraphMessage(value: unknown, token: string) {
  let message =
    typeof value === "string"
      ? value
      : "Meta no devolvió un mensaje de error compatible.";
  message = message.replace(/(?:%[0-9a-f]{2})+/gi, (fragment) => {
    try {
      return decodeURIComponent(fragment);
    } catch {
      return "[dato omitido]";
    }
  });
  // Only this bounded, scrubbed message may reach the UI/audit. Never retain the response envelope.
  for (const secret of [
    token,
    encodeURIComponent(token),
    JSON.stringify(token).slice(1, -1),
  ])
    if (secret) message = message.split(secret).join("[credencial omitida]");
  return message
    .replace(/https?:\/\/[^\s<>"']+/gi, "[URL omitida]")
    .replace(/(?:Bearer\s+)[^\s,"';]+/gi, "Bearer [credencial omitida]")
    .replace(
      /(?:access_token|client_secret|appsecret_proof|authorization)\s*[=:]\s*["']?[^\s,"';}]+/gi,
      "credencial=[omitida]",
    )
    .replace(/[A-Za-z0-9_.~+\/-]{32,}/g, "[dato omitido]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 600);
}
export class MetaGraphError extends AppError {
  diagnostic: GraphDiagnostic;
  constructor(
    status: number,
    payload: unknown,
    token: string,
    context: { version: string; endpoint: string; fields: string },
  ) {
    const raw =
      payload && typeof payload === "object"
        ? (payload as { error?: unknown }).error
        : null;
    const error =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const integer = (v: unknown) =>
      typeof v === "number" && Number.isSafeInteger(v) ? v : null;
    const diagnostic = {
      httpStatus: status,
      code: integer(error.code),
      subcode: integer(error.error_subcode),
      message: redactGraphMessage(error.message, token),
      ...context,
    };
    super(
      `Meta Graph ${context.version} · GET /${context.endpoint} · campos ${context.fields} · HTTP ${status}${diagnostic.code !== null ? ` · código ${diagnostic.code}` : ""}${diagnostic.subcode !== null ? ` / subcódigo ${diagnostic.subcode}` : ""}: ${diagnostic.message}`,
      status === 429 ? 429 : 502,
    );
    this.name = "MetaGraphError";
    this.diagnostic = diagnostic;
  }
}
export const optionalFieldError = (e: unknown): e is MetaGraphError =>
  e instanceof MetaGraphError &&
  [10, 100, 200].includes(e.diagnostic.code ?? -1) &&
  e.diagnostic.httpStatus !== 429;
