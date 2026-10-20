import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { resourceAccess } from "./auth";
import { libraryTree } from "./library-explorer";
import {
  authorizedImages,
  documentLocation,
  locationFilter,
  subtree,
} from "./library-organization";
import {
  storagePurpose,
  storageRelevance,
  type ResourceScope,
} from "./resource-storage";
import { recordActivity } from "./activity";

type Actor = { id: string; role: string };
export type SystemReference = {
  bindingId: string;
  scope: string;
  resourceId: string;
  documentId?: string;
  variationId?: string;
  versionId?: string | null;
  copyId?: string;
};
const selectionSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^(n:(project|product|subproduct|folder|loose|tests):|[vcd]:)[^:]+$/);
async function context(actor: Actor) {
  return {
    tree: await libraryTree(actor),
    visible: await authorizedImages(actor),
    copyVisible: await authorizedImages(actor, true),
  };
}
async function files(
  actor: Actor,
  selection: string,
  purpose: string,
  ctx: Awaited<ReturnType<typeof context>>,
) {
  const kind = selection.slice(0, 1),
    id = selection.slice(2),
    node = kind === "n" ? ctx.tree.find((n) => n.id === id) : null;
  if (kind === "n")
    demand(
      node,
      "La carpeta ya no está disponible. Retira o actualiza el vínculo.",
      409,
    );
  const keys = node ? subtree(ctx.tree, id) : null;
  const docs =
    kind === "d" || keys
      ? await db.libraryDocument.findMany({
          where: {
            userId: actor.id,
            deletedAt: null,
            ...(keys ? documentLocation(keys) : { id }),
          },
          take: 80,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        })
      : [];
  const visuals =
    kind === "v" || keys
      ? await db.variation.findMany({
          where: {
            AND: [
              ctx.visible,
              ...(keys ? [locationFilter(actor, keys)] : [{ id }]),
            ],
          },
          include: {
            versions: { take: 1, orderBy: { number: "desc" } },
            subproduct: { select: { name: true } },
          },
          take: 80,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        })
      : [];
  const copies =
    kind === "c" || keys
      ? await db.libraryImageCopy.findMany({
          where: {
            userId: actor.id,
            deletedAt: null,
            ...(keys ? { destinationKey: { in: [...keys] } } : { id }),
            variation: ctx.copyVisible,
          },
          include: {
            variation: {
              include: {
                versions: { take: 1, orderBy: { number: "desc" } },
                subproduct: { select: { name: true } },
              },
            },
          },
          take: 80,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        })
      : [];
  if (kind !== "n")
    demand(
      docs.length + visuals.length + copies.length === 1,
      "El archivo ya no está disponible. Retira o actualiza el vínculo.",
      409,
    );
  if (kind === "d")
    demand(
      docs[0].generationReady &&
        (!docs[0].path.startsWith("large:") || !!docs[0].previewPath),
      "Este original necesita una copia optimizada o un extracto antes de adjuntarlo para generar.",
      409,
    );
  return [
    ...docs
      .filter(
        (d) =>
          d.generationReady &&
          (!d.path.startsWith("large:") || !!d.previewPath),
      )
      .map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        mime: d.previewPath ? "image/webp" : d.mime,
        path: d.previewPath ?? d.path,
        text: d.text,
        purpose: kind === "d" ? purpose : d.purpose,
        documentId: d.id,
        variationId: undefined as string | undefined,
        versionId: undefined as string | null | undefined,
        copyId: undefined as string | undefined,
      })),
    ...[
      ...visuals.map((v) => ({ v, copyId: undefined as string | undefined })),
      ...copies.map((c) => ({ v: c.variation, copyId: c.id })),
    ].map(({ v, copyId }) => ({
      id: "library:" + (v.versions[0]?.id ?? v.id),
      name: v.subproduct?.name ?? "Imagen de Biblioteca",
      description: "",
      mime: "image/png",
      path: v.versions[0]?.path ?? v.path,
      text: "",
      purpose: kind === "n" ? "Referencia visual" : purpose,
      documentId: undefined as string | undefined,
      variationId: v.id,
      versionId: v.versions[0]?.id ?? null,
      copyId,
    })),
  ];
}
async function activeActor(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });
  demand(
    user?.status === "APPROVED" && user.role !== "OBSERVER",
    "El propietario del vínculo ya no puede compartir estos recursos.",
    409,
  );
  return user;
}
export async function boundSystemReferences(
  resources: ResourceScope[],
  subject: string,
) {
  const bindings = await db.libraryResourceBinding.findMany({
    where: { OR: resources },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 90,
  });
  const candidates = [];
  for (const b of bindings) {
    const actor = await activeActor(b.userId),
      ctx = await context(actor);
    for (const f of await files(actor, b.selection, b.purpose, ctx))
      candidates.push({
        ...f,
        bindingId: b.id,
        scope: b.scope,
        resourceId: b.resourceId,
      });
  }
  const sorted = [
    ...new Map(
      candidates.map((c) => [c.variationId ?? c.documentId, c]),
    ).values(),
  ].sort(
    (a, b) =>
      storageRelevance(b.name, b.description, subject) -
        storageRelevance(a.name, a.description, subject) ||
      a.id.localeCompare(b.id),
  );
  return [
    ...sorted.filter((d) => d.mime.startsWith("image/")).slice(0, 9),
    ...sorted.filter((d) => !d.mime.startsWith("image/")).slice(0, 3),
  ];
}
export async function resolveSystemReferences(
  refs: SystemReference[],
  allowed: ResourceScope[],
) {
  demand(refs.length <= 9, "Demasiadas referencias del sistema.");
  const out = [];
  for (const r of refs) {
    demand(
      allowed.some((a) => a.scope === r.scope && a.resourceId === r.resourceId),
      "Referencia fuera del ámbito autorizado.",
      403,
    );
    const b = await db.libraryResourceBinding.findFirst({
      where: { id: r.bindingId, scope: r.scope, resourceId: r.resourceId },
    });
    demand(
      b,
      "El vínculo del sistema fue retirado. Revisa y autoriza de nuevo.",
      409,
    );
    const actor = await activeActor(b.userId),
      ctx = await context(actor),
      available = await files(actor, b.selection, b.purpose, ctx);
    const f = available.find((f) =>
      r.documentId
        ? f.documentId === r.documentId
        : f.variationId === r.variationId && f.copyId === r.copyId,
    );
    demand(
      f && f.mime.startsWith("image/"),
      "La referencia fue retirada o movida. Revisa y autoriza de nuevo.",
      409,
    );
    if (r.versionId) {
      const version = await db.imageVersion.findFirst({
        where: { id: r.versionId, variationId: r.variationId },
      });
      demand(
        version,
        "La versión de la referencia ya no está disponible.",
        409,
      );
      f.path = version.path;
      f.id = "library:" + version.id;
    }
    out.push(f);
  }
  return out;
}
export async function systemResourceRoutes(
  req: NextRequest,
  parts: string[],
  actor: Actor,
  body: () => Promise<unknown>,
) {
  const scope = z.enum(["project", "category", "subproduct"]).parse(parts[1]),
    resourceId = z.string().min(1).max(100).parse(parts[2]);
  await resourceAccess(
    actor,
    scope,
    resourceId,
    req.method === "GET" ? "VIEW" : "EDIT",
  );
  const send = (v: unknown) =>
    NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
  if (req.method === "GET") {
    const rows = await db.libraryResourceBinding.findMany({
        where: { scope, resourceId, userId: actor.id },
        orderBy: { createdAt: "asc" },
      }),
      ctx = await context(actor);
    const result = [];
    for (const b of rows) {
      try {
        const selected = await files(actor, b.selection, b.purpose, ctx);
        result.push({
          selection: b.selection,
          purpose: b.purpose,
          name: b.selection.startsWith("n:")
            ? ctx.tree.find((n) => n.id === b.selection.slice(2))?.name
            : selected[0]?.name,
          available: true,
        });
      } catch {
        result.push({
          selection: b.selection,
          purpose: b.purpose,
          name: "Recurso no disponible",
          available: false,
        });
      }
    }
    return send(result);
  }
  demand(req.method === "PUT", "Método no permitido.", 405);
  const input = z
    .object({
      selections: z
        .array(
          z
            .object({ selection: selectionSchema, purpose: storagePurpose })
            .strict(),
        )
        .max(30),
    })
    .strict()
    .parse(await body());
  demand(
    new Set(input.selections.map((s) => s.selection)).size ===
      input.selections.length,
    "La selección contiene duplicados.",
  );
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(428281)`;
      const current = await activeActor(actor.id);
      demand(current.role === actor.role, "Los permisos cambiaron.", 403);
      await resourceAccess(current, scope, resourceId, "EDIT");
      const ctx = await context(current);
      for (const entry of input.selections)
        await files(current, entry.selection, entry.purpose, ctx);
      await tx.libraryResourceBinding.deleteMany({
        where: {
          scope,
          resourceId,
          userId: actor.id,
          selection: { notIn: input.selections.map((s) => s.selection) },
        },
      });
      for (const entry of input.selections)
        await tx.libraryResourceBinding.upsert({
          where: {
            scope_resourceId_userId_selection: {
              scope,
              resourceId,
              userId: actor.id,
              selection: entry.selection,
            },
          },
          create: { ...entry, scope, resourceId, userId: actor.id },
          update: { purpose: entry.purpose },
        });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "RECURSOS_SISTEMA_VINCULADOS",
          resourceId,
          detail: { scope, count: input.selections.length },
        },
      });
    },
    { timeout: 30000 },
  );
  return send({ ok: true });
}
