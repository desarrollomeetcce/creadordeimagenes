import { recordActivity } from "./activity";
import { z } from "zod";
import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "./db";
import { demand } from "./errors";
import { ownerOnly, rateLimit } from "./auth";
import { fileStream, storageBackend, storageByteLimit } from "./storage";

type Actor = { id: string; role: string };
const defaults = {
  id: "global",
  enabled: true,
  retentionDays: 30,
  limitMb: 32,
  revision: 0,
};
export type PreparedThumbnail = {
  bytes: Buffer;
  width: number;
  height: number;
};
export async function prepareAuditThumbnail(
  bytes: Buffer,
): Promise<PreparedThumbnail> {
  const sharp = (await import("sharp")).default;
  let output = await sharp(bytes, { limitInputPixels: 40000000 })
    .rotate()
    .resize({
      width: 384,
      height: 384,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 55 })
    .toBuffer();
  if (output.length > 65536)
    output = await sharp(output)
      .resize({ width: 256, height: 256, fit: "inside" })
      .webp({ quality: 35 })
      .toBuffer();
  demand(
    output.length <= 65536,
    "No se pudo comprimir la miniatura de auditoría.",
  );
  const info = await sharp(output).metadata();
  return { bytes: output, width: info.width!, height: info.height! };
}
export async function visualAuditNotice() {
  const p =
    (await db.visualAuditPolicy.findUnique({ where: { id: "global" } })) ??
    defaults;
  return { enabled: p.enabled, retentionDays: p.retentionDays };
}
export async function captureAuditThumbnail(
  tx: Prisma.TransactionClient,
  versionId: string,
  prepared: PreparedThumbnail,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(885302)`;
  const policy =
    (await tx.visualAuditPolicy.findUnique({ where: { id: "global" } })) ??
    defaults;
  if (!policy.enabled) return;
  const version = await tx.imageVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { variation: { include: { job: true } } },
  });
  // Transaction queries share one connection and must run in sequence.
  const account = await tx.user.findUnique({
    where: { id: version.actorId },
    select: { name: true },
  });
  const project = await tx.project.findUnique({
    where: { id: version.variation.job.projectId },
    select: { name: true },
  });
  const sub = version.variation.subproductId
    ? await tx.subproduct.findUnique({
        where: { id: version.variation.subproductId },
        include: { category: true },
      })
    : null;
  const ledger = version.sourceJobId
    ? await tx.usageLedger.findUnique({
        where: { jobId: version.sourceJobId },
        select: { model: true },
      })
    : null;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(440819)`;
  const auditBytes =
    (await tx.auditThumbnail.aggregate({ _sum: { size: true } }))._sum.size ??
    0;
  const originalBytes =
    storageBackend() === "postgres"
      ? ((await tx.storedAsset.aggregate({ _sum: { size: true } }))._sum.size ??
        0)
      : 0;
  const fits =
    auditBytes + prepared.bytes.length <= policy.limitMb * 1048576 &&
    (storageBackend() !== "postgres" ||
      originalBytes + auditBytes + prepared.bytes.length <= storageByteLimit());
  await tx.auditThumbnail.create({
    data: {
      versionId,
      variationId: version.variationId,
      versionNumber: version.number,
      actorId: version.actorId,
      actorName: account?.name ?? "Cuenta no disponible",
      projectId: version.variation.job.projectId,
      projectName: project?.name ?? "Prueba de conexión",
      productName: sub?.category.name ?? "",
      subproductName: sub?.name ?? "",
      model: ledger?.model ?? version.variation.model,
      width: prepared.width,
      height: prepared.height,
      size: fits ? prepared.bytes.length : 0,
      data: fits ? new Uint8Array(prepared.bytes) : null,
      status: fits ? "AVAILABLE" : "NO_SPACE",
      createdAt: version.createdAt,
      expiresAt: new Date(
        version.createdAt.getTime() + policy.retentionDays * 86400000,
      ),
    },
  });
  if (!fits)
    await recordActivity(tx, {
      data: {
        actorId: version.actorId,
        action: "MINIATURA_AUDITORIA_SIN_ESPACIO",
        resourceId: version.variationId,
      },
    });
}
export async function cleanupAuditThumbnails(now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(885302)`;
    const ids = await tx.auditThumbnail.findMany({
      where: { status: "AVAILABLE", expiresAt: { lte: now } },
      select: { id: true },
      take: 200,
    });
    if (!ids.length) return 0;
    const changed = await tx.auditThumbnail.updateMany({
      where: {
        id: { in: ids.map((r) => r.id) },
        status: "AVAILABLE",
        expiresAt: { lte: now },
      },
      data: { data: null, size: 0, status: "EXPIRED", removedAt: now },
    });
    return changed.count;
  });
}
export async function requireAuditSpace() {
  await cleanupAuditThumbnails();
  const policy =
    (await db.visualAuditPolicy.findUnique({ where: { id: "global" } })) ??
    defaults;
  if (!policy.enabled) return;
  const bytes =
    (await db.auditThumbnail.aggregate({ _sum: { size: true } }))._sum.size ??
    0;
  demand(
    bytes + 65536 <= policy.limitMb * 1048576,
    "No hay espacio para nuevas miniaturas de auditoría. El OWNER debe limpiar las caducadas o ampliar su límite antes de generar.",
    413,
  );
}
export async function auditPolicy(actor: Actor) {
  ownerOnly(actor);
  const p =
    (await db.visualAuditPolicy.findUnique({ where: { id: "global" } })) ??
    defaults;
  const [bytes, available, missing, expired] = await Promise.all([
    db.auditThumbnail.aggregate({ _sum: { size: true } }),
    db.auditThumbnail.count({
      where: { status: "AVAILABLE", expiresAt: { gt: new Date() } },
    }),
    db.auditThumbnail.count({ where: { status: "NO_SPACE" } }),
    db.auditThumbnail.count({
      where: { status: "AVAILABLE", expiresAt: { lte: new Date() } },
    }),
  ]);
  return {
    ...p,
    usedBytes: bytes._sum.size ?? 0,
    available,
    missing,
    pendingCleanup: expired,
  };
}
async function passwordProof(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = z
    .object({ currentPassword: z.string().min(12).max(128) })
    .strict()
    .parse(input);
  await rateLimit(`visual-audit:${actor.id}`, 20);
  const account = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  demand(
    account.role === "OWNER" &&
      account.status === "APPROVED" &&
      (await argon2.verify(account.passwordHash, b.currentPassword)),
    "Tu contraseña actual no es correcta o la cuenta cambió.",
    403,
  );
  return account.passwordHash;
}
export async function saveAuditPolicy(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const b = z
    .object({
      currentPassword: z.string().min(12).max(128),
      enabled: z.boolean(),
      retentionDays: z.number().int().min(1).max(3650),
      limitMb: z.number().int().min(1).max(256),
      expectedRevision: z.number().int().min(0),
      applyToExisting: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  const passwordHash = await passwordProof(actor, {
    currentPassword: b.currentPassword,
  });
  const adjusted = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { role: string; status: string; passwordHash: string }[]
    >`SELECT role,status,"passwordHash" FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    demand(
      rows[0]?.role === "OWNER" &&
        rows[0].status === "APPROVED" &&
        rows[0].passwordHash === passwordHash,
      "La cuenta cambió. Inicia sesión nuevamente.",
      409,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(885302)`;
    const previous =
      (await tx.visualAuditPolicy.findUnique({ where: { id: "global" } })) ??
      defaults;
    demand(
      previous.revision === b.expectedRevision,
      "La política cambió. Recarga antes de guardar.",
      409,
    );
    const used =
      (await tx.auditThumbnail.aggregate({ _sum: { size: true } }))._sum.size ??
      0;
    demand(
      used <= b.limitMb * 1048576,
      "El límite nuevo es menor que el espacio ocupado. Limpia primero las caducadas.",
      409,
    );
    const values = {
      enabled: b.enabled,
      retentionDays: b.retentionDays,
      limitMb: b.limitMb,
      revision: previous.revision + 1,
    };
    await tx.visualAuditPolicy.upsert({
      where: { id: "global" },
      create: values,
      update: values,
    });
    let adjusted = 0;
    if (b.applyToExisting)
      adjusted =
        await tx.$executeRaw`UPDATE "AuditThumbnail" SET "expiresAt"="createdAt" + ${b.retentionDays} * INTERVAL '1 day' WHERE status='AVAILABLE' AND "expiresAt">CURRENT_TIMESTAMP`;
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "POLITICA_AUDITORIA_VISUAL_GUARDADA",
        detail: { ...values, applyToExisting: b.applyToExisting, adjusted },
      },
    });
    return adjusted;
  });
  return {
    ok: true,
    adjusted,
    message:
      "Política guardada. Las miniaturas ya caducadas o eliminadas no se recuperan.",
  };
}
const safeSelect = {
  id: true,
  variationId: true,
  versionNumber: true,
  actorName: true,
  actorId: true,
  projectName: true,
  projectId: true,
  productName: true,
  subproductName: true,
  model: true,
  width: true,
  height: true,
  size: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  removedAt: true,
} as const;
export async function listAuditThumbnails(
  actor: Actor,
  params: URLSearchParams,
) {
  ownerOnly(actor);
  const q = z
      .string()
      .max(200)
      .parse(params.get("q") ?? "")
      .trim(),
    page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(params.get("page") ?? 1);
  const where: Prisma.AuditThumbnailWhereInput = q
    ? {
        OR: [
          "actorName",
          "projectName",
          "productName",
          "subproductName",
          "model",
        ].map((field) => ({ [field]: { contains: q, mode: "insensitive" } })),
      }
    : {};
  const [rows, total] = await db.$transaction([
    db.auditThumbnail.findMany({
      where,
      select: safeSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.auditThumbnail.count({ where }),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      available: row.status === "AVAILABLE" && row.expiresAt > new Date(),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / 20)),
  };
}
export async function auditThumbnailImage(actor: Actor, id: string) {
  ownerOnly(actor);
  const record = await db.auditThumbnail.findUnique({ where: { id } });
  demand(record, "Miniatura no encontrada.", 404);
  demand(
    record.status === "AVAILABLE" &&
      record.expiresAt > new Date() &&
      record.data,
    "Esta miniatura caducó, fue eliminada o no pudo conservarse.",
    410,
  );
  return new NextResponse(fileStream(Buffer.from(record.data!)), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function removeAuditThumbnail(
  actor: Actor,
  id: string,
  input: unknown,
) {
  const passwordHash = await passwordProof(actor, input);
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { role: string; status: string; passwordHash: string }[]
    >`SELECT role,status,"passwordHash" FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    demand(
      rows[0]?.role === "OWNER" &&
        rows[0].status === "APPROVED" &&
        rows[0].passwordHash === passwordHash,
      "La cuenta cambió. Inicia sesión nuevamente.",
      409,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(885302)`;
    const changed = await tx.auditThumbnail.updateMany({
      where: { id, status: "AVAILABLE" },
      data: { data: null, size: 0, status: "REMOVED", removedAt: new Date() },
    });
    demand(changed.count === 1, "La miniatura ya no está disponible.", 409);
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "MINIATURA_AUDITORIA_ELIMINADA",
        resourceId: id,
      },
    });
  });
  return { ok: true };
}
