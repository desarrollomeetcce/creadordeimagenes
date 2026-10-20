import { maxResourceFileBytes, uploadChunkBytes } from "./large-upload-limits";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import {
  resourceAccess,
  rateLimit,
  fullProjectFilter,
  categoryFullFilter,
  subproductFilter,
} from "./auth";
import { store, remove, storageStatus } from "./storage";
import { validateUpload } from "./uploads";
import { recordActivity } from "./activity";
type Actor = { id: string; role: string };
export const storagePurpose = z.enum([
  "Fotografía principal",
  "Referencia visual",
  "Fondo",
  "Logo",
  "Material de contexto",
  "Logo institucional",
  "Fotografía obligatoria",
  "Información comercial",
  "Manual de marca",
]);
const scopes = z.enum(["project", "category", "subproduct"]);
export type ResourceScope = { scope: string; resourceId: string };
export type StoredReference = {
  documentId: string;
  bindingId: string;
  scope: string;
  resourceId: string;
};
const send = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
export function folderDescendants(
  folders: { id: string; parentId: string | null }[],
  id: string,
) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders)
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        changed = true;
      }
  }
  return [...ids];
}
export function storageRelevance(
  name: string,
  description: string,
  subject: string,
) {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const tokens = norm(subject).match(/[a-z0-9]{4,}/g) ?? [];
  const source = norm(name + " " + description);
  return [...new Set(tokens)].reduce(
    (n, t) => n + (source.includes(t) ? 1 : 0),
    0,
  );
}
/** Server-only selection; a binding delegates its contents to this generation resource, never the whole personal library. */
export async function boundStorageReferences(
  resources: ResourceScope[],
  subject: string,
  max = 8,
) {
  const bindings = await db.storageBinding.findMany({
    where: { OR: resources },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { folder: { select: { userId: true } } },
  });
  const candidates = [];
  for (const binding of bindings) {
    const owner = await db.user.findUnique({
      where: { id: binding.userId },
      select: { status: true },
    });
    if (
      owner?.status !== "APPROVED" ||
      binding.folder.userId !== binding.userId
    )
      continue;
    const folders = await db.libraryFolder.findMany({
      where: { userId: binding.userId },
      select: { id: true, parentId: true },
    });
    const ids = folderDescendants(folders, binding.folderId);
    // Bounded candidates per folder; exact topic matches are scored before selecting image inputs.
    const terms = [
      ...new Set(
        [
          subject,
          subject.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        ].flatMap((value) => value.split(/\s+/).filter((t) => t.length >= 4)),
      ),
    ].slice(0, 16);
    const where: Prisma.LibraryDocumentWhereInput = {
      userId: binding.userId,
      deletedAt: null,
      generationReady: true,
      OR: [
        { folderId: { in: ids } },
        { destinationKey: { in: ids.map((id) => "folder:" + id) } },
      ],
    };
    const [matched, recent] = await Promise.all([
      terms.length
        ? db.libraryDocument.findMany({
            where: {
              AND: [
                where,
                {
                  OR: terms.flatMap((t) => [
                    { name: { contains: t, mode: "insensitive" as const } },
                    {
                      description: {
                        contains: t,
                        mode: "insensitive" as const,
                      },
                    },
                  ]),
                },
              ],
            },
            take: 80,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          })
        : [],
      db.libraryDocument.findMany({
        where,
        take: 80,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
    ]);
    for (const doc of new Map(
      [...matched, ...recent].map((d) => [d.id, d]),
    ).values())
      candidates.push({
        ...doc,
        bindingId: binding.id,
        scope: binding.scope,
        resourceId: binding.resourceId,
      });
  }
  const sorted = [...new Map(candidates.map((d) => [d.id, d])).values()].sort(
    (a, b) =>
      storageRelevance(b.name, b.description, subject) -
        storageRelevance(a.name, a.description, subject) ||
      a.id.localeCompare(b.id),
  );
  const images = sorted.filter(
    (d) =>
      d.mime.startsWith("image/") &&
      (!d.path.startsWith("large:") || !!d.previewPath),
  );
  const logos = images.filter((d) => d.purpose === "Logo").slice(0, 4),
    visuals = images
      .filter((d) => d.purpose !== "Logo")
      .slice(0, Math.max(0, max - logos.length));
  return [
    ...logos,
    ...visuals,
    ...sorted.filter((d) => !d.mime.startsWith("image/")).slice(0, 3),
  ];
}
export async function resolveStoredReferences(
  refs: StoredReference[],
  allowed: ResourceScope[],
) {
  demand(
    refs.length <= 9,
    "La selección de recursos supera el máximo de composición.",
  );
  const out = [];
  for (const r of refs) {
    demand(
      allowed.some((a) => a.scope === r.scope && a.resourceId === r.resourceId),
      "Referencia de otro recurso no autorizada.",
      403,
    );
    const b = await db.storageBinding.findFirst({
      where: { id: r.bindingId, scope: r.scope, resourceId: r.resourceId },
      include: { folder: { select: { userId: true } } },
    });
    demand(
      b && b.userId === b.folder.userId,
      "La carpeta vinculada fue retirada. Revisa los recursos antes de generar.",
      409,
    );
    const account = await db.user.findUnique({
      where: { id: b.userId },
      select: { status: true },
    });
    demand(
      account?.status === "APPROVED",
      "El propietario de los recursos ya no está activo.",
      409,
    );
    const folders = await db.libraryFolder.findMany({
        where: { userId: b.userId },
        select: { id: true, parentId: true },
      }),
      ids = folderDescendants(folders, b.folderId);
    const d = await db.libraryDocument.findFirst({
      where: {
        id: r.documentId,
        userId: b.userId,
        deletedAt: null,
        OR: [
          { folderId: { in: ids } },
          { destinationKey: { in: ids.map((id) => "folder:" + id) } },
        ],
      },
    });
    demand(
      d && d.mime.startsWith("image/"),
      "Un recurso fue retirado o movido fuera de la carpeta vinculada. Revisa y autoriza de nuevo.",
      409,
    );
    demand(
      !d.path.startsWith("large:") || d.previewPath,
      "Este original necesita una copia optimizada para generación.",
      409,
    );
    out.push({
      ...d,
      path: d.previewPath ?? d.path,
      mime: d.previewPath ? "image/webp" : d.mime,
      source: "storage" as const,
    });
  }
  return out;
}
export async function storageRoutes(
  req: NextRequest,
  parts: string[],
  actor: Actor,
  body: () => Promise<unknown>,
) {
  const method = req.method;
  if (parts[0] === "storage" && parts[1] === "uploads")
    return (await import("./large-uploads")).largeUploadRoutes(
      req,
      parts,
      actor,
      body,
    );
  if (parts[0] === "storage") {
    if (parts[1] === "tree" && method === "GET") {
      const [folders, bytes, status, uploads] = await Promise.all([
        db.libraryFolder.findMany({
          where: { userId: actor.id },
          select: { id: true, name: true, parentId: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        db.libraryDocument.aggregate({
          where: { userId: actor.id, deletedAt: null },
          _sum: { size: true },
        }),
        storageStatus(),
        db.largeAsset.findMany({
          where: { userId: actor.id, status: "UPLOADING" },
          select: {
            id: true,
            name: true,
            size: true,
            receivedBytes: true,
            expiresAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
      ]);
      return send({
        folders,
        userId: actor.id,
        uploads,
        bytes: bytes._sum.size ?? 0,
        usedBytes: status.usedBytes,
        limitBytes: status.limitBytes,
        maxFileBytes: maxResourceFileBytes,
        chunkBytes: uploadChunkBytes,
      });
    }
    if (parts[1] === "files" && method === "GET") {
      const folderId = req.nextUrl.searchParams.get("folder") || null;
      demand(
        !folderId ||
          (await db.libraryFolder.findFirst({
            where: { id: folderId, userId: actor.id },
            select: { id: true },
          })),
        "Carpeta no disponible.",
        404,
      );
      const page = z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .parse(req.nextUrl.searchParams.get("page") ?? 1),
        where = { userId: actor.id, deletedAt: null, folderId };
      const [files, total] = await Promise.all([
        db.libraryDocument.findMany({
          where,
          select: {
            id: true,
            name: true,
            mime: true,
            size: true,
            purpose: true,
            description: true,
            createdAt: true,
            previewPath: true,
            path: true,
            generationReady: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * 50,
          take: 50,
        }),
        db.libraryDocument.count({ where }),
      ]);
      return send({
        files: files.map(({ previewPath, path, ...file }) => ({
          ...file,
          hasPreview: !!previewPath,
          large: path.startsWith("large:"),
        })),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / 50)),
      });
    }
    if (parts[1] === "files" && parts[2] && method === "PATCH") {
      demand(
        actor.role !== "OBSERVER",
        "Observador solo puede ver y descargar.",
        403,
      );
      const values = z
        .object({
          name: z.string().trim().min(1).max(200),
          purpose: storagePurpose,
          description: z.string().max(1000),
        })
        .strict()
        .parse(await body());
      const changed = await db.libraryDocument.updateMany({
        where: { id: parts[2], userId: actor.id, deletedAt: null },
        data: values,
      });
      demand(changed.count, "Archivo no disponible.", 404);
      return send({ ok: true });
    }
    if (parts[1] === "files" && method === "POST") {
      demand(
        actor.role !== "OBSERVER",
        "Observador solo puede ver y descargar.",
        403,
      );
      await rateLimit("storage-upload:" + actor.id, 2000);
      demand(
        Number(req.headers.get("content-length") ?? 0) <= 3100000,
        "El archivo supera 3 MB.",
        413,
      );
      const reader = req.body?.getReader();
      demand(reader, "Selecciona un archivo.");
      const chunks = [];
      let bytes = 0;
      while (true) {
        const value = await reader.read();
        if (value.done) break;
        bytes += value.value.length;
        if (bytes > 3100000) {
          await reader.cancel();
          demand(false, "El archivo supera 3 MB.", 413);
        }
        chunks.push(value.value);
      }
      const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
          headers: { "Content-Type": req.headers.get("content-type") ?? "" },
        }).formData(),
        file = form.get("file"),
        folderId = String(form.get("folderId") ?? "") || null;
      demand(
        file instanceof File && file.size > 0 && file.size <= 3000000,
        "Selecciona un archivo de hasta 3 MB.",
        413,
      );
      demand(
        !folderId ||
          (await db.libraryFolder.findFirst({
            where: { id: folderId, userId: actor.id },
            select: { id: true },
          })),
        "Carpeta no disponible.",
        404,
      );
      const checked = await validateUpload(file),
        purpose = storagePurpose.parse(
          form.get("purpose") ??
            (checked.mime.startsWith("image/")
              ? "Referencia visual"
              : "Material de contexto"),
        ),
        path = await store(checked.bytes);
      try {
        return send(
          await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(428281)`;
            const account = await tx.user.findUnique({
              where: { id: actor.id },
              select: { role: true, status: true },
            });
            demand(
              account?.status === "APPROVED" &&
                account.role === actor.role &&
                actor.role !== "OBSERVER",
              "Los permisos de la cuenta cambiaron.",
              403,
            );
            demand(
              !folderId ||
                (await tx.libraryFolder.findFirst({
                  where: { id: folderId, userId: actor.id },
                  select: { id: true },
                })),
              "La carpeta ya no está disponible.",
              404,
            );
            return tx.libraryDocument.create({
              data: {
                userId: actor.id,
                folderId,
                destinationKey: folderId ? "folder:" + folderId : "loose:root",
                name: file.name.slice(0, 200),
                mime: checked.mime,
                size: checked.bytes.length,
                path,
                purpose,
                text: checked.text,
                description: "",
              },
            });
          }),
          201,
        );
      } catch (error) {
        await remove(path);
        throw error;
      }
    }
  }
  if (parts[0] === "storage-bindings") {
    const scope = scopes.parse(parts[1]),
      resourceId = z.string().min(1).max(100).parse(parts[2]);
    await resourceAccess(
      actor,
      scope,
      resourceId,
      method === "GET" ? "VIEW" : "EDIT",
    );
    if (method === "GET")
      return send(
        await db.storageBinding.findMany({
          where: { scope, resourceId },
          select: {
            id: true,
            folderId: true,
            userId: true,
            folder: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
      );
    if (method === "PUT") {
      const b = z
          .object({ folderIds: z.array(z.string().min(1).max(100)).max(30) })
          .strict()
          .parse(await body()),
        folderIds = [...new Set(b.folderIds)];
      return send(
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(428281)`;
          const account = await tx.user.findUnique({
            where: { id: actor.id },
            select: { status: true, role: true },
          });
          demand(
            account?.status === "APPROVED" &&
              account.role === actor.role &&
              actor.role !== "OBSERVER",
            "Los permisos de la cuenta cambiaron.",
            403,
          );
          const activeResource =
            scope === "project"
              ? await tx.project.findFirst({
                  where: {
                    id: resourceId,
                    deletedAt: null,
                    ...fullProjectFilter(actor),
                  },
                  select: { id: true },
                })
              : scope === "category"
                ? await tx.category.findFirst({
                    where: {
                      id: resourceId,
                      deletedAt: null,
                      project: { deletedAt: null },
                      ...categoryFullFilter(actor),
                    },
                    select: { id: true },
                  })
                : await tx.subproduct.findFirst({
                    where: { id: resourceId, ...subproductFilter(actor) },
                    select: { id: true },
                  });
          demand(
            activeResource,
            "El recurso ya no está disponible para esta cuenta.",
            404,
          );
          const folders = await tx.libraryFolder.findMany({
            where: { id: { in: folderIds }, userId: actor.id },
            select: { id: true },
          });
          demand(
            folders.length === folderIds.length,
            "Selecciona carpetas propias disponibles.",
            404,
          );
          // Editing one's selection preserves folders explicitly shared by other collaborators.
          await tx.storageBinding.deleteMany({
            where: {
              scope,
              resourceId,
              userId: actor.id,
              folderId: { notIn: folderIds },
            },
          });
          await tx.storageBinding.createMany({
            data: folderIds.map((folderId) => ({
              scope,
              resourceId,
              userId: actor.id,
              folderId,
            })),
            skipDuplicates: true,
          });
          await recordActivity(tx, {
            data: {
              actorId: actor.id,
              action: "CARPETAS_RECURSOS_VINCULADAS",
              resourceId,
              detail: { scope, count: folderIds.length },
            },
          });
          return { ok: true };
        }),
      );
    }
  }
  return null;
}
