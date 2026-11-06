import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { resourceAccess } from "../auth";
import { demand } from "../errors";
import { studioAccess, object, json, type Actor } from "./service";
import {
  campaignPresetSettingsSchema,
  conversationSchema,
} from "./campaign-workbench-policy";

const presetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  revision: z.number().int().positive(),
  settings: campaignPresetSettingsSchema,
});
const savedConversationSchema = conversationSchema.extend({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
});
export async function campaignPresets(actor: Actor, categoryId: string) {
  studioAccess(actor);
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const category = await db.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { projectId: true },
  });
  const project = await db.project.findUniqueOrThrow({
    where: { id: category.projectId },
    select: { studio: true },
  });
  const studio = object(project.studio);
  return {
    presets: Array.isArray(studio.campaignPresets)
      ? studio.campaignPresets.flatMap((v: any) => {
          const p = presetSchema.safeParse(v);
          return p.success ? [p.data] : [];
        })
      : [],
    conversations: Array.isArray(studio.conversationTemplates)
      ? studio.conversationTemplates.flatMap((v: any) => {
          const p = savedConversationSchema.safeParse(v);
          return p.success ? [p.data] : [];
        })
      : [],
  };
}
export async function saveCampaignPreset(
  actor: Actor,
  categoryId: string,
  input: unknown,
  kind: "campaign" | "conversation" = "campaign",
) {
  studioAccess(actor);
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const b = z
    .object({
      id: z.string().uuid().optional(),
      expectedRevision: z.number().int().nonnegative().default(0),
      name: z.string().trim().min(1).max(80),
      settings:
        kind === "campaign"
          ? campaignPresetSettingsSchema
          : conversationSchema.omit({ name: true }),
    })
    .strict()
    .parse(input);
  const category = await db.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { projectId: true },
  });
  // The shared configuration is edited only with full project access.
  await resourceAccess(actor, "project", category.projectId, "EDIT");
  const key = kind === "campaign" ? "campaignPresets" : "conversationTemplates",
    schema = kind === "campaign" ? presetSchema : savedConversationSchema;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${category.projectId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: { status: true, role: true },
    });
    demand(
      user?.status === "APPROVED" && user.role === actor.role,
      "Tu acceso cambió.",
      403,
    );
    const project = await tx.project.findUniqueOrThrow({
        where: { id: category.projectId },
        select: { studio: true },
      }),
      studio = object(project.studio);
    const rows: any[] = Array.isArray(studio[key]) ? studio[key] : [],
      id = b.id ?? randomUUID(),
      old = rows.find((v) => v.id === id);
    const value =
      kind === "campaign"
        ? { id, name: b.name, settings: b.settings }
        : { id, name: b.name, ...b.settings };
    if (old) {
      if (
        JSON.stringify(schema.parse(old)) ===
        JSON.stringify(schema.parse({ ...value, revision: old.revision }))
      )
        return schema.parse(old);
      demand(
        old.revision === b.expectedRevision,
        "La configuración cambió; vuelve a cargarla antes de guardar.",
        409,
      );
    } else
      demand(
        b.expectedRevision === 0 && rows.length < 50,
        "Puedes guardar hasta 50 configuraciones por proyecto.",
        409,
      );
    const saved = schema.parse({
      ...value,
      revision: (old?.revision ?? 0) + 1,
    });
    await tx.project.update({
      where: { id: category.projectId },
      data: {
        studio: json({
          ...studio,
          [key]: [...rows.filter((v) => v.id !== id), saved],
        }),
      },
    });
    return saved;
  });
}
