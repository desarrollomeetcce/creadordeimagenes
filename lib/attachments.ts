import { recordActivity } from "./activity";
import { NextResponse } from "next/server";
import { db } from "./db";
import { resourceAccess, rateLimit } from "./auth";
import { demand } from "./errors";
import { load, store, remove, fileStream, maxUploadBytes } from "./storage";
import { validateUpload } from "./uploads";
import { z } from "zod";
type Actor = { id: string; role: string };
const purposeSchema = z.string().trim().min(1).max(100);
export async function saveAttachment(
  actor: Actor,
  args: {
    scope: string;
    resourceId: string;
    file: File;
    purpose: unknown;
    replacesId?: string;
  },
) {
  const { scope, resourceId, file, replacesId } = args;
  demand(
    ["project", "category", "subproduct", "variation"].includes(scope),
    "Ámbito de adjunto no válido.",
  );
  await resourceAccess(actor, scope, resourceId, "EDIT");
  demand(
    file instanceof File && file.size > 0 && file.size <= maxUploadBytes(),
    `Selecciona un archivo de hasta ${maxUploadBytes() / 1000000} MB.`,
  );
  const purpose = purposeSchema.parse(args.purpose);
  const checked = await validateUpload(file);
  const path = await store(checked.bytes);
  try {
    await resourceAccess(actor, scope, resourceId, "EDIT");
    const item = await db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { role: string; status: string }[]
        >`SELECT role,status FROM "User" WHERE id=${actor.id} FOR UPDATE`;
        demand(
          rows[0]?.status === "APPROVED" && rows[0].role === actor.role,
          "La cuenta cambió. Inicia sesión nuevamente.",
          409,
        );
        // Brand updates use this project lock. A selected brand logo must be removed first.
        if (scope === "project")
          await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${resourceId} FOR UPDATE`;
        if (replacesId) {
          const previous = await tx.attachment.findUnique({
            where: { id: replacesId },
          });
          demand(
            previous &&
              previous.scope === scope &&
              previous.resourceId === resourceId,
            "No se encontró el adjunto de este espacio.",
            404,
          );
          demand(
            !previous.archivedAt,
            "Este adjunto ya fue reemplazado. Recarga la lista.",
            409,
          );
          demand(
            !(await tx.brandLogo.findFirst({
              where: { attachmentId: replacesId },
            })),
            "Retira este logo de Identidad de marca antes de reemplazarlo. Los afiches existentes conservarán su archivo.",
            409,
          );
          const changed = await tx.attachment.updateMany({
            where: { id: replacesId, archivedAt: null },
            data: { archivedAt: new Date() },
          });
          demand(
            changed.count === 1,
            "Este adjunto ya fue reemplazado. Recarga la lista.",
            409,
          );
        }
        const created = await tx.attachment.create({
          data: {
            scope,
            resourceId,
            name: file.name.slice(0, 200),
            mime: checked.mime,
            purpose,
            path,
            text: checked.text,
            size: checked.bytes.length,
            replacesId: replacesId ?? null,
          },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: replacesId ? "ADJUNTO_REEMPLAZADO" : "ADJUNTO_CARGADO",
            resourceId: created.id,
            ...(replacesId ? { detail: { replacesId } } : {}),
          },
        });
        return created;
      },
      { timeout: 15000 },
    );
    return { id: item.id, name: item.name, replacesId: item.replacesId };
  } catch (error) {
    await remove(path).catch(() => {});
    throw error;
  }
}
export async function attachmentThumbnail(actor: Actor, id: string) {
  const a = await db.attachment.findUnique({ where: { id } });
  demand(a, "Archivo no encontrado.", 404);
  await resourceAccess(actor, a.scope, a.resourceId);
  demand(
    ["image/png", "image/jpeg", "image/webp"].includes(a.mime),
    "Este documento no tiene miniatura de imagen.",
    415,
  );
  await rateLimit(`attachment-thumbnail:${actor.id}`, 600);
  const sharp = (await import("sharp")).default;
  const bytes = await sharp(await load(a.path), { limitInputPixels: 20000000 })
    .rotate()
    .resize({
      width: 320,
      height: 240,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toBuffer();
  return new NextResponse(fileStream(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function deleteAttachment(actor: Actor, id: string) {
  const a = await db.attachment.findUnique({ where: { id } });
  demand(a, "Adjunto no encontrado.", 404);
  await resourceAccess(actor, a.scope, a.resourceId, "EDIT");
  demand(
    a.scope !== "preset",
    "Actualiza los adjuntos guardando otra configuración desde el producto.",
    409,
  );
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { role: string; status: string }[]
    >`SELECT role,status FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    demand(
      rows[0]?.status === "APPROVED" && rows[0].role === actor.role,
      "La cuenta cambió. Inicia sesión nuevamente.",
      409,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    if (a.scope === "project")
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${a.resourceId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Attachment" WHERE id=${id} FOR UPDATE`;
    demand(
      !(await tx.brandLogo.findFirst({ where: { attachmentId: id } })),
      "Este logo forma parte de la identidad de marca. Retíralo de la identidad antes de eliminarlo.",
      409,
    );
    const used = await tx.imageVersion.findFirst({
      where: {
        document: {
          path: ["layers"],
          array_contains: [{ type: "logo", attachmentId: id }],
        },
        variation: { expired: false },
      },
    });
    demand(
      !used,
      "Este logo está en uso por un afiche o sus versiones. Conserva el recurso mientras exista ese historial.",
      409,
    );
    const job = await tx.generationJob.findFirst({
      where: {
        status: { in: ["PENDING", "RUNNING"] },
        snapshot: { path: ["attachmentIds"], array_contains: [id] },
      },
    });
    demand(
      !job,
      "Este archivo está en un trabajo pendiente o en curso. Puedes reemplazarlo conservando el anterior, o esperar antes de eliminarlo.",
      409,
    );
    const changed = await tx.attachment.deleteMany({ where: { id } });
    demand(changed.count === 1, "El adjunto ya cambió. Recarga la lista.", 409);
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "ADJUNTO_ELIMINADO",
        resourceId: id,
        detail: { contextScope: a.scope, contextResourceId: a.resourceId },
      },
    });
  });
  // Never remove bytes before a successful metadata transaction (brand/version failures preserve them).
  await remove(a.path).catch(() => {});
  return { ok: true };
}
