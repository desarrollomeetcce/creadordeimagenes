import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import type { Actor } from "./service";
async function review(tx: Prisma.TransactionClient, id: string) {
  const sheet = await tx.metaEffectivenessSheet.findUnique({ where: { id } });
  demand(sheet && !sheet.archivedAt, "Pestaña no disponible.", 404);
  const counts = {
    categories: await tx.metaInventoryCategory.count({
      where: { sheetId: id },
    }),
    inventory: await tx.metaAlias.count({ where: { inventorySheetId: id } }),
    advisors: await tx.metaAdvisor.count({ where: { sheetId: id } }),
    totals: await tx.metaEffectivenessTotalDay.count({
      where: { sheetId: id },
    }),
  };
  return {
    sheet: { id: sheet.id, name: sheet.name, kind: sheet.kind },
    counts,
    token: createHash("sha256")
      .update(JSON.stringify([sheet, counts]))
      .digest("hex"),
  };
}
export async function previewDeleteWorkbookSheet(actor: Actor, id: string) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    return review(tx, id);
  });
}
export async function deleteWorkbookSheet(
  actor: Actor,
  id: string,
  b: { token: string; confirmedName: string },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    const r = await review(tx, id);
    demand(
      r.token === b.token,
      "La pestaña cambió. Revisa de nuevo antes de eliminar.",
      409,
    );
    demand(
      r.sheet.name === b.confirmedName,
      "Escribe el nombre exacto de la pestaña.",
    );
    // Removing navigation must not erase people, approved credits or inventories used by other sheets.
    await tx.metaEffectivenessSheet.update({
      where: { id },
      data: { archivedAt: new Date(), revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_PESTANA_ELIMINADA",
        resourceId: id,
        detail: {
          name: r.sheet.name,
          kind: r.sheet.kind,
          counts: r.counts,
          recordsPreserved: true,
        },
      },
    });
    return { ok: true, id, recordsPreserved: true };
  });
}
