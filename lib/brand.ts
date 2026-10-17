import { recordActivity } from "./activity";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { projectAccess } from "./auth";

export const brandSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    name: z.string().trim().max(200),
    prompt: z.string().max(12000),
    colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(8),
    font: z
      .enum(["DejaVu Sans", "DejaVu Serif", "DejaVu Sans Mono"])
      .nullable(),
    logoAttachmentIds: z.array(z.string().min(1).max(100)).max(6),
  })
  .strict();

export async function readBrand(projectId: string) {
  const kit = await db.brandKit.findUnique({
    where: { projectId },
    include: { logos: { select: { attachmentId: true } } },
  });
  return kit
    ? {
        projectId,
        name: kit.name,
        prompt: kit.prompt,
        colors: kit.colors as string[],
        font: kit.font,
        revision: kit.revision,
        updatedAt: kit.updatedAt.toISOString(),
        logoAttachmentIds: kit.logos.map((l) => l.attachmentId),
      }
    : null;
}

export async function saveBrand(
  user: { id: string; role: string },
  projectId: string,
  input: unknown,
) {
  await projectAccess(user, projectId, "EDIT");
  const b = brandSchema.parse(input);
  await db.$transaction(async (tx) => {
    // Serialize initial creation and subsequent updates, including concurrent editors.
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
    const previous = await tx.brandKit.findUnique({ where: { projectId } });
    demand(
      (previous?.revision ?? 0) === b.expectedRevision,
      "La identidad de marca cambió. Recarga antes de guardar.",
      409,
    );
    const ids = [...new Set(b.logoAttachmentIds)];
    const logos = await tx.attachment.findMany({
      where: {
        id: { in: ids },
        scope: "project",
        resourceId: projectId,
        archivedAt: null,
      },
    });
    demand(
      logos.length === ids.length &&
        logos.every(
          (l) => l.mime.startsWith("image/") && /logo/i.test(l.purpose),
        ),
      "Selecciona únicamente logos cargados en este proyecto.",
    );
    const values = {
      name: b.name,
      prompt: b.prompt,
      colors: [...new Set(b.colors.map((c) => c.toLowerCase()))],
      font: b.font,
    };
    await tx.brandKit.upsert({
      where: { projectId },
      create: { projectId, ...values },
      update: { ...values, revision: { increment: 1 } },
    });
    await tx.brandLogo.deleteMany({ where: { projectId } });
    if (ids.length)
      await tx.brandLogo.createMany({
        data: ids.map((attachmentId) => ({ projectId, attachmentId })),
      });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: "IDENTIDAD_MARCA_ACTUALIZADA",
        resourceId: projectId,
      },
    });
  });
  return readBrand(projectId);
}

export function brandInstructions(kit: Awaited<ReturnType<typeof readBrand>>) {
  if (!kit) return "";
  return [
    kit.name ? `Identidad de marca: ${kit.name}.` : "",
    kit.colors.length
      ? `Paleta de marca preferida: ${kit.colors.join(", ")}.`
      : "Paleta libre: elige colores armónicos adecuados para esta marca y el tema del subproducto; no hay colores obligatorios de marca.",
    kit.font ? `Tipografía de marca preferida: ${kit.font}.` : "",
    kit.prompt,
  ]
    .filter(Boolean)
    .join("\n");
}
