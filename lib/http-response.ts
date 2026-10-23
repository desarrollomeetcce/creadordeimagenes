// A gateway's empty response never confirms whether a write reached the server.
class HttpResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly malformed = false,
  ) {
    super(message);
  }
}
export async function readJsonResponse<T = any>(
  response: Response,
  fallback = "No se pudo completar la operación.",
  method = "GET",
): Promise<T> {
  const unreadable = () =>
    new HttpResponseError(
      `El servidor devolvió una respuesta vacía o incompleta (HTTP ${response.status}). ${method.toUpperCase() === "GET" ? "No se pudo cargar la información." : "No se confirmó el resultado; actualiza la vista antes de repetir la acción."}`,
      response.status,
      true,
    );
  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw unreadable();
  }
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    throw unreadable();
  }
  if (!response.ok) {
    throw new HttpResponseError(
      body && typeof body.error === "string" && body.error.trim()
        ? body.error
        : `${fallback} (HTTP ${response.status}).`,
      response.status,
    );
  }
  return body as T;
}
// Only local Meta GETs get one bounded retry. Never retry mutations, permissions or quota denials.
export async function fetchJsonResponse<T = any>(
  url: string,
  init: RequestInit = {},
  fallback?: string,
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const retryRead = method === "GET" && url.startsWith("/api/meta-ads/");
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, init);
      return await readJsonResponse<T>(response, fallback, method);
    } catch (error) {
      const transient =
        error instanceof HttpResponseError &&
        ([502, 503, 504].includes(error.status) ||
          (error.status >= 200 && error.status < 300 && error.malformed));
      if (!retryRead || attempt !== 0 || !transient || init.signal?.aborted)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
      init.signal?.throwIfAborted();
    }
  }
}
