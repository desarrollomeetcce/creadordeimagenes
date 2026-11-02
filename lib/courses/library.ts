import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { courseOwner } from "./service";
import {
  foldCourseSearch,
  defaultCategories,
  categoryColors,
  type LibraryCategory,
} from "./library-shared";
import type { CourseGroupId } from "./teaching";
const storedSchema = z.object({
  order: z.array(z.string()).max(100),
  custom: z
    .array(
      z.object({
        id: z.string().regex(/^custom:[a-f0-9-]{36}$/),
        name: z.string().trim().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .max(60),
});
export function libraryCategories(raw: unknown): LibraryCategory[] {
  const s = storedSchema.parse(raw ?? { order: [], custom: [] });
  const all: LibraryCategory[] = [
    ...defaultCategories,
    ...s.custom.map((g) => ({
      id: g.id as CourseGroupId,
      title: g.name,
      create: "Crear curso en " + g.name,
      description: "Tu categoría personalizada.",
      icon: "✧",
      color: g.color,
      audience: "other" as const,
    })),
  ];
  const byId = new Map(all.map((g) => [g.id, g]));
  return [...new Set([...s.order, ...all.map((g) => g.id)])].flatMap((id) => {
    const g = byId.get(id as CourseGroupId);
    return g ? [g] : [];
  });
}
async function config(client: Pick<typeof db, "aICourseLibrary"> = db) {
  const row = await client.aICourseLibrary.findUnique({
    where: { id: "global" },
  });
  return {
    revision: row?.revision ?? 0,
    groups: libraryCategories(row?.state),
    state: row?.state ?? { order: [], custom: [] },
  };
}
export async function assertLibraryCategory(
  tx: Prisma.TransactionClient,
  id?: string,
) {
  if (!id || defaultCategories.some((g) => g.id === id)) return;
  demand(
    (await config(tx)).groups.some((g) => g.id === id),
    "La categoría ya no existe. Actualiza la biblioteca.",
    409,
  );
}
export async function changeLibrary(
  u: { id: string; role: string },
  input: unknown,
) {
  await courseOwner(u);
  const b = z
    .discriminatedUnion("action", [
      z
        .object({
          action: z.literal("create"),
          revision: z.number().int().nonnegative(),
          name: z.string().trim().min(1).max(80),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        })
        .strict(),
      z
        .object({
          action: z.literal("reorder"),
          revision: z.number().int().nonnegative(),
          ids: z.array(z.string()).min(4).max(100),
        })
        .strict(),
    ])
    .parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR SHARE`;
    const fresh = await tx.user.findUnique({ where: { id: u.id } });
    demand(
      fresh?.role === "OWNER" &&
        fresh.status === "APPROVED" &&
        !fresh.archivedAt &&
        fresh.aiAccessEnabled,
      "El permiso cambió.",
      403,
    );
    const c = await config(tx);
    demand(
      c.revision === b.revision,
      "Las categorías cambiaron. Actualiza y vuelve a intentar.",
      409,
    );
    const state = storedSchema.parse(c.state);
    let createdId: CourseGroupId | undefined;
    if (b.action === "create") {
      demand(
        state.custom.length < 60,
        "La biblioteca admite hasta 60 categorías personalizadas.",
      );
      demand(
        !c.groups.some(
          (g) =>
            g.title.normalize("NFKC").toLocaleLowerCase("es") ===
            b.name.normalize("NFKC").toLocaleLowerCase("es"),
        ),
        "Ya existe una categoría con ese nombre.",
        409,
      );
      createdId = ("custom:" + randomUUID()) as CourseGroupId;
      state.custom.push({
        id: createdId,
        name: b.name,
        color:
          b.color ?? categoryColors[c.groups.length % categoryColors.length],
      });
      state.order = [...c.groups.map((g) => g.id), createdId];
    } else {
      demand(
        b.ids.length === c.groups.length &&
          new Set(b.ids).size === c.groups.length &&
          b.ids.every((id) => c.groups.some((g) => g.id === id)),
        "El orden debe incluir cada categoría una sola vez.",
      );
      state.order = b.ids;
    }
    const saved = await tx.aICourseLibrary.upsert({
      where: { id: "global" },
      create: { id: "global", revision: 1, state },
      update: { state, revision: { increment: 1 } },
    });
    return {
      revision: saved.revision,
      groups: libraryCategories(saved.state),
      createdId,
    };
  });
}
const groupSQL = Prisma.sql`COALESCE(c.settings->>'libraryGroup',CASE WHEN c.settings->>'audience' IN ('children','adolescents') THEN 'children' WHEN c.settings->>'audience'='families' THEN 'families' WHEN c.settings->>'audience'='other' THEN 'other' ELSE 'adults' END)`;
const summarySQL = Prisma.sql`c.id,c.title,c.description,c.kind,jsonb_build_object('libraryGroup',${groupSQL},'audience',COALESCE(c.settings->>'audience','professionals'),'audienceDetail',COALESCE(c.settings->>'audienceDetail','')) AS settings,jsonb_build_object('modules',(SELECT count(*)::int FROM "AICourseModule" m WHERE m."courseId"=c.id)) AS "_count"`;
export async function readLibrary(
  u: { id: string; role: string },
  params: URLSearchParams,
) {
  await courseOwner(u);
  if (params.has("courseId")) {
    const id = z.string().min(1).max(100).parse(params.get("courseId"));
    const rows = await db.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT ${summarySQL} FROM "AICourse" c WHERE c.id=${id} AND c."archivedAt" IS NULL`,
    );
    return { course: rows[0] ?? null };
  }
  const c = await config();
  if (!params.has("group")) {
    const counts = await db.$queryRaw<Array<{ id: string; total: number }>>(
      Prisma.sql`SELECT ${groupSQL} AS id,count(*)::int AS total FROM "AICourse" c WHERE c."archivedAt" IS NULL GROUP BY 1`,
    );
    return {
      revision: c.revision,
      groups: c.groups,
      counts: Object.fromEntries(counts.map((r) => [r.id, r.total])),
    };
  }
  const id = z.string().max(100).parse(params.get("group"));
  demand(
    c.groups.some((g) => g.id === id),
    "Categoría no encontrada.",
    404,
  );
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(params.get("page") ?? 1);
  const pageSize = z.coerce
    .number()
    .refine((n) => [25, 50, 65, 100].includes(n), "Tamaño de página inválido.")
    .parse(params.get("size") ?? 50);
  const query = z
    .string()
    .trim()
    .max(120)
    .parse(params.get("q") ?? "");
  const folded = foldCourseSearch(query).replace(/[\\%_]/g, "\\$&");
  const search = Prisma.sql`AND translate(lower(c.title),'áàâäãåéèêëíìîïóòôöõúùûüñç','aaaaaaeeeeiiiiooooouuuunc') LIKE ${"%" + folded + "%"}`;
  return db.$transaction(
    async (tx) => {
      const totals = await tx.$queryRaw<Array<{ total: number }>>(
        Prisma.sql`SELECT count(*)::int AS total FROM "AICourse" c WHERE c."archivedAt" IS NULL AND ${groupSQL}=${id} ${search}`,
      );
      const total = totals[0].total,
        last = Math.max(1, Math.ceil(total / pageSize)),
        actualPage = Math.min(page, last);
      const courses = await tx.$queryRaw(
        Prisma.sql`SELECT ${summarySQL} FROM "AICourse" c WHERE c."archivedAt" IS NULL AND ${groupSQL}=${id} ${search} ORDER BY c."updatedAt" DESC,c.id DESC LIMIT ${pageSize} OFFSET ${(actualPage - 1) * pageSize}`,
      );
      return { groupId: id, page: actualPage, pageSize, query, total, courses };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
