import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const key = process.env.PULPO_GENERATOR_SSO_KEY;
  const grant = /^Bearer (\d{10})\.([A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") || "",
  );
  if (!id || !/^\d{1,40}$/.test(id) || !key || !/^[a-f\d]{64}$/i.test(key) || !grant)
    return new Response(null, { status: 403, headers });
  const now = Math.floor(Date.now() / 1000);
  if (Number(grant[1]) <= now || Number(grant[1]) > now + 20)
    return new Response(null, { status: 403, headers });
  const signature = createHmac("sha256", Buffer.from(key, "hex"))
    .update(`pulpo-ad-hierarchy:v1:${id}:${grant[1]}`)
    .digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(grant[2])))
    return new Response(null, { status: 403, headers });

  const ad = await db.metaAdObject.findUnique({
    where: { id, level: "ad" },
    select: { campaignId: true, adsetId: true },
  });
  if (!ad) return new Response(null, { status: 404, headers });
  return Response.json({ id, campaign_id: ad.campaignId, adset_id: ad.adsetId }, { headers });
}
