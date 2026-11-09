import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { resourceAccess, fullProjectFilter } from "../auth";
import { demand } from "../errors";
import { studioAccess, object, json, type Actor } from "./service";
import {
  campaignConfigurationSchema,
  adConfigurationSchema,
  campaignConfigurationSettingsSchema,
  adConfigurationSettingsSchema,
} from "./campaign-configuration-settings";

export async function saveConfiguration(
  actor: Actor,
  categoryId: string,
  input: unknown,
  kind: "campaign" | "ad",
) {
  studioAccess(actor);
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const settingsSchema =
    kind === "campaign"
      ? campaignConfigurationSettingsSchema
      : adConfigurationSettingsSchema;
  const entrySchema =
    kind === "campaign" ? campaignConfigurationSchema : adConfigurationSchema;
  const b = z
    .object({
      id: z.uuid().optional(),
      expectedRevision: z.number().int().nonnegative().default(0),
      name: z.string().trim().min(1).max(80),
      settings: settingsSchema,
    })
    .strict()
    .parse(input);
  const category = await db.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { projectId: true },
  });
  await resourceAccess(actor, "project", category.projectId, "EDIT");
  const key =
    kind === "campaign" ? "campaignConfigurations" : "adConfigurations";
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${category.projectId} FOR UPDATE`;
    demand(
      await tx.user.findFirst({
        where: {
          id: actor.id,
          role: actor.role as any,
          status: "APPROVED",
          archivedAt: null,
        },
      }),
      "Tu acceso cambió.",
      403,
    );
    const project = await tx.project.findFirst({
      where: {
        id: category.projectId,
        ...fullProjectFilter(actor),
        deletedAt: null,
      },
      select: { studio: true },
    });
    demand(project, "Tu acceso al proyecto cambió.", 403);
    const studio = object(project.studio),
      rows: any[] = Array.isArray(studio[key]) ? studio[key] : [],
      id = b.id ?? randomUUID(),
      old = rows.find((r) => r.id === id);
    const value = { id, name: b.name, settings: b.settings };
    if (old) {
      if (
        JSON.stringify(entrySchema.parse(old)) ===
        JSON.stringify(entrySchema.parse({ ...value, revision: old.revision }))
      )
        return entrySchema.parse(old);
      demand(
        old.revision === b.expectedRevision,
        "La configuración cambió; vuelve a buscarla antes de guardar.",
        409,
      );
    } else
      demand(
        b.expectedRevision === 0 && rows.length < 50,
        "Puedes guardar hasta 50 configuraciones de cada tipo por proyecto.",
        409,
      );
    const saved = entrySchema.parse({
      ...value,
      revision: (old?.revision ?? 0) + 1,
    });
    await tx.project.update({
      where: { id: category.projectId },
      data: {
        studio: json({
          ...studio,
          [key]: [...rows.filter((r) => r.id !== id), saved],
        }),
      },
    });
    return saved;
  });
}
