import { createDecipheriv } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { demand } from "../errors";
/** The key arrives only in an authenticated POST, never from source or environment. */
export function unsealHistory(envelope: string, key: string): unknown {
  demand(/^[A-Za-z0-9_-]{43}$/.test(key), "El enlace privado no es válido.");
  try {
    const [version, iv, tag, body, extra] = envelope.split(".");
    if (version !== "v1" || !iv || !tag || !body || extra)
      throw Error("Invalid envelope");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "base64url"),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from("financial-history-import:v1"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const compressed = Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(
      gunzipSync(compressed, { maxOutputLength: 1800000 }).toString("utf8"),
    );
  } catch {
    demand(
      false,
      "No se pudo abrir el histórico con este enlace privado.",
      400,
    );
  }
}
