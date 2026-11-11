import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { ownerOnly } from "./auth";
import {
  campaignAuditRows,
  type CampaignAuditLaunch,
} from "./campaign-audit-summary";
/** Only durable successful receipts; no Graph calls and no additional campaign copies. */
export async function campaignAudit(
  actor: { id: string; role: string },
  params: URLSearchParams,
) {
  ownerOnly(actor);
  demand(
    await db.user.findFirst({
      where: { id: actor.id, role: "OWNER", status: "APPROVED", archivedAt: null },
      select: { id: true },
    }),
    "La cuenta ya no tiene acceso a auditoría.",
    403,
  );
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(params.get("page") ?? 1);
  const size = 25;
  const launches = await db.$queryRaw<CampaignAuditLaunch[]>`
    SELECT l.id,l."accountId",l."createdAt",l."updatedAt",
      jsonb_build_object('country',l.config->'country','campaignName',l.config->'campaignName','code',l.config->'code','variables',l.config->'variables','existingCampaign',jsonb_build_object('name',l.config->'existingCampaign'->'name')) AS config,
      (SELECT jsonb_agg(jsonb_build_object('name',i->'name')) FROM jsonb_array_elements(l.campaigns) i) AS items,
      (SELECT jsonb_agg(jsonb_build_object('kind',s->'kind','state',s->'state','campaign',s->'campaign','existing',s->'existing','id',s->'receipt'->'id')) FROM jsonb_array_elements(l.steps) s WHERE s->>'kind' IN ('CAMPAIGN','ADSET','AD')) AS steps
    FROM "CreativeMetaLaunch" l WHERE l.status='PUBLISHED'
    ORDER BY l."updatedAt" DESC,l.id DESC LIMIT ${size + 1} OFFSET ${(page - 1) * size}`;
  return {
    items: launches.slice(0, size).flatMap(campaignAuditRows),
    page,
    hasNext: launches.length > size,
  };
}
