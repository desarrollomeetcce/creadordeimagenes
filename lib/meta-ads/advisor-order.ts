import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { ownerOnly, financialContext } from "./financial-access";
import { effectivenessLock } from "./effectiveness";
import { orderedAdvisors } from "./advisor-order-policy";
import type { Actor } from "./service";
export function advisorOrderRevision(
  config: unknown,
  members: { id: string }[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        orderedAdvisors(members, config).map((member) => member.id),
      ),
    )
    .digest("hex");
}
const schema = z
  .object({
    advisorListId: z.string().min(1).max(100),
    advisorIds: z.array(z.string().min(1).max(100)).min(1).max(1000),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function saveAdvisorOrder(actor: Actor, input: unknown) {
  ownerOnly(actor);
  const q = schema.parse(input);
  demand(
    new Set(q.advisorIds).size === q.advisorIds.length,
    "No repitas asesores en el orden.",
  );
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    const cap = financialContext(actor);
    demand(
      !cap ||
        (cap.write &&
          (cap.scope === "ALL" || cap.scope === "TAB:" + q.advisorListId)),
      "No puedes editar el orden de esta hoja.",
      403,
    );
    const sheet = await tx.metaEffectivenessSheet.findFirst({
      where: { id: q.advisorListId, kind: "ADVISORS", archivedAt: null },
      select: { id: true, config: true },
    });
    demand(sheet, "Hoja de asesores no disponible.", 404);
    const members = await tx.metaAdvisor.findMany({
      where: { sheetId: sheet.id },
      select: { id: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const allowed = new Set(members.map((member) => member.id));
    demand(
      q.advisorIds.length === members.length &&
        q.advisorIds.every((id) => allowed.has(id)),
      "El listado de asesores cambió o incluye otra hoja. Actualiza la vista.",
      409,
    );
    demand(
      advisorOrderRevision(sheet.config, members) === q.expectedRevision,
      "El orden compartido cambió. Actualiza la vista antes de mover nuevamente.",
      409,
    );
    demand(
      sheet.config === null ||
        (typeof sheet.config === "object" && !Array.isArray(sheet.config)),
      "La configuración de la hoja no permite guardar el orden.",
      409,
    );
    const config =
      sheet.config &&
      typeof sheet.config === "object" &&
      !Array.isArray(sheet.config)
        ? sheet.config
        : {};
    const next = { ...config, advisorOrder: q.advisorIds };
    const revision = advisorOrderRevision(next, members);
    if (revision !== q.expectedRevision) {
      await tx.metaEffectivenessSheet.update({
        where: { id: sheet.id },
        data: { config: next as Prisma.InputJsonValue },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_ASESORES_ORDENADOS",
          resourceId: sheet.id,
          detail: { advisorIds: q.advisorIds },
        },
      });
    }
    return { advisorIds: q.advisorIds, revision };
  });
}
