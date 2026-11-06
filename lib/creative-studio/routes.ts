import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { demand, AppError } from "../errors";
import { db } from "../db";
import { resourceAccess } from "../auth";
import { maxUploadBytes, store, remove } from "../storage";
import { validateUpload } from "../uploads";
import * as studio from "./service";
import * as campaigns from "./campaigns";
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
  if (!p.length && method === "GET")
    return send(await studio.studioContext(actor));
  if (p[0] === "projects" && p.length === 1 && method === "POST")
    return send(await studio.createStudioProject(actor, await body()), 201);
  if (p[0] === "projects" && p[1]) {
    if (p.length === 2 && method === "GET")
      return send(await studio.studioProject(actor, p[1]));
    if (p.length === 2 && method === "PATCH")
      return send(await studio.saveStudioProject(actor, p[1], await body()));
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
      const [product, launch] = await Promise.all([
        studio.studioProduct(actor, p[1]),
        db.creativeMetaLaunch.findFirst({
          where: {
            categoryId: p[1],
            ...(actor.role === "OWNER" ? {} : { actorId: actor.id }),
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        }),
      ]);
      return send({ ...product, latestLaunchId: launch?.id ?? null });
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
    return send(await uploadReady(actor, p[1], req), 201);
  if(p[0]==="page-whatsapp"&&p[1]&&p.length===2&&method==="GET"){
    const q=z.object({pageId:z.string().regex(/^\d{1,40}$/),refresh:z.enum(["0","1"]).optional()}).strict().parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(await campaigns.campaignPageWhatsApp(actor,p[1],q.pageId,q.refresh==="1"));
  }
  if (p[0] === "inventory" && p[1] && method === "GET")
    return send(await studio.studioInventory(actor, p[1]));
  if (p[0] === "selections") {
    if (p[1] && method === "GET")
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
async function uploadReady(actor: Actor, subId: string, req: NextRequest) {
  await resourceAccess(actor, "subproduct", subId, "EDIT");
  const max = maxUploadBytes() + 10000;
  demand(
    Number(req.headers.get("content-length") ?? 0) <= max,
    "El archivo es demasiado grande.",
    413,
  );
  const reader = req.body?.getReader();
  demand(reader, "Selecciona una imagen.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > max) {
        await reader.cancel();
        throw new AppError("El archivo es demasiado grande.", 413);
      }
      chunks.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
    headers: { "Content-Type": req.headers.get("content-type") ?? "" },
  }).formData();
  const file = form.get("file");
  demand(file instanceof File, "Selecciona una imagen.");
  const requestId = z.uuid().parse(form.get("requestId"));
  const jobId = "studio-upload-" + requestId;
  const prior = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { variation: true },
  });
  if (prior) {
    demand(
      prior.actorId === actor.id && prior.subproductId === subId,
      "La subida ya existe.",
      409,
    );
    return { id: prior.variation?.id };
  }
  const checked = await validateUpload(file);
  demand(checked.mime.startsWith("image/"), "Sube un afiche PNG, JPEG o WebP.");
  const { prepareAuditThumbnail, captureAuditThumbnail, requireAuditSpace } =
    await import("../visual-audit");
  await requireAuditSpace();
  const thumbnail = await prepareAuditThumbnail(checked.bytes);
  const path = await store(checked.bytes);
  try {
    const sub = await db.subproduct.findUniqueOrThrow({
      where: { id: subId },
      include: { category: { select: { projectId: true } } },
    });
    const result = await db.$transaction(async (tx) => {
      await tx.generationJob.create({
        data: {
          id: jobId,
          actorId: actor.id,
          projectId: sub.category.projectId,
          subproductId: subId,
          idempotencyKey: jobId,
          status: "COMPLETED",
          snapshot: {
            source: "manual-upload",
            engine: "manual",
            fileName: file.name.slice(0, 200),
          },
          reservedMicros: 0,
          completedAt: new Date(),
        },
      });
      const v = await tx.variation.create({
        data: {
          jobId,
          subproductId: subId,
          path,
          model: "Afiche subido · sin IA",
          reviewStatus: "APPROVED",
          expiresAt: new Date(Date.now() + 48 * 3600000),
        },
      });
      const version = await tx.imageVersion.create({
        data: {
          variationId: v.id,
          number: 1,
          path,
          actorId: actor.id,
          sourceJobId: jobId,
        },
      });
      await captureAuditThumbnail(tx, version.id, thumbnail);
      return { id: v.id };
    });
    return result;
  } catch (e) {
    if (!(await db.imageVersion.count({ where: { path } })))
      await remove(path).catch(() => {});
    throw e;
  }
}
