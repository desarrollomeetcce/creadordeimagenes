import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { projectAccess, ownerOnly } from "./auth";
import { demand } from "./errors";
import { fileStream, load } from "./storage";
import JSZip from "jszip";

export const collectionScope = z.enum(["project", "category", "subproduct"]);
const filtersSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    review: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED"]).default("ALL"),
    favorite: z.boolean().default(false),
    saved: z.boolean().default(false),
  })
  .strict();
const scopeSchema = z.object({
  scope: collectionScope,
  id: z.string().min(1).max(100),
});
type User = { id: string; role: string };
type Scope = z.infer<typeof scopeSchema>;

export async function collectionContext(user: User, input: Scope) {
  let projectId: string, name: string;
  if (input.scope === "project") {
    const project = await projectAccess(user, input.id);
    projectId = project.id;
    name = project.name;
  } else if (input.scope === "category") {
    const category = await db.category.findUnique({ where: { id: input.id } });
    demand(category, "Categoría no encontrada.", 404);
    projectId = category.projectId;
    name = category.name;
  } else {
    const sub = await db.subproduct.findUnique({
      where: { id: input.id },
      include: { category: true },
    });
    demand(sub, "Subproducto no encontrado.", 404);
    projectId = sub.category.projectId;
    name = sub.name;
  }
  const project = await projectAccess(user, projectId);
  const canEdit =
    user.role !== "OBSERVER" &&
    (user.role === "OWNER" ||
      project.ownerId === user.id ||
      project.members.some((m) => m.userId === user.id));
  return { ...input, name, projectId, projectName: project.name, canEdit };
}
export function collectionWhere(
  input: Scope,
  filters: z.infer<typeof filtersSchema>,
  now = new Date(),
): Prisma.VariationWhereInput {
  return {
    deletedAt: null,
    expired: false,
    AND: [
      { OR: [{ permanent: true }, { expiresAt: { gt: now } }] },
      ...(filters.q
        ? [
            {
              OR: [
                {
                  subproduct: {
                    name: { contains: filters.q, mode: "insensitive" as const },
                  },
                },
                {
                  subproduct: {
                    category: {
                      name: {
                        contains: filters.q,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
              ],
            },
          ]
        : []),
    ],
    ...(input.scope === "project"
      ? { job: { projectId: input.id } }
      : input.scope === "category"
        ? { subproduct: { categoryId: input.id } }
        : { subproductId: input.id }),
    ...(filters.review !== "ALL" ? { reviewStatus: filters.review } : {}),
    ...(filters.favorite ? { favorite: true } : {}),
    ...(filters.saved ? { permanent: true } : {}),
  };
}
export async function collectionGallery(user: User, params: URLSearchParams) {
  const input = scopeSchema.parse({
    scope: params.get("scope"),
    id: params.get("id"),
  });
  const filters = filtersSchema.parse({
    q: params.get("q") ?? "",
    review: params.get("review") ?? "ALL",
    favorite: params.get("favorite") === "true",
    saved: params.get("saved") === "true",
  });
  const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(params.get("page") ?? 1),
    limit = 24;
  const resource = await collectionContext(user, input),
    where = collectionWhere(input, filters);
  const [total, items] = await db.$transaction(
    [
      db.variation.count({ where }),
      db.variation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          model: true,
          favorite: true,
          permanent: true,
          reviewStatus: true,
          revision: true,
          createdAt: true,
          expiresAt: true,
          subproduct: {
            select: {
              id: true,
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    resource,
    filters,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    items,
  };
}
const exportSchema = z.union([
  z
    .object({
      ids: z.array(z.string().min(1).max(100)).min(1).max(200),
      format: z.enum(["png", "jpg"]).default("png"),
    })
    .strict(),
  scopeSchema
    .extend({
      format: z.enum(["png", "jpg"]).default("png"),
      filters: filtersSchema.default({
        q: "",
        review: "ALL",
        favorite: false,
        saved: false,
      }),
    })
    .strict(),
]);
export const safeFilename = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70) || "Sin_nombre";
export async function exportCollection(user: User, input: unknown) {
  const b = exportSchema.parse(input);
  const context = "scope" in b ? await collectionContext(user, b) : null;
  const rows = await db.variation.findMany({
    where:
      "ids" in b
        ? { id: { in: [...new Set(b.ids)] } }
        : collectionWhere(b, b.filters),
    take: 201,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      job: { select: { projectId: true } },
      subproduct: {
        select: {
          id: true,
          name: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });
  demand(rows.length, "No hay afiches disponibles para esta descarga.", 404);
  demand(
    rows.length <= 200,
    "La descarga incluye más de 200 afiches. Utiliza filtros o selecciona un grupo menor.",
    413,
  );
  if ("ids" in b)
    demand(rows.length === new Set(b.ids).size, "Una imagen no existe.", 404);
  const projects = new Map<string, string>();
  // Authorize the entire selection before reading any bytes or creating a ZIP.
  for (const row of rows) {
    if (row.job.projectId === "connection-test") {
      ownerOnly(user);
      projects.set("connection-test", "Prueba_IA");
    } else if (!projects.has(row.job.projectId))
      projects.set(
        row.job.projectId,
        (await projectAccess(user, row.job.projectId)).name,
      );
    demand(
      !row.deletedAt &&
        !row.expired &&
        (row.permanent || row.expiresAt > new Date()),
      "Una imagen temporal ya caducó.",
      410,
    );
  }
  const zip = new JSZip(),
    sequence = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    let bytes = await load(row.path);
    total += bytes.length;
    demand(
      total <= 100000000,
      "La descarga supera 100 MB. Selecciona menos imágenes.",
      413,
    );
    if (b.format === "jpg")
      bytes = await (await import("./render")).jpeg(bytes);
    // Converted outputs count too; never let JPEG conversion bypass the byte cap.
    if (b.format === "jpg") {
      total += bytes.length;
      demand(
        total <= 100000000,
        "La descarga supera 100 MB. Selecciona menos imágenes.",
        413,
      );
    }
    const project = `${safeFilename(projects.get(row.job.projectId)!)}_${safeFilename(row.job.projectId)}`;
    const category = `${safeFilename(row.subproduct?.category.name ?? "Pruebas")}_${safeFilename(row.subproduct?.category.id ?? "general")}`;
    const product = `${safeFilename(row.subproduct?.name ?? "Prueba")}_${safeFilename(row.subproduct?.id ?? "general")}`;
    const folder = `${project}/${category}/${product}`,
      number = (sequence.get(folder) ?? 0) + 1;
    sequence.set(folder, number);
    zip.file(
      `${folder}/${safeFilename(row.subproduct?.name ?? "Prueba")}_${String(number).padStart(2, "0")}_${safeFilename(row.id)}.${b.format}`,
      bytes,
    );
  }
  await db.auditEvent.create({
    data: {
      actorId: user.id,
      action: "DESCARGA_ZIP",
      resourceId: context?.id,
      detail: {
        count: rows.length,
        format: b.format,
        scope: context?.scope ?? "selection",
      },
    },
  });
  return new Response(
    fileStream(
      await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }),
    ),
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFilename(context?.name ?? "afiches")}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
