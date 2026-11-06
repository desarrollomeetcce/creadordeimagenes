import { demand } from "../errors";
import type { MetaReader } from "../meta-ads/provider";

/** Only normalize the number returned by Meta. Never infer a country code or accept free text. */
export function metaPageWhatsAppNumber(value: unknown) {
  if (typeof value !== "string") return "";
  const number = value.trim().replace(/[\s()-]/g, "");
  return /^\+?\d{7,15}$/.test(number) ? "+" + number.replace(/^\+/, "") : "";
}

export async function readMetaPageWhatsApp(
  reader: MetaReader,
  accountId: string,
  pageId: string,
) {
  const result = await reader.launchRequest(
    accountId,
    "object",
    undefined,
    pageId,
    "id,whatsapp_number",
  );
  demand(
    String(result.id) === pageId,
    "Meta devolvió otra página. Actualiza antes de preparar la campaña.",
    502,
  );
  const number = metaPageWhatsAppNumber(result.whatsapp_number);
  demand(
    number,
    "Meta no devolvió el WhatsApp vinculado a esta página. Revisa la vinculación y el acceso en Meta; no se usará un número escrito manualmente.",
    409,
  );
  return number;
}
