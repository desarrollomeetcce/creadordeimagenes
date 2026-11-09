import {
  personalFolders,
  personalFolderContext,
  personalFolderAccess,
  personalDocumentAccess,
  delegatedImageIds,
} from "./personal-folder-access";
import {
  organizeTree,
  organizeSelection,
  subtree,
  locationFilter,
  documentLocation,
  authorizedImages,
  mergedPage,
} from "./library-organization";
import {
  libraryProjectFilter,
  libraryCategoryFilter,
  librarySubproductFilter,
  libraryResourceAccess,
} from "./library-access";
import { deletedSourceNotice } from "./source-status";
import { dismissedOrderIds } from "./order-dismissal";
import { emptyStoppedSubproducts } from "./order-visibility";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { demand } from "./errors";
import { ownerOnly, rateLimit } from "./auth";
import {
  hierarchyScope,
  hierarchyOptions,
  dateRange,
} from "./hierarchy-filters";
import { load, store, remove, fileStream } from "./storage";
type Actor = { id: string; role: string };
type Node = {
  id: string;
  name: string;
  parentId: string | null;
  kind: string;
  canManageSharing?: boolean;
  sourceDeleted?: boolean;
  sourceParentId?: string | null;
};
const ids = z.array(z.string().min(1).max(120)).min(1).max(200);
const send = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export async function libraryTree(
  user: Actor,
  organized = true,
  visibleFolders?: Awaited<ReturnType<typeof personalFolders>>,
): Promise<Node[]> {
  const [projects, products, subs, folders, states] = await Promise.all([
    db.project.findMany({
      where: libraryProjectFilter(user),
      select: { id: true, name: true, ownerId: true, deletedAt: true },
    }),
    db.category.findMany({
      where: libraryCategoryFilter(user),
      select: {
        id: true,
        name: true,
        projectId: true,
        createdById: true,
        deletedAt: true,
        project: { select: { deletedAt: true, ownerId: true } },
      },
    }),
    db.subproduct.findMany({
      where: librarySubproductFilter(user),
      select: {
        id: true,
        name: true,
        categoryId: true,
        createdById: true,
        studio: true,
        _count: {
          select: {
            variations: { where: { deletedAt: null, expired: false } },
          },
        },
        deletedAt: true,
        category: {
          select: {
            deletedAt: true,
            createdById: true,
            project: { select: { deletedAt: true, ownerId: true } },
          },
        },
      },
    }),
    visibleFolders ? Promise.resolve(visibleFolders) : personalFolders(user),
    db.libraryNodeState.findMany({ where: { userId: user.id } }),
  ]);
  const hiddenSubs = await emptyStoppedSubproducts(
    subs.filter((sub) => !deletedSourceNotice(sub)).map((sub) => sub.id),
  );
  return organizeTree(
    [
      {
        id: "loose:root",
        name: "Archivos sin carpeta",
        parentId: null,
        kind: "loose",
      },
      ...projects.map((p) => ({
        id: "project:" + p.id,
        name: p.name,
        parentId: null,
        kind: "project",
        canManageSharing:
          user.role === "OWNER" ||
          (user.role !== "OBSERVER" && p.ownerId === user.id),
        sourceDeleted: !!p.deletedAt,
      })),
      ...products.map((p) => ({
        id: "product:" + p.id,
        name: p.name,
        parentId: "project:" + p.projectId,
        kind: "product",
        canManageSharing:
          user.role === "OWNER" ||
          (user.role !== "OBSERVER" &&
            (p.createdById === user.id || p.project.ownerId === user.id)),
        sourceDeleted: !!(p.deletedAt || p.project.deletedAt),
      })),
      ...subs
        .filter(
          (sub) =>
            !hiddenSubs.has(sub.id) &&
            !(
              (sub.studio as any)?.folderPending === true ||
              ((sub.studio as any)?.folderPending === undefined &&
                (sub.studio as any)?.country &&
                !sub._count.variations)
            ),
        )
        .map((p) => ({
          id: "subproduct:" + p.id,
          name: p.name,
          parentId: "product:" + p.categoryId,
          kind: "subproduct",
          canManageSharing:
            user.role === "OWNER" ||
            (user.role !== "OBSERVER" &&
              (p.createdById === user.id ||
                p.category.createdById === user.id ||
                p.category.project.ownerId === user.id)),
          sourceDeleted: !!deletedSourceNotice(p),
        })),
      ...(user.role === "OWNER"
        ? [
            {
              id: "tests:connection-test",
              name: "Pruebas",
              parentId: null,
              kind: "tests",
            },
          ]
        : []),
      ...folders.map((f) => ({
        id: "folder:" + f.id,
        name: f.name,
        parentId: f.parentId
          ? "folder:" + f.parentId
          : f.anchorScope
            ? f.anchorScope + ":" + f.anchorId
            : null,
        kind: "folder",
        canManageSharing:
          user.role === "OWNER" ||
          (user.role !== "OBSERVER" && f.userId === user.id),
      })),
    ],
    organized ? states : [],
  ).sort((a, b) => a.name.localeCompare(b.name, "es"));
}
async function destination(
  user: Actor,
  key: string | null,
  navigation = false,
) {
  if (!key || key === "root" || key === "loose:root")
    return { parentId: null, anchorScope: null, anchorId: null };
  const [kind, id] = key.split(":");
  demand(id, "Carpeta no válida.");
  if (kind === "folder") {
    await personalFolderAccess(user, id);
    return { parentId: id, anchorScope: null, anchorId: null };
  }
  demand(
    ["project", "product", "subproduct", "tests"].includes(kind),
    "Destino no válido.",
  );
  if (kind === "tests") ownerOnly(user);
  else
    await libraryResourceAccess(
      user,
      kind === "product" ? "category" : (kind as "project" | "subproduct"),
      id,
      navigation ? "NAVIGATE" : "VIEW",
    );
  return { parentId: null, anchorScope: kind, anchorId: id };
}
export async function explorerData(user: Actor, incoming: URLSearchParams) {
  const sharing = await personalFolderContext(user);
  const params = new URLSearchParams(incoming),
    tree = await libraryTree(user, true, sharing.folders);
  const query = z
      .string()
      .max(200)
      .parse(params.get("q") ?? "")
      .trim(),
    words = query.split(/\s+/).filter(Boolean);
  const imageSearch: Prisma.VariationWhereInput[] = words.map((word) => ({
    OR: [
      { id: { contains: word, mode: "insensitive" } },
      { model: { contains: word, mode: "insensitive" } },
      { subproduct: { name: { contains: word, mode: "insensitive" } } },
      {
        subproduct: {
          category: { name: { contains: word, mode: "insensitive" } },
        },
      },
      {
        subproduct: {
          category: {
            project: { name: { contains: word, mode: "insensitive" } },
          },
        },
      },
    ],
  }));
  const requested = params.get("folder") ?? "";
  if (
    requested &&
    !requested.startsWith("folder:") &&
    requested !== "loose:root"
  ) {
    let n = tree.find((n) => n.id === requested);
    const visited = new Set<string>();
    demand(n, "Carpeta no disponible.", 404);
    params.delete("project");
    params.delete("product");
    params.delete("subproduct");
    while (n && !visited.has(n.id)) {
      visited.add(n.id);
      if (["project", "product", "subproduct"].includes(n.kind))
        params.set(n.kind, n.id.slice(n.id.indexOf(":") + 1));
      if (n.kind === "tests") params.set("project", "none");
      const parent: string | null =
        n.sourceParentId === undefined ? n.parentId : n.sourceParentId;
      n = tree.find((row) => row.id === parent);
    }
  }
  const scope = await hierarchyScope(user, params, true),
    dates = dateRange(params);
  const folder =
    params.get("folder") ??
    (scope.subproduct
      ? "subproduct:" + scope.subproduct
      : scope.product
        ? "product:" + scope.product
        : scope.project === "none"
          ? "tests:connection-test"
          : scope.project
            ? "project:" + scope.project
            : "");
  if (folder) await destination(user, folder, true);
  const foldersOnly =
    !query &&
    !folder &&
    !["project", "product", "subproduct"].some((key) => params.get(key));
  const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(params.get("page") ?? 1),
    limit = z.coerce
      .number()
      .refine((v) => [25, 50, 100].includes(v))
      .parse(params.get("limit") ?? 25);
  const review = z
      .enum(["all", "approved", "pending"])
      .parse(params.get("review") ?? "all"),
    order = z.enum(["newest", "oldest"]).parse(params.get("order") ?? "newest"),
    kind = z
      .enum(["all", "images", "documents"])
      .parse(params.get("kind") ?? "all");
  if (folder)
    demand(
      tree.some((n) => n.id === folder),
      "Carpeta no disponible.",
      404,
    );
  const locationKeys =
    query && !folder
      ? new Set(["__root", ...tree.map((n) => n.id)])
      : !!query ||
          params.get("recursive") === "true" ||
          (!incoming.has("folder") && params.get("recursive") !== "false")
        ? subtree(tree, folder || "__root")
        : new Set([folder || "__root"]);
  const accessibleFolders = sharing.folders,
    sharedKeys = [
      ...sharing.nativeKeys,
      ...accessibleFolders.map((f) => "folder:" + f.id),
    ],
    sharedFolderIds = accessibleFolders.map((f) => f.id);
  const delegated = await delegatedImageIds(user, accessibleFolders);
  const authorized = await authorizedImages(user, false, false, delegated);
  const aliasAuthorized = await authorizedImages(user, true, false, delegated);
  const personal = folder.startsWith("folder:") ? folder.slice(7) : null;
  const where: Prisma.VariationWhereInput = {
    ...(kind === "documents" ? { id: "" } : {}),
    ...(review === "approved"
      ? { reviewStatus: "APPROVED" }
      : review === "pending"
        ? { reviewStatus: "PENDING" }
        : {}),
    AND: [authorized, locationFilter(user, locationKeys), ...imageSearch],
    ...(Object.keys(dates).length ? { createdAt: dates } : {}),
  };
  if (foldersOnly) where.id = "";
  const documentWhere: Prisma.LibraryDocumentWhereInput = {
    AND: [
      ...words.map((word) => ({
        name: { contains: word, mode: "insensitive" as const },
      })),
      {
        OR: [
          { userId: user.id },
          { destinationKey: null, folderId: { in: sharedFolderIds } },
          { destinationKey: { in: sharedKeys } },
        ],
      },
    ],
    deletedAt: null,
    ...documentLocation(locationKeys),
    ...(kind === "images" || foldersOnly ? { id: "" } : {}),
    ...(Object.keys(dates).length ? { createdAt: dates } : {}),
  };
  const copyWhere: Prisma.LibraryImageCopyWhereInput = {
    OR: [{ userId: user.id }, { destinationKey: { in: sharedKeys } }],
    deletedAt: null,
    destinationKey: { in: [...locationKeys] },
    variation: {
      AND: [
        aliasAuthorized,
        ...imageSearch,
        ...(review === "all"
          ? []
          : [{ reviewStatus: review === "approved" ? "APPROVED" : "PENDING" }]),
      ],
    },
    ...(Object.keys(dates).length ? { createdAt: dates } : {}),
    ...(foldersOnly || kind === "documents" ? { id: "" } : {}),
  };
  const dismissed = await dismissedOrderIds(user.id);
  const resultsOnly = params.get("resultsOnly") === "true";
  const pendingWhere: Prisma.GenerationJobWhereInput = {
    status: { in: ["PENDING", "RUNNING", "FAILED", "UNCERTAIN"] },
    variation: null,
    NOT: dismissed.map((id) => ({
      snapshot: { path: ["orderId"], equals: id },
    })),
    snapshot: { path: ["orderId"], string_starts_with: "" },
    AND: [
      scope.where,
      user.role === "OWNER"
        ? { OR: [scope.access ?? { id: "" }, { projectId: "connection-test" }] }
        : (scope.access ?? { id: "" }),
    ],
    ...(user.role === "OWNER" ? {} : { actorId: user.id }),
    ...(Object.keys(dates).length ? { createdAt: dates } : {}),
    ...(resultsOnly ||
    query ||
    personal ||
    foldersOnly ||
    folder === "loose:root" ||
    kind === "documents" ||
    review === "approved" ||
    user.role === "OBSERVER"
      ? { id: "" }
      : {}),
  };
  const slotsWhere: Prisma.GenerationJobWhereInput = {
    ...(resultsOnly
      ? { variation: where }
      : { OR: [{ variation: where }, pendingWhere] }),
  };
  const [
    nativeTotal,
    documents,
    counts,
    documentCount,
    inflightTotal,
    copyTotal,
  ] = await Promise.all([
    db.variation.count({ where }),
    db.libraryDocument.findMany({
      where: documentWhere,
      select: {
        id: true,
        name: true,
        mime: true,
        size: true,
        generationReady: true,
        previewPath: true,
        path: true,
        createdAt: true,
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: [
        { createdAt: order === "oldest" ? "asc" : "desc" },
        { id: "asc" },
      ],
    }),
    query
      ? Promise.resolve([])
      : db.generationJob.groupBy({
          by: ["status"],
          where: {
            AND: [
              ...(personal || folder === "loose:root"
                ? [{ id: "" }]
                : [scope.where]),
              user.role === "OWNER"
                ? {
                    OR: [
                      scope.access ?? { id: "" },
                      { projectId: "connection-test" },
                    ],
                  }
                : (scope.access ?? { id: "" }),
            ],
            ...(user.role !== "OWNER"
              ? { OR: [{ status: "COMPLETED" }, { actorId: user.id }] }
              : {}),
            ...(Object.keys(dates).length ? { createdAt: dates } : {}),
          },
          _count: true,
        }),
    db.libraryDocument.count({ where: documentWhere }),
    resultsOnly
      ? Promise.resolve(0)
      : db.generationJob.count({ where: pendingWhere }),
    db.libraryImageCopy.count({ where: copyWhere }),
  ]);
  const variationSelect = {
    mediaType: true,
    ownResource: true,
    originalName: true,
    id: true,
    revision: true,
    reviewStatus: true,
    createdAt: true,
    model: true,
    subproduct: {
      select: {
        id: true,
        name: true,
        deletedAt: true,
        category: {
          select: {
            id: true,
            name: true,
            deletedAt: true,
            project: { select: { id: true, name: true, deletedAt: true } },
          },
        },
      },
    },
    job: { select: { id: true, projectId: true, actorId: true } },
  } satisfies Prisma.VariationSelect;
  const readNative = async (skip: number, take: number) =>
    (
      await db.generationJob.findMany({
        where: slotsWhere,
        skip,
        take,
        orderBy: [
          { createdAt: order === "oldest" ? "asc" : "desc" },
          { id: "asc" },
        ],
        select: {
          id: true,
          status: true,
          createdAt: true,
          subproductId: true,
          variation: { select: variationSelect },
        },
      })
    ).map((row) => ({
      ...row,
      entryId: row.variation?.id ?? row.id,
      selectionId: row.variation ? "v:" + row.variation.id : null,
      copied: false,
    }));
  type Slot = Awaited<ReturnType<typeof readNative>>[number];
  const readCopies = async (skip: number, take: number): Promise<Slot[]> =>
    (
      await db.libraryImageCopy.findMany({
        where: copyWhere,
        skip,
        take,
        orderBy: [
          { createdAt: order === "oldest" ? "asc" : "desc" },
          { id: "asc" },
        ],
        select: {
          id: true,
          createdAt: true,
          variation: { select: variationSelect },
        },
      })
    ).map((row) => ({
      id: row.id,
      entryId: row.id,
      selectionId: "c:" + row.id,
      copied: true,
      status: "COMPLETED",
      createdAt: row.createdAt,
      subproductId: row.variation.subproduct?.id ?? null,
      variation: row.variation,
    }));
  const slots = await mergedPage<Slot>(
    nativeTotal + inflightTotal,
    copyTotal,
    (page - 1) * limit,
    limit,
    order === "oldest",
    readNative,
    readCopies,
  );
  const total = nativeTotal + copyTotal;
  const items = slots.flatMap((slot) =>
    slot.variation
      ? [
          {
            ...slot.variation,
            entryId: slot.entryId,
            selectionId: slot.selectionId,
            copied: slot.copied,
          },
        ]
      : [],
  );
  const sourceVisible = await authorizedImages(user);
  const sourceRows = await db.variation.findMany({
      where: { id: { in: items.map((v) => v.id) }, AND: [sourceVisible] },
      select: { id: true },
    }),
    sourceIds = new Set(sourceRows.map((v) => v.id));
  const costs =
    user.role === "OBSERVER"
      ? []
      : await db.usageLedger.findMany({
          where: {
            jobId: {
              in: items.filter((v) => sourceIds.has(v.id)).map((v) => v.job.id),
            },
          },
          select: { jobId: true, actualMicros: true },
        });
  const costMap = new Map(
    costs.map((c) => [c.jobId, c.actualMicros?.toString() ?? null]),
  );
  let orders =
    personal || foldersOnly || folder === "loose:root"
      ? []
      : await (
          await import("./generation-orders")
        ).libraryOrders(user, {
          AND: [
            scope.where,
            user.role === "OWNER"
              ? {
                  OR: [
                    scope.access ?? { id: "" },
                    { projectId: "connection-test" },
                  ],
                }
              : (scope.access ?? { id: "" }),
          ],
          ...(Object.keys(dates).length ? { createdAt: dates } : {}),
        });
  if (
    !personal &&
    !foldersOnly &&
    folder !== "loose:root" &&
    slots.some(
      (slot) =>
        !slot.variation &&
        !orders.some((order) => order.jobs.some((job) => job.id === slot.id)),
    )
  ) {
    const extra = await (
      await import("./generation-orders")
    ).libraryOrders(user, {
      id: {
        in: slots.filter((slot) => !slot.variation).map((slot) => slot.id),
      },
      AND: [
        scope.where,
        user.role === "OWNER"
          ? {
              OR: [
                scope.access ?? { id: "" },
                { projectId: "connection-test" },
              ],
            }
          : (scope.access ?? { id: "" }),
      ],
    });
    orders = [
      ...new Map(
        [...orders, ...extra].map((order) => [order.id, order]),
      ).values(),
    ];
  }
  const pendingSubs = await db.subproduct.findMany({
    where: {
      id: {
        in: slots
          .filter((slot) => !slot.variation)
          .flatMap((slot) => (slot.subproductId ? [slot.subproductId] : [])),
      },
      ...librarySubproductFilter(user),
    },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      category: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
          project: { select: { id: true, name: true, deletedAt: true } },
        },
      },
    },
  });
  const archivedNodes = new Set(
    tree.filter((node) => node.sourceDeleted).map((node) => node.id),
  );
  orders = orders.map((order) =>
    archivedNodes.has("subproduct:" + order.scope.subproduct) ||
    archivedNodes.has("project:" + order.scope.project)
      ? {
          ...order,
          canManage: false,
          canApproveSample: false,
          canContinuePending: false,
        }
      : order,
  );
  const inflight = slots
    .filter((slot) => !slot.variation)
    .map((slot) => ({
      id: slot.id,
      status: slot.status,
      createdAt: slot.createdAt,
      subproduct:
        pendingSubs.find((sub) => sub.id === slot.subproductId) ?? null,
      sourceNotice: deletedSourceNotice(
        pendingSubs.find((sub) => sub.id === slot.subproductId),
      ),
      orderId:
        orders.find((order) => order.jobs.some((job) => job.id === slot.id))
          ?.id ?? null,
    }));

  const historyVisible = await authorizedImages(user, true, true);
  const scopedLocation = foldersOnly ? {} : locationFilter(user, locationKeys);
  const removedLocation: Prisma.VariationWhereInput = foldersOnly
    ? {}
    : {
        OR: [
          {
            AND: [
              scopedLocation,
              {
                libraryExclusions: {
                  none: { userId: user.id, destinationKey: { not: null } },
                },
              },
            ],
          },
          {
            libraryExclusions: {
              some: {
                userId: user.id,
                destinationKey: { in: [...locationKeys] },
              },
            },
          },
        ],
      };
  const excluded = query
    ? 0
    : await db.variation.count({
        where: {
          AND: [
            historyVisible,
            removedLocation,
            {
              OR: [
                { deletedAt: { not: null } },
                { libraryExclusions: { some: { userId: user.id } } },
              ],
            },
          ],
          ...(Object.keys(dates).length ? { createdAt: dates } : {}),
        },
      });
  const copyLocation = foldersOnly
    ? {}
    : { destinationKey: { in: [...locationKeys] } };
  const [
    removedCopies,
    removedDocuments,
    broughtCopies,
    broughtDocuments,
    broughtImages,
    broughtRemoved,
  ] = query
    ? [0, 0, 0, 0, 0, 0]
    : await Promise.all([
        db.libraryImageCopy.count({
          where: {
            userId: user.id,
            ...copyLocation,
            deletedAt: { not: null },
            variation: aliasAuthorized,
            ...(Object.keys(dates).length ? { createdAt: dates } : {}),
          },
        }),
        db.libraryDocument.count({
          where: {
            userId: user.id,
            ...(foldersOnly ? {} : documentLocation(locationKeys)),
            deletedAt: { not: null },
            ...(Object.keys(dates).length ? { createdAt: dates } : {}),
          },
        }),
        db.libraryImageCopy.count({
          where: {
            userId: user.id,
            ...copyLocation,
            variation: aliasAuthorized,
            ...(Object.keys(dates).length ? { createdAt: dates } : {}),
          },
        }),
        db.libraryDocument.count({
          where: {
            userId: user.id,
            ...(foldersOnly ? {} : documentLocation(locationKeys)),
            ...(Object.keys(dates).length ? { createdAt: dates } : {}),
          },
        }),
        db.libraryItem.count({
          where: {
            userId: user.id,
            broughtAt: Object.keys(dates).length ? dates : { not: null },
            variation: {
              AND: [historyVisible, ...(foldersOnly ? [] : [scopedLocation])],
            },
          },
        }),
        db.libraryExclusion.count({
          where: {
            userId: user.id,
            broughtAt: Object.keys(dates).length ? dates : { not: null },
            ...(foldersOnly
              ? {}
              : { destinationKey: { in: [...locationKeys] } }),
            variation: historyVisible,
          },
        }),
      ]);
  return {
    orders,
    query,
    foldersOnly,
    inflight,
    inflightTotal,
    entries: slots.map((slot) => ({
      kind: slot.variation ? "image" : "pending",
      id: slot.entryId,
    })),
    tree,
    items: items.map((v) => ({
      ...v,
      ...(!sourceIds.has(v.id)
        ? { job: { id: "" }, subproduct: null, model: "" }
        : {}),
      sourceNotice: deletedSourceNotice(v.subproduct),
      ...(user.role !== "OBSERVER"
        ? { actualMicros: costMap.get(v.job.id) ?? null }
        : {}),
      canEdit: user.role !== "OBSERVER" && sourceIds.has(v.id),
      canApprove:
        user.role !== "OBSERVER" &&
        (user.role === "OWNER" || v.job.actorId === user.id),
    })),
    documents: documents.map(({ path, previewPath, ...d }) => ({
      ...d,
      large: path.startsWith("large:"),
      hasPreview: !!previewPath,
    })),
    total,
    page,
    pages: Math.max(
      1,
      Math.ceil((total + inflightTotal) / limit),
      Math.ceil(documentCount / limit),
    ),
    counts: query
      ? {}
      : {
          ...Object.fromEntries(counts.map((c) => [c.status, c._count])),
          DELETED: excluded + removedCopies + removedDocuments,
          BROUGHT:
            broughtCopies + broughtDocuments + broughtImages + broughtRemoved,
        },
  };
}
export async function explorerRoutes(
  req: NextRequest,
  parts: string[],
  user: Actor,
  body: () => Promise<unknown>,
) {
  if (parts[1] === "selection-actions" && req.method === "POST")
    return send(
      await organizeSelection(user, await body(), () => libraryTree(user)),
    );
  if (parts[1] === "hierarchy" && req.method === "GET")
    return send(await hierarchyOptions(user, req.nextUrl.searchParams, true));
  if (parts[1] === "tree" && req.method === "GET")
    return send(
      await libraryTree(
        user,
        req.nextUrl.searchParams.get("organization") !== "source",
      ),
    );
  if (parts[1] === "explorer" && req.method === "GET")
    return send(await explorerData(user, req.nextUrl.searchParams));
  if (parts[1] === "folder-actions" && req.method === "POST") {
    demand(
      user.role !== "OBSERVER",
      "Observador solo puede ver y descargar.",
      403,
    );
    const b = z
      .object({
        action: z.enum(["create", "move", "delete", "rename"]),
        ids: ids.optional(),
        destination: z.string().max(150).nullable().optional(),
        name: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .parse(await body());
    return send(
      await organizeSelection(
        user,
        {
          operation: b.action,
          selection: (b.ids ?? []).map((id) => "n:folder:" + id),
          destination: b.destination ?? undefined,
          ...(b.name ? { name: b.name } : {}),
        },
        () => libraryTree(user),
      ),
    );
  }
  if (parts[1] === "item-actions" && req.method === "POST") {
    const b = z
      .object({
        action: z.enum(["move", "remove"]),
        ids,
        folderId: z.string().nullable().optional(),
      })
      .strict()
      .parse(await body());
    return send(
      await organizeSelection(
        user,
        {
          operation: b.action === "move" ? "move" : "delete",
          selection: b.ids.map((id) => "v:" + id),
          destination: b.folderId ? "folder:" + b.folderId : "loose:root",
        },
        () => libraryTree(user),
      ),
    );
  }

  if (parts[1] === "documents") {
    if (parts[2]) {
      const d = await db.libraryDocument.findFirst({
        where: {
          id: parts[2],
          ...(req.method === "GET" ? {} : { userId: user.id }),
          deletedAt: null,
        },
      });
      demand(d, "Archivo no disponible.", 404);
      if (req.method === "GET") {
        await personalDocumentAccess(user, d);
        const preview = req.nextUrl.searchParams.get("preview") === "1";
        const filePath = preview && d.previewPath ? d.previewPath : d.path;
        const headers = {
          "Content-Type": preview && d.previewPath ? "image/webp" : d.mime,
          "Content-Disposition":
            (preview ? "inline" : "attachment") +
            "; filename*=UTF-8''" +
            encodeURIComponent(d.name),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        };
        if (filePath.startsWith("large:")) {
          if (preview)
            return new Response(null, {
              status: 404,
              headers: { "Cache-Control": "no-store" },
            });
          const result = await (
            await import("./large-uploads")
          ).largeAssetStream(filePath, req.headers.get("range"));
          return new Response(result.stream, {
            status: result.status,
            headers: { ...headers, ...result.headers },
          });
        }
        return new Response(fileStream(await load(filePath)), { headers });
      }
      if (req.method === "DELETE") {
        demand(
          user.role !== "OBSERVER",
          "Observador solo puede ver y descargar.",
          403,
        );
        return send(
          await organizeSelection(
            user,
            { operation: "delete", selection: ["d:" + d.id] },
            () => libraryTree(user),
          ),
        );
      }
      if (req.method === "PATCH") {
        demand(
          user.role !== "OBSERVER",
          "Observador solo puede ver y descargar.",
          403,
        );
        const b = z
          .object({ folderId: z.string().nullable() })
          .strict()
          .parse(await body());
        if (b.folderId) await destination(user, "folder:" + b.folderId);
        return send(
          await organizeSelection(
            user,
            {
              operation: "move",
              selection: ["d:" + d.id],
              destination: b.folderId ? "folder:" + b.folderId : "loose:root",
            },
            () => libraryTree(user),
          ),
        );
      }
    } else if (req.method === "POST") {
      demand(
        user.role !== "OBSERVER",
        "Observador solo puede ver y descargar.",
        403,
      );
      await rateLimit("library-upload:" + user.id, 30);
      demand(
        Number(req.headers.get("content-length") ?? 0) <= 3100000,
        "El archivo supera el máximo de 3 MB.",
        413,
      );
      const reader = req.body?.getReader(),
        chunks: Uint8Array[] = [];
      let bytesRead = 0;
      demand(reader, "Elige un archivo.");
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytesRead += chunk.value.byteLength;
        if (bytesRead > 3100000) {
          await reader.cancel();
          demand(false, "El archivo supera el máximo de 3 MB.", 413);
        }
        chunks.push(chunk.value);
      }
      const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
          headers: { "Content-Type": req.headers.get("content-type") ?? "" },
        }).formData(),
        file = form.get("file"),
        folderId = String(form.get("folderId") ?? "") || null,
        destinationKey =
          String(form.get("destination") ?? "") ||
          (folderId ? "folder:" + folderId : "loose:root");
      demand(
        file instanceof File && file.size > 0 && file.size <= 3000000,
        "Elige un archivo de hasta 3 MB.",
        413,
      );
      const allowed = [
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
        "image/webp",
      ];
      demand(
        allowed.includes(file.type),
        "Utiliza PDF, TXT, CSV, DOCX, PNG, JPG o WEBP.",
      );
      demand(
        !folderId || destinationKey === "folder:" + folderId,
        "La carpeta de destino no coincide con el archivo.",
      );
      const uploadTree = await libraryTree(user);
      demand(
        destinationKey === "loose:root" ||
          uploadTree.some((n) => n.id === destinationKey),
        "Destino no disponible.",
        404,
      );
      const path = await store(Buffer.from(await file.arrayBuffer()));
      try {
        return send(
          await db.libraryDocument.create({
            data: {
              userId: user.id,
              folderId: destinationKey.startsWith("folder:")
                ? destinationKey.slice(7)
                : null,
              destinationKey,
              name: file.name.slice(0, 200),
              mime: file.type,
              path,
              size: file.size,
            },
          }),
          201,
        );
      } catch (e) {
        await remove(path);
        throw e;
      }
    }
  }
  return null;
}
