import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { fullProjectFilter, categoryFullFilter } from "./auth";
import { librarySubproductFilter } from "./library-access";
import { libraryImageVisibility } from "./library-visibility";
import { hasAiModuleAccess } from "./roles";
import { demand } from "./errors";
export type FolderActor = { id: string; role: string };
export type PersonalFolder = {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  anchorScope: string | null;
  anchorId: string | null;
  allUsers: boolean;
};
export async function personalFolderContext(actor: FolderActor) {
  const [projects, categories, subs] = await Promise.all([
    db.project.findMany({
      where: fullProjectFilter(actor),
      select: { id: true },
    }),
    db.category.findMany({
      where: categoryFullFilter(actor),
      select: { id: true },
    }),
    db.subproduct.findMany({
      where: librarySubproductFilter(actor),
      select: { id: true },
    }),
  ]);
  const folders = await db.$queryRaw<
    PersonalFolder[]
  >`WITH RECURSIVE visible AS (
 SELECT f.id FROM "LibraryFolder" f WHERE ${actor.role === "OWNER"} OR f."userId"=${actor.id} OR f."allUsers" OR EXISTS(SELECT 1 FROM "LibraryFolderMember" m WHERE m."folderId"=f.id AND m."userId"=${actor.id}) OR (f."anchorScope"='project' AND f."anchorId"=ANY(${projects.map((p) => p.id)}::text[])) OR (f."anchorScope"='product' AND f."anchorId"=ANY(${categories.map((p) => p.id)}::text[])) OR (f."anchorScope"='subproduct' AND f."anchorId"=ANY(${subs.map((p) => p.id)}::text[]))
 UNION SELECT f.id FROM "LibraryFolder" f JOIN visible v ON f."parentId"=v.id)
 SELECT f.id,f."userId",f.name,f."parentId",f."anchorScope",f."anchorId",f."allUsers" FROM "LibraryFolder" f JOIN visible v ON f.id=v.id`;
  return {
    folders,
    nativeKeys: [
      ...projects.map((p) => "project:" + p.id),
      ...categories.map((p) => "product:" + p.id),
      ...subs.map((p) => "subproduct:" + p.id),
    ],
  };
}
export async function personalFolders(
  actor: FolderActor,
): Promise<PersonalFolder[]> {
  return (await personalFolderContext(actor)).folders;
}
export async function personalFolderAccess(
  actor: FolderActor,
  id: string,
  manage = false,
) {
  const rows = await personalFolders(actor),
    folder = rows.find((f) => f.id === id);
  demand(folder, "No tienes acceso a esta carpeta.", 404);
  if (manage)
    demand(
      actor.role === "OWNER" ||
        (actor.role !== "OBSERVER" && folder.userId === actor.id),
      "Solo el creador o el OWNER pueden administrar esta carpeta.",
      403,
    );
  return folder;
}
export async function delegatedImageIds(
  actor: FolderActor,
  folders?: PersonalFolder[],
) {
  const visible = folders ?? (await personalFolders(actor)),
    keys = visible.map((f) => "folder:" + f.id),
    ids = visible.map((f) => f.id);
  if (!ids.length) return [];
  const [items, copies] = await Promise.all([
    db.libraryItem.findMany({
      where: {
        OR: [
          { destinationKey: null, folderId: { in: ids } },
          { destinationKey: { in: keys } },
        ],
      },
      select: { variationId: true, userId: true },
    }),
    db.libraryImageCopy.findMany({
      where: { destinationKey: { in: keys }, deletedAt: null },
      select: { variationId: true, userId: true },
    }),
  ]);
  const byOwner = new Map<string, Set<string>>();
  for (const row of [...items, ...copies]) {
    const set = byOwner.get(row.userId) ?? new Set();
    set.add(row.variationId);
    byOwner.set(row.userId, set);
  }
  const allowed = new Set<string>();
  for (const [ownerId, values] of byOwner) {
    const owner = await db.user.findFirst({
      where: { id: ownerId, status: "APPROVED", archivedAt: null },
      select: { id: true, role: true, aiAccessEnabled: true },
    });
    if (
      !owner ||
      !hasAiModuleAccess(owner) ||
      ["SUPERVISOR", "ADVISOR"].includes(owner.role)
    )
      continue;
    const { hierarchyScope } = await import("./hierarchy-filters");
    const scope = await hierarchyScope(owner, new URLSearchParams(), true);
    const rows = await db.variation.findMany({
      where: {
        id: { in: [...values] },
        AND: [
          libraryImageVisibility(owner),
          {
            job:
              owner.role === "OWNER"
                ? {
                    OR: [
                      scope.access ?? { id: "" },
                      { projectId: "connection-test" },
                    ],
                  }
                : (scope.access ?? { id: "" }),
          },
          ...(actor.role !== "OWNER"
            ? [{ job: { projectId: { not: "connection-test" } } }]
            : []),
          ...(actor.role !== "OWNER" && ownerId !== actor.id
            ? [{ reviewStatus: "APPROVED" }]
            : []),
        ],
      },
      select: { id: true },
    });
    for (const row of rows) allowed.add(row.id);
  }
  return [...allowed];
}
export async function sharedImageFileAccess(
  actor: FolderActor,
  variationId: string,
) {
  const allowed = await delegatedImageIds(actor);
  demand(allowed.includes(variationId), "No tienes acceso a este afiche.", 404);
}
export async function personalDocumentAccess(
  actor: FolderActor,
  d: { userId: string; folderId: string | null; destinationKey: string | null },
) {
  if (actor.role === "OWNER" || d.userId === actor.id) return;
  if (
    d.destinationKey?.startsWith("folder:") ||
    (!d.destinationKey && d.folderId)
  ) {
    await personalFolderAccess(
      actor,
      d.destinationKey?.slice(7) ?? d.folderId!,
    );
    return;
  }
  if (d.destinationKey) {
    const [kind, id] = d.destinationKey.split(":");
    if (["project", "product", "subproduct"].includes(kind)) {
      const { libraryResourceAccess } = await import("./library-access");
      await libraryResourceAccess(
        actor,
        kind === "product" ? "category" : kind,
        id,
        "VIEW",
      );
      return;
    }
  }
  demand(false, "No tienes acceso a este archivo.", 404);
}
