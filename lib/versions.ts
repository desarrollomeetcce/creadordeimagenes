import { recordActivity } from "./activity";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { projectAccess, jobResourceAccess, ownerOnly } from "./auth";
import { demand } from "./errors";
import {
  designSchema,
  renderDesign,
  validateManualChange,
  type Design,
} from "./design";
import { load, store, remove } from "./storage";
import {
  captureAuditThumbnail,
  prepareAuditThumbnail,
  type PreparedThumbnail,
} from "./visual-audit";
export async function accessibleVariation(
  user: { id: string; role: string },
  id: string,
  permission = "VIEW",
  deleted = false,
) {
  const v = await db.variation.findUnique({
    where: { id },
    include: { job: true },
  });
  demand(v && (!v.deletedAt || deleted), "Afiche no encontrado.", 404);
  if (v.job.projectId === "connection-test") ownerOnly(user);
  else await jobResourceAccess(user, v.job, permission);
  demand(
    !v.expired && (v.permanent || v.expiresAt > new Date()),
    "Los archivos de este afiche ya caducaron.",
    410,
  );
  return v;
}
export async function logoBytes(design: Design) {
  const ids = design.layers
    .filter((l) => l.type === "logo")
    .map((l) => l.attachmentId);
  const rows = await db.attachment.findMany({ where: { id: { in: ids } } });
  demand(
    new Set(ids).size === rows.length,
    "Falta un logo de esta composición.",
  );
  return new Map(
    await Promise.all(
      rows.map(async (a) => [a.id, await load(a.path)] as const),
    ),
  );
}
export async function publishVersion(
  tx: Prisma.TransactionClient,
  args: {
    variationId: string;
    expectedRevision: number;
    actorId: string;
    path: string;
    backgroundPath?: string | null;
    document?: Design | null;
    sourceJobId?: string;
    action: string;
    auditThumbnail: PreparedThumbnail;
  },
) {
  const changed = await tx.variation.updateMany({
    where: {
      id: args.variationId,
      revision: args.expectedRevision,
      deletedAt: null,
      expired: false,
    },
    data: {
      path: args.path,
      revision: { increment: 1 },
      reviewStatus: "PENDING",
    },
  });
  demand(
    changed.count,
    "El afiche cambió mientras trabajabas. Recarga antes de guardar para no sobrescribir otra edición.",
    409,
  );
  const version = await tx.imageVersion.create({
    data: {
      variationId: args.variationId,
      number: args.expectedRevision + 1,
      actorId: args.actorId,
      path: args.path,
      backgroundPath: args.backgroundPath,
      document: args.document
        ? JSON.parse(JSON.stringify(args.document))
        : undefined,
      sourceJobId: args.sourceJobId,
    },
  });
  await captureAuditThumbnail(tx, version.id, args.auditThumbnail);
  await recordActivity(tx, {
    data: {
      actorId: args.actorId,
      action: args.action,
      resourceId: args.variationId,
      detail: { version: args.expectedRevision + 1 },
    },
  });
}
export async function saveManual(
  user: { id: string; role: string },
  id: string,
  expected: number,
  raw: unknown,
) {
  const v = await accessibleVariation(user, id, "EDIT");
  demand(
    v.revision === expected,
    "Hay una versión más reciente. Recarga el editor.",
    409,
  );
  const current = await db.imageVersion.findUniqueOrThrow({
    where: { variationId_number: { variationId: id, number: expected } },
  });
  demand(
    current.document,
    "Esta imagen es aplanada; no contiene elementos independientes.",
  );
  const previous = designSchema.parse(current.document),
    next = designSchema.parse(raw);
  validateManualChange(previous, next);
  const bytes = await renderDesign(
    next,
    current.backgroundPath ? await load(current.backgroundPath) : null,
    await logoBytes(next),
  );
  const path = await store(bytes);
  try {
    const auditThumbnail = await prepareAuditThumbnail(bytes);
    await db.$transaction((tx) =>
      publishVersion(tx, {
        variationId: id,
        expectedRevision: expected,
        actorId: user.id,
        path,
        backgroundPath: current.backgroundPath,
        document: next,
        action: "EDICION_MANUAL",
        auditThumbnail,
      }),
    );
  } catch (e) {
    await remove(path).catch(() => {});
    throw e;
  }
  return { revision: expected + 1 };
}
export async function restoreVersion(
  user: { id: string; role: string },
  id: string,
  number: number,
  expected: number,
) {
  const v = await accessibleVariation(user, id, "EDIT");
  demand(v.revision === expected, "Hay una versión más reciente.", 409);
  const version = await db.imageVersion.findUnique({
    where: { variationId_number: { variationId: id, number } },
  });
  demand(version, "Versión no encontrada.", 404);
  const auditThumbnail = await prepareAuditThumbnail(await load(version.path));
  await db.$transaction((tx) =>
    publishVersion(tx, {
      variationId: id,
      expectedRevision: expected,
      actorId: user.id,
      path: version.path,
      backgroundPath: version.backgroundPath,
      document: version.document ? designSchema.parse(version.document) : null,
      action: "VERSION_RESTAURADA",
      auditThumbnail,
    }),
  );
  return { revision: expected + 1 };
}

/** Reuse the flat original as a background. Only new overlay layers become independently editable. */
export async function enableOverlay(
  user: { id: string; role: string },
  id: string,
  expected: number,
) {
  const v = await accessibleVariation(user, id, "EDIT");
  demand(
    v.revision === expected,
    "La imagen cambió. Recarga antes de editar.",
    409,
  );
  const current = await db.imageVersion.findUniqueOrThrow({
    where: { variationId_number: { variationId: id, number: expected } },
  });
  if (current.document) return { revision: v.revision };
  const bytes = await load(current.path),
    meta = await (
      await import("sharp")
    )
      .default(bytes, { limitInputPixels: 20000000 })
      .metadata();
  demand(
    meta.width &&
      meta.height &&
      meta.width >= 256 &&
      meta.height >= 256 &&
      meta.width <= 4096 &&
      meta.height <= 4096,
    "Esta imagen necesita dimensiones entre 256 y 4096 píxeles para abrirse en el editor.",
  );
  const document = designSchema.parse({
    width: meta.width,
    height: meta.height,
    backgroundColor: "#ffffff",
    layers: [],
  });
  const auditThumbnail = await prepareAuditThumbnail(bytes);
  await db.$transaction((tx) =>
    publishVersion(tx, {
      variationId: id,
      expectedRevision: expected,
      actorId: user.id,
      path: current.path,
      backgroundPath: current.path,
      document,
      action: "CAPAS_ADICIONALES_HABILITADAS",
      auditThumbnail,
    }),
  );
  return { revision: expected + 1 };
}
