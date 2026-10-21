import sharp from "sharp";
import { db } from "../db";
import { demand, AppError } from "../errors";
import { access, type Actor } from "./service";
export function thumbnailURL(raw: string) {
  const u = new URL(raw);
  demand(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      (u.hostname.endsWith(".fbcdn.net") ||
        u.hostname.endsWith(".facebook.com")) &&
      !u.searchParams.has("access_token"),
    "Miniatura de Meta no disponible.",
    404,
  );
  return u;
}
export async function metaThumbnail(actor: Actor, id: string) {
  const obj = await db.metaAdObject.findUnique({ where: { id } });
  demand(obj, "Anuncio no disponible.", 404);
  await access(actor, obj.accountId);
  demand(obj.thumbnailUrl, "Este anuncio no tiene miniatura disponible.", 404);
  const url = thumbnailURL(obj.thumbnailUrl);
  let r: Response;
  try {
    r = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new AppError(
      "La miniatura de Meta ya no está disponible. Sincroniza para actualizarla.",
      404,
    );
  }
  demand(
    r.ok &&
      /^image\/(png|jpeg|webp)(;|$)/i.test(r.headers.get("content-type") ?? ""),
    "Formato de miniatura no disponible.",
    404,
  );
  const reader = r.body?.getReader();
  demand(reader, "Miniatura vacía.", 404);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      demand(size <= 3000000, "Miniatura demasiado grande.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  let image: Buffer;
  try {
    image = await sharp(Buffer.concat(chunks), { limitInputPixels: 12000000 })
      .rotate()
      .resize(180, 180, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    throw new AppError("No se pudo preparar la miniatura de Meta.", 404);
  }
  await access(actor, obj.accountId);
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
