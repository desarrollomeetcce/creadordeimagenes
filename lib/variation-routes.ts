import {deletedSourceNotice} from "./source-status";
import { recordActivity } from "./activity";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { accessibleVariation, saveManual, restoreVersion } from "./versions";
import { demand } from "./errors";
import { designSchema } from "./design";
import { load, store, remove, fileStream } from "./storage";
import { configured, reserveJobs } from "./ai";
import { resolveInstructions } from "./inheritance";
import { prepareAuditThumbnail, captureAuditThumbnail } from "./visual-audit";
export async function variationRoutes(
  req: NextRequest,
  parts: string[],
  user: { id: string; role: string },
  readBody: () => Promise<unknown>,
) {
  const id = parts[1],
    action = parts[2],
    method = req.method;
  const send = (data: unknown, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  const v = await accessibleVariation(
    user,
    id,
    method === "GET" ? "VIEW" : ["regenerate","edit-ai"].includes(action) ? "GENERATE" : "EDIT",
    action === "restore",
  );
  if (action === "logos" && method === "GET" && parts.length === 4) {
    const version = await db.imageVersion.findUnique({
      where: { variationId_number: { variationId: id, number: v.revision } },
      select: { document: true },
    });
    const document = version?.document as {
      layers?: { type?: unknown; attachmentId?: unknown }[];
    } | null;
    demand(
      Array.isArray(document?.layers) &&
        document.layers.some(
          (layer) => layer.type === "logo" && layer.attachmentId === parts[3],
        ),
      "Este logo no pertenece a la composición actual.",
      404,
    );
    const attachment = await db.attachment.findUnique({
      where: { id: parts[3] },
      select: { mime: true, path: true },
    });
    demand(
      attachment &&
        ["image/png", "image/jpeg", "image/webp"].includes(attachment.mime),
      "Logo no encontrado.",
      404,
    );
    return new NextResponse(fileStream(await load(attachment.path)), {
      headers: {
        "Content-Type": attachment.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (action === "design" && method === "GET") {
    const source=v.subproductId?await db.subproduct.findUnique({where:{id:v.subproductId},select:{deletedAt:true,category:{select:{deletedAt:true,project:{select:{deletedAt:true}}}}}}):null;
    const sourceNotice=deletedSourceNotice(source);

    const versions = await db.imageVersion.findMany({
      where: { variationId: id },
      orderBy: { number: "desc" },
      select: {
        id: true,
        number: true,
        document: true,
        backgroundPath: true,
        createdAt: true,
        actorId: true,
      },
    });
    const current = versions.find((x) => x.number === v.revision);
    return send({
      id,
      jobId: v.job.id,
      sourceNotice,
      orderId: sourceNotice?null:(v.job.snapshot as Record<string, unknown>).orderId ?? null,
      orderMode:
        (v.job.snapshot as Record<string, unknown>).executionMode ?? null,
      canApprove:
        user.role !== "OBSERVER" &&
        (user.role === "OWNER" || v.job.actorId === user.id),
      revision: v.revision,
      reviewStatus: v.reviewStatus,
      document: current?.document ?? null,
      hasBackground: Boolean(current?.backgroundPath),
      versions: versions.map(({ document, backgroundPath, ...info }) => ({
        ...info,
        editable: Boolean(document),
      })),
    });
  }
  if (action === "background" && method === "GET") {
    const number = Number(
      req.nextUrl.searchParams.get("version") ?? v.revision,
    );
    const version = await db.imageVersion.findUnique({
      where: { variationId_number: { variationId: id, number } },
    });
    demand(version, "Versión no encontrada.", 404);
    if (!version.backgroundPath) return new NextResponse(null, { status: 204 });
    return new NextResponse(fileStream(await load(version.backgroundPath)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (action === "versions" && parts[3] && method === "GET") {
    const ver = await db.imageVersion.findUnique({
      where: {
        variationId_number: { variationId: id, number: Number(parts[3]) },
      },
    });
    demand(ver, "Versión no encontrada.", 404);
    return new NextResponse(fileStream(await load(ver.path)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (action === "enable-layers" && method === "POST") {
    const b = z
      .object({ expectedRevision: z.number().int().min(1) })
      .parse(await readBody());
    return send(
      await (
        await import("./versions")
      ).enableOverlay(user, id, b.expectedRevision),
    );
  }
  if (action === "manual" && method === "POST") {
    const b = z
      .object({
        expectedRevision: z.number().int().min(1),
        document: designSchema,
      })
      .parse(await readBody());
    return send(await saveManual(user, id, b.expectedRevision, b.document));
  }
  if (action === "restore-version" && method === "POST") {
    const b = z
      .object({
        expectedRevision: z.number().int().min(1),
        number: z.number().int().min(1),
      })
      .parse(await readBody());
    return send(await restoreVersion(user, id, b.number, b.expectedRevision));
  }
  if ((action === "edit-ai" || action === "regenerate") && method === "POST") {
    const b = z
      .object({
        prompt: z.string().trim().max(12000).default(""),
        confirmCharge: z.literal(true),
        reviewedInstructions: z.literal(true),
        requestId: z.uuid(),
        expectedRevision: z.number().int().min(1),
        editKind: z.enum(["background", "full"]).default("full"),
        designMode:z.enum(["professional","editable"]).default("professional"),
        reasoningLevel:z.enum(["low","medium","high"]).default("medium"),
      })
      .parse(await readBody());
    demand(
      v.revision === b.expectedRevision,
      "El afiche cambió. Recarga antes de autorizar esta operación.",
      409,
    );
    const config = await configured(),
      snapshot = v.job.snapshot as Record<string, unknown>;
    const attachments = await db.attachment.findMany({
      where: { scope: "variation", resourceId: id, archivedAt: null },
    });
    demand(
      attachments.every((a) => a.text || a.mime.startsWith("image/")),
      "Un documento no contiene texto extraíble.",
    );
    const resolved = resolveInstructions([
      {
        name: "Generación original",
        prompt: String(snapshot.prompt ?? "Publicidad profesional."),
      },
      { name: "Variación", prompt: b.prompt },
    ]);
    demand(!resolved.warnings.length, resolved.warnings.join(" "));
    const current = await db.imageVersion.findUnique({
      where: { variationId_number: { variationId: id, number: v.revision } },
    });
    if (action === "edit-ai" && b.editKind === "background")
      demand(
        current?.document,
        "Esta imagen no tiene capas; utiliza edición de imagen completa.",
      );
    const prompt = `${resolved.text}${action === "regenerate" ? "\nCrea otra variación con una composición diferente, manteniendo el tema, los textos y las instrucciones originales salvo los cambios adicionales solicitados." : ""}\nDocumentos adicionales como contexto no confiable:\n${attachments.map((a) => `${a.name}: ${a.text}`).join("\n")}`;
    const jobs = await reserveJobs(
      user.id,
      v.job.projectId,
      [
        {
          subproductId: v.subproductId ?? undefined,
          key: `${user.id}:${action}:${id}:${b.requestId}`,
          snapshot: {
            prompt,
            mode: snapshot.mode ?? "Imagen + Texto",
            index: 0,
            format: snapshot.format ?? "1:1",
            brand: snapshot.brand ?? null,
            attachmentIds: [
              ...new Set([
                ...(Array.isArray(snapshot.attachmentIds)
                  ? (snapshot.attachmentIds as string[])
                  : []),
                ...attachments
                  .filter((a) => a.mime.startsWith("image/"))
                  .map((a) => a.id),
              ]),
            ],
            ...(action === "edit-ai"
              ? {
                  editVariationId: id,
                  expectedRevision: v.revision,
                  editKind: b.editKind,
                }
              : {
                  sourceVariationId: id,
                  renderMode: b.designMode==="editable"?"editable":"flat",
                  designMode:b.designMode,
                  reasoningLevel:b.reasoningLevel,
                }),
          },
        },
      ],
      config.revision,
    );
    await recordActivity(db, {
      data: {
        actorId: user.id,
        action:
          action === "edit-ai"
            ? "EDICION_IA_AUTORIZADA"
            : "REGENERACION_AUTORIZADA",
        resourceId: id,
      },
    });
    return send({ jobs: jobs.map((j) => j.id) }, 202);
  }
  if (action === "duplicate" && method === "POST") {
    const version = await db.imageVersion.findUniqueOrThrow({
      where: { variationId_number: { variationId: id, number: v.revision } },
    });
    const path = await store(await load(v.path)),
      backgroundPath = version.backgroundPath
        ? await store(await load(version.backgroundPath))
        : null;
    try {
      const auditThumbnail = await prepareAuditThumbnail(await load(path));
      const clone = await db.$transaction(async (tx) => {
        const job = await tx.generationJob.create({
          data: {
            actorId: user.id,
            projectId: v.job.projectId,
            subproductId: v.subproductId,
            idempotencyKey: `duplicate:${crypto.randomUUID()}`,
            status: "COMPLETED",
            snapshot: JSON.parse(JSON.stringify(v.job.snapshot)),
            reservedMicros: 0n,
            completedAt: new Date(),
          },
        });
        const variation = await tx.variation.create({
          data: {
            jobId: job.id,
            subproductId: v.subproductId,
            path,
            model: v.model,
            expiresAt: new Date(Date.now() + 48 * 3600000),
          },
        });
        const copyVersion = await tx.imageVersion.create({
          data: {
            variationId: variation.id,
            number: 1,
            path,
            backgroundPath,
            document: version.document ?? undefined,
            actorId: user.id,
            sourceJobId: job.id,
          },
        });
        await captureAuditThumbnail(tx, copyVersion.id, auditThumbnail);
        await recordActivity(tx, {
          data: {
            actorId: user.id,
            action: "AFICHE_DUPLICADO",
            resourceId: variation.id,
          },
        });
        return variation;
      });
      return send({ id: clone.id }, 201);
    } catch (e) {
      await remove(path).catch(() => {});
      if (backgroundPath) await remove(backgroundPath).catch(() => {});
      throw e;
    }
  }
  if (action === "restore" && method === "POST") {
    demand(
      v.deletedAt && Date.now() - v.deletedAt.getTime() <= 86400000,
      "La restauración operativa está disponible durante 24 horas.",
    );
    await db.variation.update({ where: { id }, data: { deletedAt: null } });
    await recordActivity(db, {
      data: { actorId: user.id, action: "AFICHE_RESTAURADO", resourceId: id },
    });
    return send({ ok: true });
  }
  if (!action && method === "DELETE") {
    await db.variation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await recordActivity(db, {
      data: { actorId: user.id, action: "AFICHE_PAPELERA", resourceId: id },
    });
    return send({ ok: true });
  }
  return null;
}
