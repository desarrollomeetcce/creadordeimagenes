import { assertNoBuild } from "./builds";
import { publicReferenceURL } from "./reference-web";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { rateLimit } from "../auth";
import { courseOwner } from "./service";
import type { Prisma } from "@prisma/client";
export const referenceInput = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    kind: z.enum(["TEXT", "WEB", "FILE"]).optional(),
    text: z.string().trim().min(30).max(1_000_000),
    url: z
      .url()
      .max(2000)
      .transform((value) => publicReferenceURL(value).href)
      .optional(),
  })
  .strict();
export function splitReferenceText(text: string) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 3800)
    chunks.push(text.slice(i, i + 4000));
  return chunks;
}
export async function referenceAccess(
  u: { id: string; role: string },
  courseId: string,
) {
  await courseOwner(u);
  demand(
    await db.aICourse.findFirst({
      where: { id: courseId, archivedAt: null },
      select: { id: true },
    }),
    "Curso no encontrado.",
    404,
  );
}
async function writable(
  tx: Prisma.TransactionClient,
  u: { id: string; role: string },
  courseId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR SHARE`;
  await assertNoBuild(tx, courseId);
  const user = await tx.user.findUnique({ where: { id: u.id } });
  demand(
    user?.role === "OWNER" &&
      user.status === "APPROVED" &&
      !user.archivedAt &&
      user.aiAccessEnabled,
    "El permiso cambió.",
    403,
  );
  demand(
    await tx.aICourse.findFirst({
      where: { id: courseId, archivedAt: null },
      select: { id: true },
    }),
    "Curso no encontrado.",
    404,
  );
  demand(
    !(await tx.aICourseTask.count({
      where: { courseId, status: { in: ["PENDING", "RUNNING", "RENDERING"] } },
    })),
    "Espera a que termine la generación para cambiar referencias.",
    409,
  );
}
export async function listReferences(
  u: { id: string; role: string },
  courseId: string,
) {
  await referenceAccess(u, courseId);
  return db.aICourseReference.findMany({
    where: { courseId },
    select: {
      id: true,
      name: true,
      kind: true,
      revision: true,
      url: true,
      characters: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
export async function addReference(
  u: { id: string; role: string },
  courseId: string,
  input: unknown,
) {
  await referenceAccess(u, courseId);
  const b = referenceInput.parse(input),
    digest = createHash("sha256").update(b.text).digest("hex");
  return db.$transaction(
    async (tx) => {
      await writable(tx, u, courseId);
      const existing = await tx.aICourseReference.findUnique({
        where: { courseId_digest: { courseId, digest } },
        select: { id: true },
      });
      if (existing) return { id: existing.id, duplicate: true };
      const total = await tx.aICourseReference.aggregate({
        where: { courseId },
        _sum: { characters: true },
      });
      demand(
        (total._sum.characters ?? 0) + b.text.length <= 10_000_000,
        "El banco de texto del curso llegó a 10 millones de caracteres. Retira referencias que ya no necesites.",
        413,
      );
      const ref = await tx.aICourseReference.create({
        data: {
          courseId,
          name: b.name ?? (b.url ? new URL(b.url).hostname : "Texto pegado"),
          kind: b.url ? "WEB" : (b.kind ?? "TEXT"),
          url: b.url,
          digest,
          characters: b.text.length,
          chunks: {
            create: splitReferenceText(b.text).map((text, position) => ({
              text,
              position,
            })),
          },
        },
        select: { id: true },
      });
      await tx.aICourse.update({
        where: { id: courseId },
        data: { revision: { increment: 1 } },
      });
      return { ...ref, duplicate: false };
    },
    { timeout: 15000 },
  );
}
export async function removeReference(
  u: { id: string; role: string },
  courseId: string,
  id: string,
) {
  await referenceAccess(u, courseId);
  await db.$transaction(async (tx) => {
    await writable(tx, u, courseId);
    const r = await tx.aICourseReference.deleteMany({
      where: { id, courseId },
    });
    demand(r.count === 1, "Referencia no encontrada.", 404);
    await tx.aICourse.update({
      where: { id: courseId },
      data: { revision: { increment: 1 } },
    });
  });
  return { ok: true };
}
export async function referenceContext(
  tx: Prisma.TransactionClient,
  courseId: string,
  query: string,
) {
  const terms = [
    ...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []),
  ]
    .slice(0, 60)
    .join(" | ");
  type Row = { id: string; name: string; url: string | null; text: string };
  const rows = terms
    ? await tx.$queryRaw<
        Row[]
      >`SELECT r.id,r.name,r.url,c.text FROM "AICourseReferenceChunk" c JOIN "AICourseReference" r ON r.id=c."referenceId" WHERE r."courseId"=${courseId} AND to_tsvector('simple',c.text) @@ to_tsquery('simple',${terms}) ORDER BY ts_rank(to_tsvector('simple',c.text),to_tsquery('simple',${terms})) DESC,c.id LIMIT 8`
    : [];
  const selected = rows.length
    ? rows
    : await tx.$queryRaw<
        Row[]
      >`SELECT r.id,r.name,r.url,c.text FROM "AICourseReferenceChunk" c JOIN "AICourseReference" r ON r.id=c."referenceId" WHERE r."courseId"=${courseId} AND c.position=0 ORDER BY r."createdAt" DESC LIMIT 8`;
  return selected.map((r) => ({
    sourceId: r.id,
    name: r.name,
    url: r.url,
    excerpt: r.text,
  }));
}
export async function importWebReference(
  u: { id: string; role: string },
  courseId: string,
  input: unknown,
) {
  await referenceAccess(u, courseId);
  await rateLimit("courses:reference-web:" + u.id, 180);
  const b = z
    .object({
      name: z.string().trim().min(1).max(200).optional(),
      url: z.url().max(2000),
    })
    .strict()
    .parse(input);
  const { readWebReference } = await import("./reference-web");
  const r = await readWebReference(b.url);
  return addReference(u, courseId, { name: b.name, ...r });
}

export async function referenceDetail(
  u: { id: string; role: string },
  courseId: string,
  id: string,
) {
  await referenceAccess(u, courseId);
  const ref = await db.aICourseReference.findFirst({
    where: { id, courseId },
    include: {
      chunks: {
        orderBy: { position: "asc" },
        select: { text: true, position: true },
      },
    },
  });
  demand(ref, "Referencia no encontrada.", 404);
  const { chunks, ...meta } = ref;
  return {
    ...meta,
    text: chunks
      .map((c, i) => (i < chunks.length - 1 ? c.text.slice(0, 3800) : c.text))
      .join(""),
  };
}
export async function editReference(
  u: { id: string; role: string },
  courseId: string,
  id: string,
  input: unknown,
) {
  await referenceAccess(u, courseId);
  const b = z
    .object({
      revision: z.number().int(),
      text: z.string().trim().min(30).max(1_000_000).optional(),
      url: z.string().max(2000).optional(),
    })
    .strict()
    .parse(input);
  const old = await db.aICourseReference.findFirst({ where: { id, courseId } });
  demand(old, "Referencia no encontrada.", 404);
  demand(
    old.kind !== "FILE",
    "Los documentos subidos se reemplazan adjuntándolos de nuevo.",
    409,
  );
  let text = b.text,
    url = old.url;
  if (old.kind === "WEB") {
    demand(b.url, "Indica el enlace.");
    const { readWebReference } = await import("./reference-web");
    const fresh = await readWebReference(b.url);
    text = fresh.text;
    url = fresh.url;
  } else demand(text, "Pega el texto.");
  const digest = createHash("sha256").update(text!).digest("hex");
  return db.$transaction(
    async (tx) => {
      await writable(tx, u, courseId);
      const current = await tx.aICourseReference.findFirst({
        where: { id, courseId },
      });
      demand(
        current?.revision === b.revision,
        "La referencia cambió. Vuelve a abrirla.",
        409,
      );
      const duplicate = await tx.aICourseReference.findUnique({
        where: { courseId_digest: { courseId, digest } },
        select: { id: true },
      });
      demand(
        !duplicate || duplicate.id === id,
        "Esta información ya está guardada en otra referencia.",
        409,
      );
      const total = await tx.aICourseReference.aggregate({
        where: { courseId },
        _sum: { characters: true },
      });
      demand(
        (total._sum.characters ?? 0) - current.characters + text!.length <=
          10_000_000,
        "El banco de texto alcanzó su capacidad.",
        413,
      );
      await tx.aICourseReferenceChunk.deleteMany({
        where: { referenceId: id },
      });
      await tx.aICourseReference.update({
        where: { id },
        data: {
          url,
          ...(old.kind === "WEB" && url ? { name: new URL(url).hostname } : {}),
          digest,
          characters: text!.length,
          revision: { increment: 1 },
          chunks: {
            create: splitReferenceText(text!).map((text, position) => ({
              text,
              position,
            })),
          },
        },
      });
      await tx.aICourse.update({
        where: { id: courseId },
        data: { revision: { increment: 1 } },
      });
      return { ok: true };
    },
    { timeout: 15000 },
  );
}
