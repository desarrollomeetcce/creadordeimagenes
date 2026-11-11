import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { exportCollection } from "./collections";
import { libraryTree } from "./library-explorer";
import {
  authorizedImages,
  locationFilter,
  subtree,
} from "./library-organization";
import {
  delegatedImageIds,
  personalFolderContext,
} from "./personal-folder-access";

type Actor = { id: string; role: string };
export const libraryDownloadSchema = z
  .object({
    selection: z
      .array(z.string().regex(/^[vcdn]:.{1,150}$/))
      .min(1)
      .max(200),
    format: z.enum(["png", "jpg"]).default("png"),
  })
  .strict();

/** Resolve selected folder descendants and copies, then reuse the ZIP's byte/access checks. */
export async function libraryDownloadIds(actor: Actor, selection: string[]) {
  const tokens = [
    ...new Set(libraryDownloadSchema.parse({ selection }).selection),
  ];
  if (!tokens.some((t) => t.startsWith("n:") || t.startsWith("c:"))) {
    const direct = tokens
      .filter((t) => t.startsWith("v:"))
      .map((t) => t.slice(2));
    demand(
      direct.length,
      "Selecciona imágenes, videos o carpetas con recursos disponibles.",
      404,
    );
    return direct; // exportCollection authorizes every ID before reading any bytes.
  }
  const sharing = await personalFolderContext(actor);
  const tree = await libraryTree(actor, true, sharing.folders);
  const keys = new Set<string>();
  for (const token of tokens.filter((t) => t.startsWith("n:"))) {
    const key = token.slice(2);
    demand(
      tree.some((n) => n.id === key) && key !== "loose:root",
      "Una carpeta ya no está disponible.",
      404,
    );
    for (const child of subtree(tree, key)) keys.add(child);
  }
  demand(
    keys.size <= 500,
    "Selecciona como máximo 500 carpetas incluyendo subcarpetas.",
    413,
  );
  const sharedKeys = [
    ...sharing.nativeKeys,
    ...sharing.folders.map((f) => "folder:" + f.id),
  ];
  const delegated = await delegatedImageIds(actor, sharing.folders);
  const visible = await authorizedImages(actor, false, false, delegated);
  const copyVisible = await authorizedImages(actor, true, false, delegated);
  const copyIds = tokens
    .filter((t) => t.startsWith("c:"))
    .map((t) => t.slice(2));
  const [native, directCopies, nestedCopies] = await Promise.all([
    keys.size
      ? db.variation.findMany({
          where: { AND: [visible, locationFilter(actor, keys)] },
          select: { id: true },
          take: 201,
        })
      : [],
    copyIds.length
      ? db.libraryImageCopy.findMany({
          where: {
            id: { in: copyIds },
            deletedAt: null,
            OR: [{ userId: actor.id }, { destinationKey: { in: sharedKeys } }],
            variation: copyVisible,
          },
          select: { variationId: true },
          take: 201,
        })
      : [],
    keys.size
      ? db.libraryImageCopy.findMany({
          where: {
            destinationKey: { in: [...keys] },
            deletedAt: null,
            OR: [{ userId: actor.id }, { destinationKey: { in: sharedKeys } }],
            variation: copyVisible,
          },
          select: { variationId: true },
          take: 201,
        })
      : [],
  ]);
  demand(
    directCopies.length === copyIds.length,
    "Una copia ya no está disponible.",
    404,
  );
  const ids = [
    ...new Set([
      ...tokens.filter((t) => t.startsWith("v:")).map((t) => t.slice(2)),
      ...native.map((v) => v.id),
      ...directCopies.map((v) => v.variationId),
      ...nestedCopies.map((v) => v.variationId),
    ]),
  ];
  demand(
    ids.length,
    "Selecciona imágenes, videos o carpetas con recursos disponibles.",
    404,
  );
  demand(
    native.length <= 200 && nestedCopies.length <= 200 && ids.length <= 200,
    "La descarga admite hasta 200 recursos por lote. Selecciona menos carpetas o recursos.",
    413,
  );
  return ids;
}
export async function exportLibrarySelection(actor: Actor, input: unknown) {
  const b = libraryDownloadSchema.parse(input);
  return exportCollection(actor, {
    ids: await libraryDownloadIds(actor, b.selection),
    format: b.format,
  });
}
