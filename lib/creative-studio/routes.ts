import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { demand, AppError } from "../errors";
import { db } from "../db";
import { resourceAccess } from "../auth";

import * as studio from "./service";
import * as campaigns from "./campaigns";
import { campaignPresets, saveCampaignPreset } from "./campaign-presets";
import { searchCampaignParents } from "./campaign-existing";
import { campaignAudienceOptions } from "./campaign-audience-selection";
import {
  savePlatformAudience,
  platformAudiencePresets,
} from "./campaign-audience-presets";
import type { Actor } from "./service";
const send = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
export async function creativeStudioRoutes(
  req: NextRequest,
  parts: string[],
  actor: Actor,
  body: () => Promise<unknown>,
) {
  studio.studioAccess(actor);
  const p = parts.slice(1),
    method = req.method;
  if (["campaign-configurations","ad-configurations"].includes(p[0]) && p[1] && p.length===2 && method==="POST")
    return send(await (await import("./campaign-configurations")).saveConfiguration(actor,p[1],await body(),p[0]==="campaign-configurations"?"campaign":"ad"));
  if (p[0] === "campaign-presets" && p[1] && p.length === 2) {
    if (method === "GET") return send(await campaignPresets(actor, p[1]));
    if (method === "POST")
      return send(await saveCampaignPreset(actor, p[1], await body()));
  }
  if (
    p[0] === "conversation-presets" &&
    p[1] &&
    p.length === 2 &&
    method === "POST"
  )
    return send(
      await saveCampaignPreset(actor, p[1], await body(), "conversation"),
    );
  if (
    p[0] === "campaign-directory" &&
    p[1] &&
    p.length === 2 &&
    method === "GET"
  )
    return send(
      await searchCampaignParents(
        actor,
        p[1],
        Object.fromEntries(req.nextUrl.searchParams),
      ),
    );
  if (p[0] === "audience-options" && p[1] && p.length === 2 && method === "GET")
    return send(
      await campaignAudienceOptions(
        actor,
        p[1],
        Object.fromEntries(req.nextUrl.searchParams),
      ),
    );
  if (p[0] === "audience-save" && p[1] && p.length === 2 && method === "POST")
    return send(await savePlatformAudience(actor, p[1], await body()));
  if (p[0] === "audience-presets" && p[1] && p.length === 2 && method === "GET")
    return send(
      await platformAudiencePresets(
        actor,
        p[1],
        Object.fromEntries(req.nextUrl.searchParams),
      ),
    );
  if (p[0] === "campaign-suggestion" && p.length === 1 && method === "POST")
    return send(
      await (
        await import("./campaign-suggestion")
      ).suggestCampaign(actor, await body()),
    );
  if (p[0] === "launch-history" && p[1] && p.length === 2 && method === "GET")
    return send(
      await campaigns.launchHistory(
        actor,
        z.string().min(1).max(100).parse(p[1]),
      ),
    );
  if (!p.length && method === "GET")
    return send(await studio.studioContext(actor));
  if (p[0] === "projects" && p.length === 1 && method === "POST")
    return send(await studio.createStudioProject(actor, await body()), 201);
  if (p[0] === "projects" && p[1]) {
    if (p.length === 2 && method === "GET")
      return send(await studio.studioProject(actor, p[1]));
    if (p.length === 2 && method === "PATCH")
      return send(await studio.saveStudioProject(actor, p[1], await body()));
    if (p[2] === "temporary-workspace" && p.length === 3 && method === "POST")
      return send(await (await import("./temporary-workspace")).prepareTemporaryWorkspace(actor, p[1], await body()), 201);
    if (p[2] === "products" && method === "POST")
      return send(
        await studio.createStudioProduct(actor, p[1], await body()),
        201,
      );
    if (p[2] === "web" && method === "POST")
      return send(await studio.addStudioWeb(actor, p[1], await body()));
  }
  if (p[0] === "products" && p[1]) {
    if (p.length === 2 && method === "GET") {
      const product = await studio.studioProduct(actor, p[1]);
      const launches = await db.$queryRaw<
        { id: string; subproductId: string; createdAt: Date }[]
      >`SELECT DISTINCT ON (entry->>'subproductId') l.id,entry->>'subproductId' AS "subproductId",l."createdAt" FROM "CreativeMetaLaunch" l CROSS JOIN LATERAL jsonb_array_elements(l.campaigns) entry WHERE l."categoryId"=${p[1]} AND (l."actorId"=${actor.id} OR ${actor.role}='OWNER') ORDER BY entry->>'subproductId',l."createdAt" DESC LIMIT 200`;
      return send({
        ...product,
        latestLaunchIds: Object.fromEntries(
          launches.map((l) => [l.subproductId, l.id]),
        ),
        latestLaunchId:
          launches.sort(
            (a, b) => b.createdAt.valueOf() - a.createdAt.valueOf(),
          )[0]?.id ?? null,
      });
    }
    if (p.length === 2 && method === "PATCH")
      return send(await studio.setProductCountry(actor, p[1], await body()));
    if (p[2] === "items" && method === "POST")
      return send(await studio.addStudioItems(actor, p[1], await body()));
    if (p[2] === "generate" && method === "POST")
      return send(await studio.studioGenerate(actor, p[1], await body()), 202);
  }
  if (p[0] === "images" && p[1] && p[2] === "selection" && method === "GET")
    return send(await studio.studioImageIds(actor, p[1]));
  if (p[0] === "images" && p[1] && method === "GET")
    return send(
      await studio.studioImages(
        actor,
        p[1],
        z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .parse(req.nextUrl.searchParams.get("page") ?? 1),
      ),
    );
  if (p[0] === "images" && p[1] === "save" && method === "POST")
    return send(await studio.saveStudioImages(actor, await body()));
  if (p[0] === "upload" && p[1] && method === "POST")
    return send(
      await (await import("./own-media")).uploadOwnMedia(actor, p[1], req),
      201,
    );
  if (
    p[0] === "page-lead-forms" &&
    p[1] &&
    p.length === 2 &&
    method === "GET"
  ) {
    const q = z
      .object({ pageId: z.string().regex(/^\d{1,40}$/) })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(await campaigns.campaignLeadForms(actor, p[1], q.pageId));
  }
  if (p[0] === "page-whatsapp" && p[1] && p.length === 2 && method === "GET") {
    const q = z
      .object({
        pageId: z.string().regex(/^\d{1,40}$/),
        refresh: z.enum(["0", "1"]).optional(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await campaigns.campaignPageWhatsApp(
        actor,
        p[1],
        q.pageId,
        q.refresh === "1",
      ),
    );
  }
  if (p[0] === "inventory" && p[1] && method === "GET")
    return send(await studio.studioInventory(actor, p[1]));
  if (p[0] === "selections") {
    if (p[1] && p[2] === "prepare" && p.length === 3 && method === "POST")
      return send(
        await studio.prepareInventorySelection(actor, p[1], await body()),
      );
    if (p[1] && p.length === 2 && method === "GET")
      return send(await studio.getInventorySelection(actor, p[1]));
    if (!p[1] && method === "POST")
      return send(
        await studio.saveInventorySelection(actor, await body()),
        201,
      );
  }
  if (p[0] === "account-resources" && p[1] && method === "GET")
    return send(
      await campaigns.launchResources(
        actor,
        p[1],
        z
          .enum(["pages", "audiences", "all"])
          .parse(req.nextUrl.searchParams.get("part") ?? "all"),
        req.nextUrl.searchParams.get("refresh") === "1",
      ),
    );
  if (p[0] === "launches") {
    if (p[1] && p[2] === "resume-wait" && p.length === 3 && method === "POST")
      return send(await campaigns.resumeLaunchWait(actor, p[1], await body()));
    if (!p[1] && method === "POST")
      return send(await campaigns.createLaunch(actor, await body()), 201);
    if (p[1] && p.length === 2 && method === "GET")
      return send(await campaigns.getLaunch(actor, p[1]));
    if (p[1] && p[2] === "publish" && method === "POST")
      return send(await campaigns.beginLaunch(actor, p[1], await body()));
    if (p[1] && p[2] === "tick" && method === "POST")
      return send(await campaigns.tickLaunch(actor, p[1]));
  }
  throw new AppError("Ruta del estudio no encontrada.", 404);
}
