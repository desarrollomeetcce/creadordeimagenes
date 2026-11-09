import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { db } from "../db";
import { demand, AppError } from "../errors";
import { resourceAccess, subproductFilter } from "../auth";
import { Prisma } from "@prisma/client";
import { validateUpload } from "../uploads";
import { store, storeVideo, remove } from "../storage";
import { recordActivity } from "../activity";
import type { Actor } from "./service";
export const ownMediaLimit = () =>
  process.env.VERCEL ? 3000000 : 64 * 1024 * 1024;
export async function validateOwnMedia(file: File) {
  demand(
    file.size > 0 && file.size <= ownMediaLimit(),
    "El recurso está vacío o supera el límite de subida.",
    413,
  );
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) {
    const checked = await validateUpload(file);
    return { ...checked, mediaType: "IMAGE" };
  }
  demand(
    ext === "mp4" || ext === "mov",
    "Usa PNG, JPG, WebP o un video MP4/MOV.",
  );
  const bytes = Buffer.from(await file.arrayBuffer());
  demand(
    bytes.toString("ascii", 4, 8) === "ftyp",
    "El video no es un MP4/MOV válido.",
  );
  const dir = await mkdtemp(join(tmpdir(), "studio-media-"));
  try {
    const path = join(dir, "input." + ext);
    await writeFile(path, bytes, { mode: 0o600 });
    let info: any;
    try {
      const { stdout } = await promisify(execFile)(
        "ffprobe",
        [
          "-protocol_whitelist",
          "file,pipe",
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          path,
        ],
        { timeout: 20000, maxBuffer: 200000 },
      );
      info = JSON.parse(stdout);
    } catch {
      throw new AppError(
        "No se pudo validar el video. Usa MP4/MOV con video H.264 y audio AAC.",
        400,
      );
    }
    const video = info.streams?.find((s: any) => s.codec_type === "video");
    demand(
      video?.codec_name === "h264" &&
        video.width > 0 &&
        video.height > 0 &&
        video.width <= 4096 &&
        video.height <= 4096,
      "Usa video H.264 de hasta4096 píxeles por lado.",
    );
    demand(
      info.streams.every(
        (s: any) => s.codec_type !== "audio" || s.codec_name === "aac",
      ),
      "El audio del video debe ser AAC.",
    );
    demand(
      Number(info.format?.duration) > 0 && Number(info.format.duration) <= 3600,
      "Usa un video de hasta60 minutos.",
    );
    return {
      bytes,
      mime: ext === "mov" ? "video/quicktime" : "video/mp4",
      mediaType: "VIDEO",
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function uploadOwnMedia(
  actor: Actor,
  subId: string,
  req: Request,
) {
  await resourceAccess(actor, "subproduct", subId, "EDIT");
  const max = ownMediaLimit() + 16384;
  demand(
    Number(req.headers.get("content-length") ?? 0) <= max,
    "El recurso supera el límite de subida.",
    413,
  );
  const reader = req.body?.getReader();
  demand(reader, "Selecciona un recurso.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > max) {
        await reader.cancel();
        throw new AppError("El recurso supera el límite de subida.", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
    headers: { "Content-Type": req.headers.get("content-type") ?? "" },
  }).formData();
  const file = form.get("file");
  demand(file instanceof File, "Selecciona una foto o video.");
  const requestId = z.uuid().parse(form.get("requestId")),
    permanent =
      z
        .enum(["folder", "campaign"])
        .parse(form.get("storage") ?? "campaign") === "folder";
  const digest = createHash("sha256")
      .update(Buffer.from(await file.arrayBuffer()))
      .digest("hex"),
    jobId = "own-media-" + requestId;
  const previous = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { variation: true },
  });
  if (previous) {
    const snap = previous.snapshot as any;
    demand(
      previous.actorId === actor.id &&
        previous.subproductId === subId &&
        snap.sha256 === digest &&
        snap.permanent === permanent,
      "La solicitud ya se usó con otro recurso.",
      409,
    );
    demand(
      previous.variation &&
        !previous.variation.deletedAt &&
        !previous.variation.expired &&
        (previous.variation.permanent ||
          previous.variation.expiresAt > new Date()),
      "El recurso temporal de esta subida ya venció.",
      410,
    );
    return { id: previous.variation.id };
  }
  const checked = await validateOwnMedia(file),
    path = await (checked.mediaType === "VIDEO" ? storeVideo : store)(
      checked.bytes,
    );
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id} FOR SHARE`;
      demand(
        await tx.user.findFirst({
          where: {
            id: actor.id,
            role: actor.role as any,
            status: "APPROVED",
            archivedAt: null,
          },
        }),
        "La cuenta cambió.",
        403,
      );
      const sub = await tx.subproduct.findFirst({
        where: {
          id: subId,
          ...subproductFilter(actor),
        },
        include: {
          category: {
            include: { project: { select: { id: true, name: true } } },
          },
        },
      });
      demand(sub, "La carpeta no está disponible.", 404);
      const job = await tx.generationJob.create({
        data: {
          id: jobId,
          actorId: actor.id,
          projectId: sub.category.projectId,
          subproductId: subId,
          idempotencyKey: jobId,
          status: "COMPLETED",
          reservedMicros: 0,
          completedAt: new Date(),
          snapshot: {
            source: "own-resource",
            engine: "manual",
            fileName: file.name.slice(0, 200),
            sha256: digest,
            permanent,
          },
        },
      });
      const media = await tx.variation.create({
        data: {
          jobId: job.id,
          subproductId: subId,
          path,
          mediaType: checked.mediaType,
          mime: checked.mime,
          originalName: file.name.slice(0, 200),
          ownResource: true,
          model: "Recurso propio · sin IA",
          reviewStatus: "APPROVED",
          permanent,
          expiresAt: new Date(Date.now() + 24 * 3600000),
        },
      });
      if (permanent) {
        await tx.subproduct.update({
          where: { id: subId },
          data: { studio: { ...(sub.studio as any), folderPending: false } },
        });
        await tx.libraryItem.create({
          data: { variationId: media.id, userId: actor.id },
        });
      }
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "RECURSO_PROPIO_SUBIDO",
          resourceId: media.id,
          detail: {
            project: sub.category.project.name,
            folder: sub.category.name,
            diploma: sub.name,
            file: file.name.slice(0, 200),
            type: checked.mediaType,
            storage: permanent ? "Carpeta" : "Temporal · campaña",
            bytes: checked.bytes.length,
          },
        },
      });
      return { id: media.id, permanent, mediaType: media.mediaType };
    });
  } catch (e) {
    if (!(await db.variation.count({ where: { path } })))
      await remove(path).catch(() => {});
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const replay = await db.generationJob.findUnique({
          where: { id: jobId },
          include: { variation: true },
        }),
        snap = replay?.snapshot as any;
      if (
        replay?.actorId === actor.id &&
        replay.subproductId === subId &&
        snap.sha256 === digest &&
        snap.permanent === permanent &&
        replay.variation &&
        !replay.variation.deletedAt &&
        !replay.variation.expired &&
        (replay.variation.permanent || replay.variation.expiresAt > new Date())
      )
        return { id: replay.variation.id };
    }
    throw e;
  }
}
