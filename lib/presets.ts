import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { ownerOnly, projectAccess, resourceAccess } from "./auth";
import { demand } from "./errors";
import { presetAccess } from "./preset-access";
import { withAttachmentCopies } from "./attachment-copies";
import { remove } from "./storage";
import { effectiveSettings, validateDistribution } from "./inheritance";

const schema = z.object({
  name: z.string().trim().min(1).max(150),
  prompt: z.string().max(30000),
  settings: z.record(z.string(), z.unknown()),
  visibility: z.enum(["PERSONAL", "SHARED", "OFFICIAL"]).default("PERSONAL"),
});
const send = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export async function presetRoutes(
  req: NextRequest,
  parts: string[],
  user: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  const method = req.method;
  if (method === "GET" && parts.length === 1) {
    const items = await db.savedPreset.findMany({
      where: {
        OR: [
          { userId: user.id },
          { visibility: { in: ["SHARED", "OFFICIAL"] } },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });
    const counts = await db.attachment.groupBy({
      by: ["resourceId"],
      where: { scope: "preset", resourceId: { in: items.map((i) => i.id) } },
      _count: true,
    });
    const countsById = new Map(counts.map((c) => [c.resourceId, c._count]));
    return send(
      items.map((i) => ({
        ...i,
        attachmentCount: countsById.get(i.id) ?? 0,
        canEdit:
          (i.userId === user.id || user.role === "OWNER") &&
          (i.visibility !== "OFFICIAL" || user.role === "OWNER"),
      })),
    );
  }
  if (method === "POST" && parts.length === 1) {
    const b = schema
      .extend({
        sourceCategoryId: z.string().optional(),
        includeAttachments: z.boolean().default(false),
      })
      .parse(await body());
    if (b.visibility === "OFFICIAL") ownerOnly(user);
    demand(
      !b.includeAttachments || !!b.sourceCategoryId,
      "Selecciona la categoría de origen.",
    );
    if (b.sourceCategoryId)
      await resourceAccess(user, "category", b.sourceCategoryId, "EDIT");
    const result = await withAttachmentCopies(
      b.includeAttachments
        ? { scope: "category", resourceId: b.sourceCategoryId! }
        : null,
      async (tx, copies) => {
        if (b.sourceCategoryId) {
          await resourceAccess(user, "category", b.sourceCategoryId, "EDIT");
          await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${b.sourceCategoryId} FOR UPDATE`;
          demand(
            await tx.category.findUnique({ where: { id: b.sourceCategoryId } }),
            "Categoría no encontrada.",
            404,
          );
        }
        const preset = await tx.savedPreset.create({
          data: {
            name: b.name,
            prompt: b.prompt,
            settings: JSON.parse(JSON.stringify(b.settings)),
            visibility: b.visibility,
            userId: user.id,
          },
        });
        if (copies.length)
          await tx.attachment.createMany({
            data: copies.map((c) => ({
              ...c,
              scope: "preset",
              resourceId: preset.id,
            })),
          });
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            action: "CONFIGURACION_GUARDADA",
            resourceId: preset.id,
          },
        });
        return preset;
      },
    );
    return send(result, 201);
  }
  if (!parts[1]) return null;
  const preset = await presetAccess(user, parts[1]);
  async function currentPreset(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT id FROM "SavedPreset" WHERE id=${preset.id} FOR UPDATE`;
    const current = await tx.savedPreset.findUnique({
      where: { id: preset.id },
    });
    demand(
      current &&
        (current.userId === user.id ||
          user.role === "OWNER" ||
          current.visibility !== "PERSONAL"),
      "Configuración no encontrada.",
      404,
    );
    demand(
      current.updatedAt.getTime() === preset.updatedAt.getTime(),
      "La configuración cambió. Actualiza la página y vuelve a intentarlo.",
      409,
    );
    return current;
  }
  if (parts[2] === "duplicate" && method === "POST" && parts.length === 3) {
    const result = await withAttachmentCopies(
      { scope: "preset", resourceId: preset.id },
      async (tx, copies) => {
        await currentPreset(tx);
        const item = await tx.savedPreset.create({
          data: {
            name: preset.name.slice(0, 140) + " · copia",
            prompt: preset.prompt,
            settings: preset.settings!,
            visibility: "PERSONAL",
            userId: user.id,
          },
        });
        if (copies.length)
          await tx.attachment.createMany({
            data: copies.map((c) => ({
              ...c,
              scope: "preset",
              resourceId: item.id,
            })),
          });
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            action: "CONFIGURACION_DUPLICADA",
            resourceId: item.id,
          },
        });
        return item;
      },
    );
    return send(result, 201);
  }
  if (parts[2] === "apply" && method === "POST" && parts.length === 3) {
    const b = z
      .object({
        categoryId: z.string(),
        includeAttachments: z.boolean().default(true),
      })
      .parse(await body());
    const category = await db.category.findUnique({
      where: { id: b.categoryId },
    });
    demand(category, "Categoría no encontrada.", 404);
    await projectAccess(user, category.projectId, "EDIT");
    validateDistribution(effectiveSettings(preset.settings, {}));
    const count = await withAttachmentCopies(
      b.includeAttachments ? { scope: "preset", resourceId: preset.id } : null,
      async (tx, copies) => {
        await currentPreset(tx);
        await projectAccess(user, category.projectId, "EDIT");
        await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${category.id} FOR UPDATE`;
        await tx.category.update({
          where: { id: category.id },
          data: { prompt: preset.prompt, settings: preset.settings! },
        });
        if (copies.length)
          await tx.attachment.createMany({
            data: copies.map((c) => ({
              ...c,
              scope: "category",
              resourceId: category.id,
            })),
          });
        await tx.promptVersion.create({
          data: {
            scope: "category",
            resourceId: category.id,
            prompt: preset.prompt,
            actorId: user.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            action: "CONFIGURACION_APLICADA",
            resourceId: category.id,
            detail: { presetId: preset.id, attachmentsCopied: copies.length },
          },
        });
        return copies.length;
      },
    );
    return send({ ok: true, attachmentsCopied: count });
  }
  demand(parts.length === 2, "Operación no encontrada.", 404);
  await presetAccess(user, preset.id, true);
  if (method === "DELETE") {
    const files = await db.$transaction(async (tx) => {
      await currentPreset(tx);
      const files = await tx.attachment.findMany({
        where: { scope: "preset", resourceId: preset.id },
      });
      await tx.attachment.deleteMany({
        where: { scope: "preset", resourceId: preset.id },
      });
      await tx.savedPreset.delete({ where: { id: preset.id } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "CONFIGURACION_ELIMINADA",
          resourceId: preset.id,
        },
      });
      return files;
    });
    await Promise.all(files.map((f) => remove(f.path)));
    return send({ ok: true });
  }
  if (method === "PATCH") {
    const b = schema.parse(await body());
    if (b.visibility === "OFFICIAL") ownerOnly(user);
    await db.$transaction(async (tx) => {
      await currentPreset(tx);
      await tx.savedPreset.update({
        where: { id: preset.id },
        data: { ...b, settings: JSON.parse(JSON.stringify(b.settings)) },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "CONFIGURACION_ACTUALIZADA",
          resourceId: preset.id,
        },
      });
    });
    return send({ ok: true });
  }
  return null;
}
