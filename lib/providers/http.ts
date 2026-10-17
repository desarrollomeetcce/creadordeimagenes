import sharp from "sharp";
import { AppError, demand } from "../errors";
export async function boundedBytes(response: Response, max: number) {
  demand(response.ok, "El proveedor no pudo entregar la imagen.", 502);
  demand(
    Number(response.headers.get("content-length") ?? 0) <= max,
    "La respuesta del proveedor supera el tamaño permitido.",
    502,
  );
  const reader = response.body?.getReader();
  demand(reader, "El proveedor devolvió una respuesta vacía.", 502);
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      demand(
        total <= max,
        "La respuesta del proveedor supera el tamaño permitido.",
        502,
      );
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
export function safeProviderError(name: string, status: number) {
  if (status === 401 || status === 403)
    return `${name} no autorizó la solicitud. Revisa la clave y sus permisos de API.`;
  if (status === 429 || status === 402)
    return `${name} informa un límite de uso o saldo insuficiente. Revisa su facturación de API antes de otro intento.`;
  if (status === 400 || status === 404 || status === 422)
    return `${name} no admite el modelo, los archivos o los parámetros seleccionados. Consulta de nuevo sus modelos y revisa la configuración.`;
  return `${name} no está disponible. Revisa su estado antes de autorizar otro intento.`;
}
export async function providerJSON(
  name: string,
  url: string,
  init: RequestInit = {},
  max = 20000000,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new AppError(
      `No se pudo contactar con ${name}. Una generación interrumpida puede haber producido un cargo; no se repetirá automáticamente.`,
      502,
    );
  }
  demand(response.ok, safeProviderError(name, response.status), 502);
  try {
    return JSON.parse((await boundedBytes(response, max)).toString("utf8"));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(`${name} devolvió una respuesta ilegible.`, 502);
  }
}
export async function normalizedImage(bytes: Buffer) {
  demand(
    bytes.length > 0 && bytes.length <= 24000000,
    "El proveedor devolvió una imagen vacía o demasiado grande.",
    502,
  );
  try {
    const result = await sharp(bytes, {
      limitInputPixels: 20000000,
      animated: false,
    })
      .rotate()
      .png()
      .toBuffer();
    demand(
      result.length <= 16000000,
      "La imagen del proveedor supera el tamaño permitido.",
      502,
    );
    return result;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("La respuesta no contiene una imagen compatible.", 502);
  }
}
export async function downloadProviderImage(
  url: string,
  domains: string[],
  signal?: AbortSignal,
) {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new AppError(
      "El proveedor no devolvió una dirección de imagen válida.",
      502,
    );
  }
  demand(
    target.protocol === "https:" &&
      !target.username &&
      !target.password &&
      (!target.port || target.port === "443") &&
      domains.some(
        (d) => target.hostname === d || target.hostname.endsWith("." + d),
      ),
    "El proveedor devolvió una dirección de imagen no autorizada.",
    502,
  );
  let response: Response;
  try {
    response = await fetch(target, {
      signal: signal ?? AbortSignal.timeout(30000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new AppError(
      "No se pudo descargar la imagen del proveedor. Revisa el resultado antes de volver a generar.",
      502,
    );
  }
  return normalizedImage(await boundedBytes(response, 24000000));
}
export function imageBase64(value: unknown) {
  demand(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 32000000 &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(value),
    "El proveedor no devolvió una imagen codificada válida.",
    502,
  );
  return normalizedImage(Buffer.from(value, "base64"));
}
export const providerSignal = (signal?: AbortSignal, ms = 180000) =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(ms)])
    : AbortSignal.timeout(ms);
