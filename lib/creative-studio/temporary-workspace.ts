import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { fullProjectFilter, resourceAccess } from "../auth";
import { isCountryCode } from "../meta-ads/countries";
import { defaults } from "../inheritance";
import { object, studioAccess, studioProduct, type Actor } from "./service";

// Campaigns need stable resource IDs for authorization, receipts and retries.
// These preparation records are not folders and never appear in folder catalogs.
export async function prepareTemporaryWorkspace(
  actor: Actor,
  projectId: string,
  input: unknown,
) {
  studioAccess(actor);
  await resourceAccess(actor, "project", projectId, "EDIT");
  const b = z
    .object({
      requestId: z.uuid(),
      country: z
        .string()
        .refine(isCountryCode, "Selecciona el país de destino."),
    })
    .strict()
    .parse(input);
  const id = "studio-temporary-" + b.requestId;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
    demand(
      await tx.project.findFirst({
        where: { id: projectId, ...fullProjectFilter(actor), deletedAt: null },
      }),
      "El acceso al proyecto cambió.",
      403,
    );
    demand(
      await tx.user.findFirst({
        where: {
          id: actor.id,
          role: actor.role as any,
          status: "APPROVED",
          archivedAt: null,
        },
      }),
      "La cuenta cambió.",
      403,
    );
    const existing = await tx.category.findUnique({ where: { id } });
    if (existing) {
      demand(
        existing.campaignTemporary &&
          existing.projectId === projectId &&
          existing.createdById === actor.id &&
          !existing.deletedAt &&
          object(existing.studio).country === b.country,
        "La solicitud ya se usó en otro espacio.",
        409,
      );
      return;
    }
    await tx.category.create({
      data: {
        id,
        projectId,
        createdById: actor.id,
        campaignTemporary: true,
        name: "Campaña temporal",
        prompt: "",
        applyPromptToAll: false,
        settings: defaults,
        studio: { version: 1, country: b.country },
      },
    });
  });
  return studioProduct(actor, id);
}
