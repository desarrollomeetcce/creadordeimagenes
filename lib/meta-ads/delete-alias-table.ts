import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import type { Actor } from "./service";
async function deletionReview(tx: Prisma.TransactionClient, tableId: string) {
  const table = await tx.metaAliasTable.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      name: true,
      aliasColumnName: true,
      defaultCountry: true,
      defaultCurrency: true,
    },
  });
  demand(table, "Tabla no disponible.", 404);
  const stats = await tx.$queryRaw<
    { kind: string; count: number; hash: string }[]
  >`WITH a AS (SELECT id,name FROM "MetaAlias" WHERE "tableId"=${tableId}),r AS (SELECT x.* FROM "MetaEffectivenessRow" x JOIN a ON a.id=x."aliasId"),s AS (SELECT x.* FROM "MetaEffectivenessState" x JOIN a ON a.id=x."aliasId"),items(kind,k,v) AS (
 SELECT 'aliases',id,name FROM a
 UNION ALL SELECT 'advisorHistory',x.id,to_jsonb(x)::text FROM "MetaAdvisorAssignment" x JOIN a ON a.id=x."aliasId"
 UNION ALL SELECT 'rows',id,jsonb_build_array(revision,country,currency,"displayCurrency","advisorId",hidden,legacy,"presentationRowId")::text FROM r
 UNION ALL SELECT 'days',d."rowId"||'/'||d.day,d.revision::text FROM "MetaEffectivenessDay" d JOIN r ON r.id=d."rowId"
 UNION ALL SELECT 'states',id,jsonb_build_array(country,active,revision)::text FROM s
 UNION ALL SELECT 'events',e.id,jsonb_build_array(e.active,e."createdAt")::text FROM "MetaEffectivenessEvent" e JOIN s ON s.id=e."stateId"
 UNION ALL SELECT 'assignments',o.id,jsonb_build_array(o."aliasId",o."aliasCountry",o."advisorId")::text FROM "MetaAdObject" o JOIN a ON a.id=o."aliasId"
 UNION ALL SELECT 'totals',jsonb_build_array(t.country,t.currency,t.day)::text,t.revision::text FROM "MetaEffectivenessTotalDay" t WHERE t."tableId"=${tableId}
 UNION ALL SELECT 'colors',c."tableId",jsonb_build_array(c.revision,c.rules)::text FROM "MetaEffectivenessColors" c WHERE c."tableId"=${tableId}
 UNION ALL SELECT 'links',l."tableId",jsonb_build_array(l."sourceTableId",l.revision,l.columns)::text FROM "MetaEffectivenessSync" l WHERE l."tableId"=${tableId} OR l."sourceTableId"=${tableId}
 ) SELECT kind,COUNT(*)::int AS count,md5(COALESCE(string_agg(md5(k||'|'||v),'' ORDER BY k),'')) AS hash FROM items GROUP BY kind ORDER BY kind`;
  const colors = await tx.metaEffectivenessColors.findUnique({
    where: { tableId },
    select: { rules: true },
  });
  const counts = Object.fromEntries(
    [
      "aliases",
      "rows",
      "days",
      "states",
      "events",
      "advisorHistory",
      "assignments",
      "totals",
      "links",
    ].map((kind) => [kind, stats.find((s) => s.kind === kind)?.count ?? 0]),
  );
  counts.colorRules = Array.isArray(colors?.rules) ? colors.rules.length : 0;
  const token = createHash("sha256")
    .update(JSON.stringify([table, stats]))
    .digest("hex");
  return { table, counts, token };
}
export async function previewDeleteAliasTable(actor: Actor, tableId: string) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      return deletionReview(tx, tableId);
    },
    { timeout: 60000 },
  );
}
export async function deleteAliasTable(
  actor: Actor,
  tableId: string,
  b: { token: string; confirmedName: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const review = await deletionReview(tx, tableId);
      demand(
        b.token === review.token,
        "La tabla cambió desde la revisión. Revisa de nuevo antes de eliminar.",
        409,
      );
      demand(
        b.confirmedName === review.table.name,
        "Escribe el nombre exacto de la tabla para confirmar.",
      );
      await tx.metaAdObject.updateMany({
        where: { alias: { tableId } },
        data: { aliasId: null, aliasCountry: null, advisorId: null },
      });
      await tx.metaEffectivenessSync.deleteMany({
        where: { OR: [{ tableId }, { sourceTableId: tableId }] },
      });
      await tx.metaEffectivenessTotalDay.deleteMany({ where: { tableId } });
      await tx.metaEffectivenessRow.deleteMany({
        where: { alias: { tableId } },
      });
      await tx.metaAlias.deleteMany({ where: { tableId } });
      await tx.metaAliasTable.delete({ where: { id: tableId } });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_TABLA_ELIMINADA",
          resourceId: tableId,
          detail: { name: review.table.name, counts: review.counts },
        },
      });
      return {
        ok: true,
        tableId,
        name: review.table.name,
        counts: review.counts,
      };
    },
    { timeout: 60000 },
  );
}
