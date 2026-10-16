import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "./errors";
function master() {
  const raw = process.env.AI_MASTER_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw)
    throw new AppError(
      "Falta configurar una clave maestra válida de 32 bytes en el servidor.",
      503,
    );
  return key;
}
export function encryptKey(value: string, context = "global:openai") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", master(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(".");
}
export function decryptKey(value: string, context = "global:openai") {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data)
    throw new AppError("La credencial cifrada no es válida. Reemplázala.", 503);
  try {
    const cipher = createDecipheriv(
      "aes-256-gcm",
      master(),
      Buffer.from(iv, "base64"),
    );
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      cipher.update(Buffer.from(data, "base64")),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      "No se pudo descifrar la credencial. Comprueba la clave maestra del servidor.",
      503,
    );
  }
}
export const maskKey = (value: string) => "••••••••" + value.slice(-4);
