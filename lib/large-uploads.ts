import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { store, remove, storageByteLimit } from "./storage";
import { validateUpload } from "./uploads";
import {
  maxResourceFileBytes,
  uploadChunkBytes,
  expectedChunkBytes,
  largeFileMime,
  resourceFilename,
} from "./large-upload-limits";
import { rateLimit } from "./auth";
import { recordActivity } from "./activity";
type Actor = { id: string; role: string };
const send = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const expires = () => new Date(Date.now() + 48 * 3600000);
async function account(tx: Pick<typeof db, "user">, actor: Actor) {
  const u = await tx.user.findUnique({
    where: { id: actor.id },
    select: { status: true, role: true },
  });
  demand(
    u?.status === "APPROVED" && u.role === actor.role && u.role !== "OBSERVER",
    "La cuenta ya no puede subir archivos.",
    403,
  );
}
export async function boundedUploadBody(req: NextRequest, max: number) {
  demand(
    Number(req.headers.get("content-length") ?? 0) <= max,
    "El fragmento supera el tamaño permitido.",
    413,
  );
  const reader = req.body?.getReader();
  demand(reader, "Falta el contenido del archivo.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.length;
    if (total > max) {
      await reader.cancel();
      demand(false, "El fragmento supera el tamaño permitido.", 413);
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}
function headerMatches(mime: string, b: Buffer) {
  if (mime === "image/png")
    return b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === "image/webp")
    return (
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    );
  if (mime === "application/pdf") return b.toString("ascii", 0, 5) === "%PDF-";
  if (mime.includes("wordprocessingml"))
    return b.toString("ascii", 0, 2) === "PK";
  return !b.subarray(0, 4096).includes(0);
}
export async function largeUploadRoutes(
  req: NextRequest,
  parts: string[],
  actor: Actor,
  body: () => Promise<unknown>,
) {
  demand(
    actor.role !== "OBSERVER",
    "Observador solo puede ver y descargar.",
    403,
  );
  if (parts.length === 2 && req.method === "POST") {
    await rateLimit("large-upload-start:" + actor.id, 1000);
    const b = z
      .object({
        clientKey: z.uuid(),
        name: z.string().min(1).max(500),
        size: z.number().int().positive().max(maxResourceFileBytes),
        folderId: z.string().min(1).max(100).nullable(),
        purpose: z.enum([
          "Fotografía principal",
          "Referencia visual",
          "Fondo",
          "Logo",
          "Material de contexto",
        ]),
      })
      .strict()
      .parse(await body());
    const name = resourceFilename(b.name),
      mime = largeFileMime(name);
    demand(
      name && mime,
      "Usa PNG, JPG, WebP, PDF, DOCX, TXT o CSV para archivos grandes. Los SVG se admiten hasta 3 MB.",
    );
    const asset = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(440819)`;
      await account(tx, actor);
      const previous = await tx.largeAsset.findUnique({
        where: {
          userId_clientKey: { userId: actor.id, clientKey: b.clientKey },
        },
      });
      if (previous) {
        demand(
          previous.size === b.size &&
            previous.name === name &&
            previous.folderId === b.folderId,
          "La subida pertenece a otro archivo.",
          409,
        );
        return previous;
      }
      demand(
        !b.folderId ||
          (await tx.libraryFolder.findFirst({
            where: { id: b.folderId, userId: actor.id },
            select: { id: true },
          })),
        "Carpeta no disponible.",
        404,
      );
      const [small, large, audit] = await Promise.all([
        tx.storedAsset.aggregate({ _sum: { size: true } }),
        tx.largeAsset.aggregate({ _sum: { size: true } }),
        tx.auditThumbnail.aggregate({ _sum: { size: true } }),
      ]);
      demand(
        (small._sum.size ?? 0) +
          (large._sum.size ?? 0) +
          (audit._sum.size ?? 0) +
          b.size +
          3000000 <=
          storageByteLimit(),
        "No hay espacio configurado suficiente para este archivo. Libera archivos o amplía el almacenamiento.",
        413,
      );
      return tx.largeAsset.create({
        data: {
          id: randomUUID(),
          userId: actor.id,
          clientKey: b.clientKey,
          name,
          mime,
          size: b.size,
          folderId: b.folderId,
          purpose: b.purpose,
          expiresAt: expires(),
        },
      });
    });
    return send(
      {
        id: asset.id,
        status: asset.status,
        chunkBytes: uploadChunkBytes,
        receivedBytes: asset.receivedBytes,
      },
      201,
    );
  }
  const id = z.uuid().parse(parts[2]),
    asset = await db.largeAsset.findFirst({ where: { id, userId: actor.id } });
  demand(asset, "Subida no disponible.", 404);
  if (parts.length === 3 && req.method === "GET") {
    const chunks = await db.largeAssetChunk.findMany({
      where: { assetId: id },
      select: { index: true },
    });
    return send({
      id,
      status: asset.status,
      size: asset.size,
      receivedBytes: asset.receivedBytes,
      indices: chunks.map((c) => c.index),
      chunkBytes: uploadChunkBytes,
    });
  }
  if (parts.length === 3 && req.method === "DELETE") {
    demand(
      asset.status === "UPLOADING",
      "El archivo ya está guardado. Elimínalo desde Almacenamiento.",
      409,
    );
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "LargeAsset" WHERE id=${id} FOR UPDATE`;
      await account(tx, actor);
      await tx.largeAsset.deleteMany({
        where: { id, userId: actor.id, status: "UPLOADING" },
      });
    });
    return send({ ok: true });
  }
  if (parts[3] === "chunks" && req.method === "PUT") {
    const index = z.coerce.number().int().min(0).parse(parts[4]),
      expected = expectedChunkBytes(asset.size, index);
    demand(expected, "Fragmento fuera del archivo.");
    const bytes = await boundedUploadBody(req, uploadChunkBytes);
    demand(
      bytes.length === expected,
      "El fragmento está incompleto. Vuelve a enviar esa parte.",
      400,
    );
    if (index === 0)
      demand(
        headerMatches(asset.mime, bytes),
        "El contenido no coincide con el formato del archivo.",
      );
    const checksum = createHash("sha256").update(bytes).digest("hex");
    return send(
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "LargeAsset" WHERE id=${id} FOR UPDATE`;
        await account(tx, actor);
        const a = await tx.largeAsset.findUniqueOrThrow({ where: { id } });
        demand(
          a.status === "UPLOADING" && a.expiresAt > new Date(),
          "La subida terminó o caducó. Inicia una nueva.",
          409,
        );
        const previous = await tx.largeAssetChunk.findUnique({
          where: { assetId_index: { assetId: id, index } },
          select: { checksum: true },
        });
        if (previous) {
          demand(
            previous.checksum === checksum,
            "Este fragmento ya existe con otro contenido. Inicia una nueva subida.",
            409,
          );
          return { ok: true, receivedBytes: a.receivedBytes };
        }
        await tx.largeAssetChunk.create({
          data: {
            assetId: id,
            index,
            size: bytes.length,
            checksum,
            data: new Uint8Array(bytes),
          },
        });
        const updated = await tx.largeAsset.update({
          where: { id },
          data: {
            receivedBytes: { increment: bytes.length },
            expiresAt: expires(),
          },
        });
        return { ok: true, receivedBytes: updated.receivedBytes };
      }),
    );
  }
  if (parts[3] === "complete" && req.method === "POST") {
    if (asset.status === "COMPLETE") {
      const doc = await db.libraryDocument.findFirst({
        where: { id: asset.documentId!, userId: actor.id, deletedAt: null },
      });
      demand(doc, "El archivo fue retirado. Inicia otra subida.", 409);
      return send(doc);
    }
    const raw = await boundedUploadBody(req, 3100000),
      form = await new Response(new Uint8Array(raw), {
        headers: { "Content-Type": req.headers.get("content-type") ?? "" },
      }).formData();
    const preview = form.get("preview"),
      excerpt = String(form.get("excerpt") ?? "");
    demand(
      excerpt.length <= 100000 && !excerpt.includes("\0"),
      "El extracto supera el tamaño permitido.",
    );
    let previewPath: string | null = null;
    if (preview instanceof File && preview.size) {
      demand(
        asset.mime.startsWith("image/") && preview.size <= 3000000,
        "Vista previa no válida.",
      );
      const checked = await validateUpload(preview);
      demand(
        checked.mime.startsWith("image/"),
        "La vista previa debe ser una imagen.",
      );
      const sharp = (await import("sharp")).default;
      previewPath = await store(
        await sharp(checked.bytes)
          .rotate()
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer(),
      );
    }
    try {
      const document = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(428281)`;
        await tx.$queryRaw`SELECT id FROM "LargeAsset" WHERE id=${id} FOR UPDATE`;
        await account(tx, actor);
        const a = await tx.largeAsset.findUniqueOrThrow({ where: { id } });
        if (a.status === "COMPLETE")
          return tx.libraryDocument.findUniqueOrThrow({
            where: { id: a.documentId! },
          });
        demand(
          a.status === "UPLOADING" && a.expiresAt > new Date(),
          "La subida caducó. Inicia una nueva.",
          409,
        );
        const count = await tx.largeAssetChunk.count({
          where: { assetId: id },
        });
        demand(
          a.receivedBytes === a.size &&
            count === Math.ceil(a.size / uploadChunkBytes),
          "Todavía faltan fragmentos por subir.",
          409,
        );
        demand(
          !a.folderId ||
            (await tx.libraryFolder.findFirst({
              where: { id: a.folderId, userId: actor.id },
              select: { id: true },
            })),
          "La carpeta fue retirada. Inicia una subida en otra carpeta.",
          404,
        );
        const doc = await tx.libraryDocument.create({
          data: {
            userId: actor.id,
            folderId: a.folderId,
            destinationKey: a.folderId ? "folder:" + a.folderId : "loose:root",
            name: a.name,
            mime: a.mime,
            path: "large:" + id,
            size: a.size,
            purpose: a.purpose,
            previewPath,
            generationReady:
              !!previewPath ||
              (["text/plain", "text/csv"].includes(a.mime) && !!excerpt.trim()),
            text: ["text/plain", "text/csv"].includes(a.mime) ? excerpt : "",
            description: "",
          },
        });
        await tx.largeAsset.update({
          where: { id },
          data: { status: "COMPLETE", documentId: doc.id, previewPath },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "ARCHIVO_GRANDE_GUARDADO",
            resourceId: doc.id,
            detail: { size: a.size },
          },
        });
        return doc;
      });
      if (previewPath && document.previewPath !== previewPath)
        await remove(previewPath);
      return send(document, 201);
    } catch (error) {
      if (previewPath) {
        const committed = await db.libraryDocument.findFirst({
          where: { path: "large:" + id, previewPath },
          select: { id: true },
        });
        if (!committed) await remove(previewPath).catch(() => {});
      }
      throw error;
    }
  }
  return send({ error: "Operación de subida no disponible." }, 404);
}
export async function largeAssetStream(path: string, range: string | null) {
  const id = path.slice(6);
  demand(/^large:[a-f0-9-]{36}$/.test(path), "Archivo no válido.");
  const asset = await db.largeAsset.findUnique({ where: { id } });
  demand(asset?.status === "COMPLETE", "Archivo no disponible.", 404);
  let start = 0,
    end = asset.size - 1;
  let partial = false;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return {
        status: 416,
        headers: { "Content-Range": `bytes */${asset.size}` },
        stream: null,
      };
    if (!match[1]) start = Math.max(0, asset.size - Number(match[2]));
    else start = Number(match[1]);
    if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
    if (!Number.isSafeInteger(start) || start > end || start >= asset.size)
      return {
        status: 416,
        headers: { "Content-Range": `bytes */${asset.size}` },
        stream: null,
      };
    partial = true;
  }
  let cursor = start;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (cursor > end) {
          controller.close();
          return;
        }
        const index = Math.floor(cursor / uploadChunkBytes),
          chunk = await db.largeAssetChunk.findUnique({
            where: { assetId_index: { assetId: id, index } },
            select: { data: true },
          });
        demand(chunk, "Falta un fragmento del archivo.", 410);
        const offset = cursor - index * uploadChunkBytes,
          length = Math.min(chunk.data.length - offset, end - cursor + 1);
        controller.enqueue(chunk.data.subarray(offset, offset + length));
        cursor += length;
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return {
    status: partial ? 206 : 200,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(partial
        ? { "Content-Range": `bytes ${start}-${end}/${asset.size}` }
        : {}),
    },
    stream,
  };
}
export async function cleanupIncompleteUploads(now = new Date()) {
  const rows = await db.largeAsset.findMany({
    where: { status: "UPLOADING", expiresAt: { lte: now } },
    select: { id: true },
    take: 10,
  });
  let count = 0;
  for (const row of rows)
    count += await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "LargeAsset" WHERE id=${row.id} FOR UPDATE`;
      return (
        await tx.largeAsset.deleteMany({
          where: { id: row.id, status: "UPLOADING", expiresAt: { lte: now } },
        })
      ).count;
    });
  return count;
}
