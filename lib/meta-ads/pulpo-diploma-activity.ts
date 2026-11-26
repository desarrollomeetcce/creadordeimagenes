import { createHmac } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { linkedMessagingUser } from "../pulpo-sso";

const activity = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    country: z.string().regex(/^(?:[A-Z]{2})?$/),
    folders: z.array(z.string()),
    contacts: z.number().int().positive(),
    organic: z.number().int().nonnegative().optional(),
    paid: z.number().int().nonnegative().optional(),
    links: z.array(z.tuple([z.string(), z.string()])),
  })).max(500),
  truncated: z.boolean(),
  totals: z.array(z.object({ country: z.string(), contacts: z.number().int().nonnegative(), organic: z.number().int().nonnegative().optional(), paid: z.number().int().nonnegative().optional() })).optional(),
});

export async function pulpoDiplomaActivity(actorId: string, advisorId: string, from: string, to: string) {
  const key = process.env.PULPO_GENERATOR_SSO_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key)) return null;
  try {
    const select = { id: true, email: true, pulpoUserId: true } as const;
    const [viewer, portal] = await Promise.all([
      db.user.findFirst({ where: { id: actorId, status: "APPROVED", archivedAt: null }, select }),
      advisorId === "all" ? null : db.metaAdvisorPortal.findUnique({ where: { advisorId }, select: { user: { select } } }),
    ]);
    if (!viewer || (advisorId !== "all" && !portal?.user)) return null;
    const caller = linkedMessagingUser(viewer);
    const advisor = portal?.user ? linkedMessagingUser(portal.user) : null;
    if (!caller || (advisorId !== "all" && !advisor)) return null;
    const payload = Buffer.from(JSON.stringify({
      viewer: caller, advisor, from, to, exp: Math.floor(Date.now() / 1000) + 30,
    })).toString("base64url");
    const signature = createHmac("sha256", Buffer.from(key, "hex"))
      .update("pulpo-diploma-activity:v1:" + payload).digest("base64url");
    const response = await fetch("https://pulpo.agenciamagneto.org/api/integrations/generator-diploma-activity", {
      headers: { Authorization: "Pulpo " + payload + "." + signature },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return null;
    return activity.parse(await response.json());
  } catch {
    return null;
  }
}
