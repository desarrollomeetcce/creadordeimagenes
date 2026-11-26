import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { localDay } from "@/lib/meta-ads/analytics";
import { performancePeriod } from "@/lib/performance-period";
import { linkedGeneratorUser } from "@/lib/pulpo-sso";
import { ownerProductSheet } from "@/lib/meta-ads/advisors";
import { advisorPeriodSignals } from "@/lib/meta-ads/advisor-period-signals";

const catalogId = z.string().regex(/^[\w:-]{1,200}$/);
const schema = z.object({
  viewer: z.uuid(),
  email: z.email().max(254),
  advisor: z.uuid().nullable(),
  from: z.string(),
  to: z.string(),
  exp: z.number().int(),
  links: z.array(z.tuple([catalogId, catalogId, z.string().regex(/^[A-Z]{2}$/)])).min(1).max(500),
});
const headers = { "Cache-Control": "no-store" };
const fail = (status: number) => new Response(null, { status, headers });

export async function POST(request: Request) {
  const key = process.env.PULPO_GENERATOR_SSO_KEY;
  const signature = request.headers.get("x-pulpo-signature") ?? "";
  if (!key || !/^[a-f\d]{64}$/i.test(key) || !/^[a-f\d]{64}$/i.test(signature)) return fail(403);
  const reader = request.body?.getReader();
  if (!reader) return fail(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 240000) {
      await reader.cancel();
      return fail(413);
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const expected = createHmac("sha256", Buffer.from(key, "hex"))
    .update("pulpo-folder-sales:v1:" + body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return fail(403);
  try {
    const grant = schema.parse(JSON.parse(body));
    const now = Math.floor(Date.now() / 1000);
    if (grant.exp <= now || grant.exp > now + 35 || !performancePeriod(grant.from, grant.to) || grant.to > localDay("America/Lima")) return fail(400);
    const legacy = linkedGeneratorUser(process.env.PULPO_GENERATOR_LINKS ?? "", {
      sub: grant.viewer, email: grant.email,
    });
    const viewer = await db.user.findFirst({
      where: {
        role: "OWNER", status: "APPROVED", archivedAt: null,
        email: { equals: grant.email, mode: "insensitive" },
        OR: [{ pulpoUserId: grant.viewer }, ...(legacy ? [{ id: legacy, pulpoUserId: null }] : [])],
      },
      select: { id: true, role: true },
    });
    if (!viewer) return fail(403);
    const portal = grant.advisor ? await db.metaAdvisorPortal.findFirst({
      where: { user: { pulpoUserId: grant.advisor, status: "APPROVED", archivedAt: null }, advisor: { sheet: { archivedAt: null } } },
      select: { advisorId: true },
    }) : null;
    if (grant.advisor && !portal) return fail(422);
    const wanted = new Set(grant.links.map((link) => JSON.stringify(link)));
    const rows = new Map<string, { key: string; sales: number | null; partial: boolean }>();
    const add = (catalogKey: [string, string] | null, country: string, sales: number | null, partial: boolean) => {
      if (!catalogKey) return;
      const key = JSON.stringify([...catalogKey, country]);
      if (wanted.has(key)) rows.set(key, { key, sales, partial });
    };
    if (portal) {
      const report = await advisorPeriodSignals(viewer, {
        advisorId: portal.advisorId, since: grant.from, until: grant.to, section: "products",
      });
      for (const item of report.items) add(item.catalogKey, item.country, item.sales, item.salesPartial);
    } else {
      const range = { since: grant.from, until: grant.to };
      const sheet = await ownerProductSheet(viewer, grant.from, grant.to, { base: range, evaluation: range });
      for (const row of sheet.breakdown) {
        const item = sheet.inventoryStatus[JSON.stringify([row.tableId, row.aliasId, row.country])];
        if (item) add(item.catalogKey, row.country, item.recordedSales, item.portfolioSalesPartial);
      }
    }
    return Response.json({ rows: [...rows.values()] }, { headers });
  } catch {
    return fail(503);
  }
}
