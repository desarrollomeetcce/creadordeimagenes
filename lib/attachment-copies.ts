import { db } from "./db";
import { load, store, remove } from "./storage";
import { demand } from "./errors";
import type { Prisma } from "@prisma/client";

// Each destination owns its bytes: deleting a source never removes its copies.
// Storage writes precede the metadata transaction and are undone if it fails.
export async function withAttachmentCopies<T>(
  source: { scope: string; resourceId: string } | null,
  commit: (
    tx: Prisma.TransactionClient,
    copies: Prisma.AttachmentCreateManyInput[],
  ) => Promise<T>,
) {
  const files = source
    ? await db.attachment.findMany({
        where: { ...source, archivedAt: null },
        orderBy: { id: "asc" },
      })
    : [];
  demand(
    files.length <= 50 && files.reduce((n, f) => n + f.size, 0) <= 24000000,
    "La configuración supera 50 adjuntos o 24 MB. Reduce sus archivos antes de copiarla.",
    413,
  );
  const paths: string[] = [];
  const copies: Prisma.AttachmentCreateManyInput[] = [];
  let totalBytes = 0;
  try {
    for (const file of files) {
      const bytes = await load(file.path);
      totalBytes += bytes.length;
      demand(
        totalBytes <= 24000000,
        "Los archivos procesados superan 24 MB. Reduce los adjuntos antes de copiar la configuración.",
        413,
      );
      const path = await store(bytes);
      paths.push(path);
      copies.push({
        scope: "",
        resourceId: "",
        name: file.name,
        mime: file.mime,
        purpose: file.purpose,
        text: file.text,
        size: bytes.length,
        path,
      });
    }
    return await db.$transaction(async (tx) => commit(tx, copies), {
      timeout: 15000,
    });
  } catch (error) {
    await Promise.allSettled(paths.map(remove));
    throw error;
  }
}
