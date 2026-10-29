import { db } from "../db";
import {ownerOnly} from "./financial-access";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import type { Actor } from "./service";
import { colorRulesSchema, type SheetColorRule } from "./sheet-colors";
export async function effectivenessColors(actor: Actor, tableId: string) {
  ownerOnly(actor);
  demand(
    await db.metaAliasTable.findUnique({ where: { id: tableId } }),
    "Tabla no disponible.",
    404,
  );
  const r = await db.metaEffectivenessColors.findUnique({ where: { tableId } });
  return {
    tableId,
    revision: r?.revision ?? 0,
    rules: colorRulesSchema.parse(r?.rules ?? []),
  };
}
export async function saveEffectivenessColors(
  actor: Actor,
  b:
    | { tableId: string; revision: number; rules: SheetColorRule[] }
    | {
        tableId: string;
        revision: number;
        sourceTableId: string;
        sourceRevision: number;
      },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaAliasTable.findUnique({ where: { id: b.tableId } }),
      "Tabla no disponible.",
      404,
    );
    const old = await tx.metaEffectivenessColors.findUnique({
      where: { tableId: b.tableId },
    });
    demand(
      (old?.revision ?? 0) === b.revision,
      "Los colores cambiaron. Recarga antes de guardar.",
      409,
    );
    let rules: SheetColorRule[];
    if ("sourceTableId" in b) {
      demand(b.sourceTableId !== b.tableId, "Elige otra tabla de origen.");
      demand(
        await tx.metaAliasTable.findUnique({ where: { id: b.sourceTableId } }),
        "Tabla de origen no disponible.",
        404,
      );
      const source = await tx.metaEffectivenessColors.findUnique({
        where: { tableId: b.sourceTableId },
      });
      demand(
        source && source.revision === b.sourceRevision,
        "Los colores de origen cambiaron. Revisa antes de sincronizar.",
        409,
      );
      rules = colorRulesSchema.parse(source.rules);
    } else rules = colorRulesSchema.parse(b.rules);
    const row = await tx.metaEffectivenessColors.upsert({
      where: { tableId: b.tableId },
      create: { tableId: b.tableId, rules, revision: 1 },
      update: { rules, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_EFECTIVIDAD_COLORES",
        resourceId: b.tableId,
        detail: {
          rules: rules.length,
          sourceTableId: "sourceTableId" in b ? b.sourceTableId : null,
        },
      },
    });
    return { tableId: row.tableId, revision: row.revision, rules };
  });
}
