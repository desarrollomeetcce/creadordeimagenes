import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { libraryImageVisibility } from "./library-visibility";
import { hierarchyScope } from "./hierarchy-filters";
import { recordActivity } from "./activity";

type Actor = { id: string; role: string };
export type LibraryNode = {
  id: string;
  name: string;
  parentId: string | null;
  kind: string;
  sourceDeleted?: boolean;
  sourceParentId?: string | null;
};
export function subtree(tree: LibraryNode[], key: string) {
  const found = new Set([key]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of tree)
      if (n.parentId && found.has(n.parentId) && !found.has(n.id)) {
        found.add(n.id);
        changed = true;
      }
  }
  return found;
}
export function organizeTree(
  nodes: LibraryNode[],
  states: { nodeKey: string; parentKey: string | null; hidden: boolean }[],
) {
  const map = new Map(states.map((s) => [s.nodeKey, s]));
  const placed = nodes.map((n) => {
    const s = map.get(n.id);
    return {
      ...n,
      sourceParentId: n.parentId,
      ...(s ? { parentId: s.parentKey } : {}),
    };
  });
  const hidden = new Set<string>();
  for (const s of states)
    if (s.hidden) for (const id of subtree(placed, s.nodeKey)) hidden.add(id);
  const visible = placed.filter((n) => !hidden.has(n.id)),
    ids = new Set(visible.map((n) => n.id));
  return visible.map((n) => ({
    ...n,
    parentId: n.parentId && ids.has(n.parentId) ? n.parentId : null,
  }));
}
/** Current physical location, independent of the immutable project hierarchy. */
export function locationFilter(
  user: Actor,
  keys: Set<string>,
): Prisma.VariationWhereInput {
  const personal = [...keys]
    .filter((k) => k.startsWith("folder:"))
    .map((k) => k.slice(7));
  const subIds = [...keys]
    .filter((k) => k.startsWith("subproduct:"))
    .map((k) => k.slice(11));
  const projectIds = [...keys]
    .filter((k) => k.startsWith("project:"))
    .map((k) => k.slice(8));
  const native: Prisma.GenerationJobWhereInput = {
    OR: [
      { subproductId: { in: subIds } },
      { subproductId: null, projectId: { in: projectIds } },
      ...(keys.has("tests:connection-test")
        ? [{ projectId: "connection-test" }]
        : []),
    ],
  };
  const explicit: Prisma.LibraryItemWhereInput = {
    userId: user.id,
    OR: [
      { destinationKey: { in: [...keys] } },
      { destinationKey: null, folderId: { in: personal } },
      ...(keys.has("loose:root")
        ? [{ destinationKey: null, folderId: null }]
        : []),
    ],
  };
  return {
    OR: [
      {
        job: native,
        libraryItems: {
          none: {
            userId: user.id,
            OR: [
              { destinationKey: { not: null } },
              { folderId: { not: null } },
            ],
          },
        },
      },
      { libraryItems: { some: explicit } },
    ],
  };
}
export async function authorizedImages(
  user: Actor,
  copies = false,
  history = false,
): Promise<Prisma.VariationWhereInput> {
  const scope = await hierarchyScope(user, new URLSearchParams(), true);
  const visibility = libraryImageVisibility(user);
  if (copies || history) delete visibility.libraryExclusions;
  if (history) {
    delete visibility.deletedAt;
    delete visibility.expired;
    visibility.AND = (visibility.AND as Prisma.VariationWhereInput[]).slice(1);
  }
  return {
    AND: [
      visibility,
      {
        job:
          user.role === "OWNER"
            ? {
                OR: [
                  scope.access ?? { id: "" },
                  { projectId: "connection-test" },
                ],
              }
            : (scope.access ?? { id: "" }),
      },
    ],
  };
}
export function documentLocation(
  keys: Set<string>,
): Prisma.LibraryDocumentWhereInput {
  return {
    OR: [
      { destinationKey: { in: [...keys] } },
      {
        destinationKey: null,
        folderId: {
          in: [...keys]
            .filter((k) => k.startsWith("folder:"))
            .map((k) => k.slice(7)),
        },
      },
      ...(keys.has("loose:root")
        ? [{ destinationKey: null, folderId: null }]
        : []),
    ],
  };
}
const input = z
  .object({
    operation: z.enum([
      "create",
      "move",
      "copy",
      "delete",
      "rename",
      "restore",
    ]),
    selection: z.array(z.string().min(3).max(160)).max(200),
    destination: z.string().max(150).optional(),
    name: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export async function organizeSelection(
  user: Actor,
  body: unknown,
  loadTree: () => Promise<LibraryNode[]>,
) {
  demand(
    user.role !== "OBSERVER",
    "Observador solo puede ver y descargar.",
    403,
  );
  const b = input.parse(body),
    selection = [...new Set(b.selection)];
  demand(
    selection.length || ["restore", "create"].includes(b.operation),
    "Selecciona carpetas o imágenes.",
  );
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(428281)`;
      const account = await tx.user.findUnique({
        where: { id: user.id },
        select: { role: true, status: true },
      });
      demand(
        account?.status === "APPROVED" &&
          account.role === user.role &&
          account.role !== "OBSERVER",
        "La cuenta o sus permisos cambiaron. Vuelve a ingresar.",
        403,
      );
      const tree = await loadTree(),
        byId = new Map(tree.map((n) => [n.id, n]));
      const nodes = selection
        .filter((k) => k.startsWith("n:"))
        .map((k) => k.slice(2));
      const images = selection
        .filter((k) => k.startsWith("v:"))
        .map((k) => k.slice(2));
      const copies = selection
        .filter((k) => k.startsWith("c:"))
        .map((k) => k.slice(2));
      const docs = selection
        .filter((k) => k.startsWith("d:"))
        .map((k) => k.slice(2));
      demand(
        nodes.length + images.length + copies.length + docs.length ===
          selection.length,
        "Selección no válida.",
      );
      demand(
        nodes.every((k) => byId.has(k) && k !== "loose:root"),
        "Una carpeta no está disponible.",
        404,
      );
      const dest = b.destination || "loose:root";
      if (["create", "move", "copy"].includes(b.operation)) {
        demand(
          dest === "loose:root" || byId.has(dest),
          "Destino no disponible.",
          404,
        );
        for (const key of nodes)
          demand(
            !subtree(tree, key).has(dest),
            "No puedes colocar una carpeta dentro de sí misma o de sus descendientes.",
          );
      }
      if (b.operation === "create") {
        demand(b.name, "Escribe el nombre de la carpeta.");
        return tx.libraryFolder.create({
          data: {
            userId: user.id,
            name: b.name,
            parentId: dest.startsWith("folder:") ? dest.slice(7) : null,
            anchorScope:
              dest !== "loose:root" && !dest.startsWith("folder:")
                ? dest.split(":")[0]
                : null,
            anchorId:
              dest !== "loose:root" && !dest.startsWith("folder:")
                ? dest.split(":")[1]
                : null,
          },
        });
      }
      const visible = await authorizedImages(user),
        aliasVisible = await authorizedImages(user, true);
      const selectedImages = await tx.variation.findMany({
        where: { id: { in: images }, AND: [visible] },
        select: { id: true },
      });
      demand(
        selectedImages.length === images.length,
        "Una imagen ya no está disponible.",
        404,
      );
      const selectedCopies = await tx.libraryImageCopy.findMany({
        where: {
          id: { in: copies },
          userId: user.id,
          deletedAt: null,
          variation: aliasVisible,
        },
      });
      demand(
        selectedCopies.length === copies.length,
        "Una copia ya no está disponible.",
        404,
      );
      const selectedDocs = await tx.libraryDocument.findMany({
        where: { id: { in: docs }, userId: user.id, deletedAt: null },
      });
      demand(
        selectedDocs.length === docs.length,
        "Un archivo ya no está disponible.",
        404,
      );
      // Selected parents carry selected descendants; never flatten a selected subtree.
      const roots = nodes.filter(
        (k) =>
          !nodes.some((other) => other !== k && subtree(tree, other).has(k)),
      );
      const carried = new Set(roots.flatMap((k) => [...subtree(tree, k)]));
      demand(
        carried.size <= 500,
        "Selecciona como máximo 500 carpetas incluyendo sus subcarpetas.",
      );
      const insideImages = new Set(
        carried.size
          ? (
              await tx.variation.findMany({
                where: {
                  id: { in: images },
                  AND: [locationFilter(user, carried)],
                },
                select: { id: true },
              })
            ).map((row) => row.id)
          : [],
      );
      const directImages = images.filter((id) => !insideImages.has(id));
      const directCopies = selectedCopies.filter(
        (c) => !carried.has(c.destinationKey),
      );
      const directDocs = selectedDocs.filter(
        (d) =>
          !carried.has(
            d.destinationKey ||
              (d.folderId ? "folder:" + d.folderId : "loose:root"),
          ),
      );
      const allImageIds = new Set(images);
      const lockImage = async (id: string) => {
        await tx.$queryRaw`SELECT id FROM "Variation" WHERE id=${id} FOR UPDATE`;
        const v = await tx.variation.findUnique({
          where: { id },
          select: {
            deletedAt: true,
            expired: true,
            permanent: true,
            expiresAt: true,
          },
        });
        demand(
          v &&
            !v.deletedAt &&
            !v.expired &&
            (v.permanent || v.expiresAt > new Date()),
          "Una imagen ya no está disponible.",
          410,
        );
      };
      const moveImage = async (id: string, key: string) => {
        await lockImage(id);
        await tx.libraryItem.upsert({
          where: { userId_variationId: { userId: user.id, variationId: id } },
          create: {
            userId: user.id,
            variationId: id,
            destinationKey: key,
            folderId: key.startsWith("folder:") ? key.slice(7) : null,
            broughtAt: new Date(),
          },
          update: {
            destinationKey: key,
            folderId: key.startsWith("folder:") ? key.slice(7) : null,
            broughtAt: new Date(),
          },
        });
      };
      if (b.operation === "restore")
        await tx.libraryNodeState.deleteMany({
          where: { userId: user.id, hidden: true },
        });
      else if (b.operation === "rename") {
        demand(
          roots.length === 1 && selection.length === 1 && b.name,
          "Selecciona una carpeta personal e introduce un nombre.",
        );
        demand(
          roots[0].startsWith("folder:"),
          "Los nombres de proyectos se cambian desde Proyectos.",
        );
        await tx.libraryFolder.update({
          where: { id: roots[0].slice(7), userId: user.id },
          data: { name: b.name },
        });
      } else if (b.operation === "move") {
        for (const key of roots) {
          if (key.startsWith("folder:"))
            await tx.libraryFolder.update({
              where: { id: key.slice(7), userId: user.id },
              data: {
                parentId: dest.startsWith("folder:") ? dest.slice(7) : null,
                anchorScope:
                  dest !== "loose:root" && !dest.startsWith("folder:")
                    ? dest.split(":")[0]
                    : null,
                anchorId:
                  dest !== "loose:root" && !dest.startsWith("folder:")
                    ? dest.split(":")[1]
                    : null,
              },
            });
          else
            await tx.libraryNodeState.upsert({
              where: { userId_nodeKey: { userId: user.id, nodeKey: key } },
              create: {
                userId: user.id,
                nodeKey: key,
                parentKey: dest === "loose:root" ? null : dest,
              },
              update: { parentKey: dest === "loose:root" ? null : dest },
            });
        }
        for (const id of directImages) await moveImage(id, dest);
        await tx.libraryImageCopy.updateMany({
          where: { id: { in: directCopies.map((c) => c.id) }, userId: user.id },
          data: { destinationKey: dest },
        });
        await tx.libraryDocument.updateMany({
          where: { id: { in: directDocs.map((d) => d.id) }, userId: user.id },
          data: {
            destinationKey: dest,
            folderId: dest.startsWith("folder:") ? dest.slice(7) : null,
          },
        });
      } else if (b.operation === "copy") {
        const copyImage = async (id: string, key: string) => {
          await lockImage(id);
          allImageIds.add(id);
          return tx.libraryImageCopy.create({
            data: { userId: user.id, variationId: id, destinationKey: key },
          });
        };
        const copyDocs = async (rows: typeof selectedDocs, key: string) => {
          for (const d of rows)
            await tx.libraryDocument.create({
              data: {
                userId: user.id,
                name: d.name,
                purpose:d.purpose,description:d.description,text:d.text,previewPath:d.previewPath,generationReady:d.generationReady,
                path: d.path,
                mime: d.mime,
                size: d.size,
                destinationKey: key,
                folderId: key.startsWith("folder:") ? key.slice(7) : null,
              },
            });
        };
        let count = 0;
        const copyNode = async (key: string, parent: string): Promise<void> => {
          const n = byId.get(key)!;
          const folder = await tx.libraryFolder.create({
            data: {
              userId: user.id,
              name: n.name + (parent === dest ? " · copia" : ""),
              parentId: parent.startsWith("folder:") ? parent.slice(7) : null,
              anchorScope:
                parent !== "loose:root" && !parent.startsWith("folder:")
                  ? parent.split(":")[0]
                  : null,
              anchorId:
                parent !== "loose:root" && !parent.startsWith("folder:")
                  ? parent.split(":")[1]
                  : null,
            },
          });
          const to = "folder:" + folder.id,
            keys = new Set([key]);
          const native = await tx.variation.findMany({
            where: { AND: [visible, locationFilter(user, keys)] },
            select: { id: true },
            take: 2001,
          });
          const aliases = await tx.libraryImageCopy.findMany({
            where: {
              userId: user.id,
              deletedAt: null,
              destinationKey: key,
              variation: aliasVisible,
            },
            select: { variationId: true },
            take: 2001,
          });
          const documents = await tx.libraryDocument.findMany({
            where: {
              userId: user.id,
              deletedAt: null,
              ...documentLocation(keys),
            },
            take: 2001,
          });
          count += native.length + aliases.length + documents.length;
          demand(
            count <= 2000,
            "La copia supera el máximo de 2000 archivos; selecciona menos carpetas.",
          );
          for (const row of native) await copyImage(row.id, to);
          for (const row of aliases) await copyImage(row.variationId, to);
          await copyDocs(documents, to);
          for (const child of tree.filter((n) => n.parentId === key))
            await copyNode(child.id, to);
        };
        for (const key of roots) await copyNode(key, dest);
        for (const id of directImages) await copyImage(id, dest);
        for (const c of directCopies) await copyImage(c.variationId, dest);
        await copyDocs(directDocs, dest);
      } else if (b.operation === "delete") {
        // Delete organization only. Every visible image/document in deleted folders goes to loose files.
        if (carried.size) {
          const content = await tx.variation.findMany({
            where: { AND: [visible, locationFilter(user, carried)] },
            select: { id: true },
            take: 5001,
          });
          demand(
            content.length <= 5000,
            "Retira menos carpetas a la vez (máximo 5000 imágenes).",
          );
          for (const row of content) {
            allImageIds.add(row.id);
            await moveImage(row.id, "loose:root");
          }
          await tx.libraryImageCopy.updateMany({
            where: { userId: user.id, destinationKey: { in: [...carried] } },
            data: { destinationKey: "loose:root" },
          });
          await tx.libraryDocument.updateMany({
            where: { userId: user.id, ...documentLocation(carried) },
            data: { destinationKey: "loose:root", folderId: null },
          });
          for (const key of carried)
            if (!key.startsWith("folder:"))
              await tx.libraryNodeState.upsert({
                where: { userId_nodeKey: { userId: user.id, nodeKey: key } },
                create: {
                  userId: user.id,
                  nodeKey: key,
                  parentKey: byId.get(key)?.parentId,
                  hidden: true,
                },
                update: { hidden: true },
              });
          const folders = [...carried]
            .filter((k) => k.startsWith("folder:"))
            .map((k) => k.slice(7));
          await tx.libraryItem.updateMany({
            where: { userId: user.id, folderId: { in: folders } },
            data: { folderId: null, destinationKey: "loose:root" },
          });
          await tx.libraryFolder.updateMany({
            where: { id: { in: folders }, userId: user.id },
            data: { parentId: null },
          });
          await tx.libraryFolder.deleteMany({
            where: { id: { in: folders }, userId: user.id },
          });
        }
        for (const id of images) {
          const placed = await tx.libraryItem.findUnique({
            where: { userId_variationId: { userId: user.id, variationId: id } },
          });
          const v = await tx.variation.findUniqueOrThrow({
            where: { id },
            select: {
              subproductId: true,
              job: { select: { projectId: true } },
            },
          });
          const location =
            placed?.destinationKey ||
            (placed?.folderId
              ? "folder:" + placed.folderId
              : v.subproductId
                ? "subproduct:" + v.subproductId
                : v.job.projectId === "connection-test"
                  ? "tests:connection-test"
                  : "project:" + v.job.projectId);
          const data = {
            destinationKey: location,
            broughtAt: placed?.broughtAt ?? null,
          };
          await tx.libraryExclusion.upsert({
            where: { userId_variationId: { userId: user.id, variationId: id } },
            create: { userId: user.id, variationId: id, ...data },
            update: data,
          });
          await tx.libraryItem.deleteMany({
            where: { userId: user.id, variationId: id },
          });
        }
        await tx.libraryImageCopy.updateMany({
          where: { id: { in: copies }, userId: user.id },
          data: { deletedAt: new Date() },
        });
        await tx.libraryDocument.updateMany({
          where: { id: { in: docs }, userId: user.id },
          data: { deletedAt: new Date() },
        });
        for (const path of new Set(selectedDocs.map((d) => d.path))) {
          if (
            !(await tx.libraryDocument.count({
              where: { path, deletedAt: null },
            }))
          )
            await tx.assetDeletion.createMany({
              data: [{ path, nextAttemptAt: new Date() }],
              skipDuplicates: true,
            });
        }
      }
      for (const id of new Set([
        ...allImageIds,
        ...selectedCopies.map((c) => c.variationId),
      ])) {
        const saved = await tx.libraryItem.count({
            where: { variationId: id },
          }),
          copied = await tx.libraryImageCopy.count({
            where: { variationId: id, deletedAt: null },
          });
        await tx.variation.update({
          where: { id },
          data: { permanent: saved + copied > 0 },
        });
      }
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action: "BIBLIOTECA_" + b.operation.toUpperCase(),
          detail: { count: selection.length, destination: dest },
        },
      });
      return { ok: true };
    },
    { timeout: 60000 },
  );
}

/** Merge two database orders without fetching every earlier page. */
export async function mergedPage<T extends { id: string; createdAt: Date }>(
  aCount: number,
  bCount: number,
  offset: number,
  limit: number,
  ascending: boolean,
  readA: (skip: number, take: number) => Promise<T[]>,
  readB: (skip: number, take: number) => Promise<T[]>,
) {
  const compare = (a: T, b: T) =>
    (a.createdAt.getTime() - b.createdAt.getTime()) * (ascending ? 1 : -1) ||
    a.id.localeCompare(b.id);
  const k = Math.min(offset, aCount + bCount);
  let lo = Math.max(0, k - bCount),
    hi = Math.min(k, aCount),
    a = lo,
    b = k - lo;
  while (lo <= hi) {
    a = Math.floor((lo + hi) / 2);
    b = k - a;
    const [aa, bb] = await Promise.all([
      readA(Math.max(0, a - 1), a > 0 ? 2 : 1),
      readB(Math.max(0, b - 1), b > 0 ? 2 : 1),
    ]);
    const leftA = a > 0 ? aa[0] : undefined,
      rightA = aa[a > 0 ? 1 : 0],
      leftB = b > 0 ? bb[0] : undefined,
      rightB = bb[b > 0 ? 1 : 0];
    if (leftA && rightB && compare(leftA, rightB) > 0) hi = a - 1;
    else if (leftB && rightA && compare(leftB, rightA) > 0) lo = a + 1;
    else break;
  }
  const [aa, bb] = await Promise.all([readA(a, limit), readB(b, limit)]);
  return [...aa, ...bb].sort(compare).slice(0, limit);
}
