import { recordActivity } from "../lib/activity";
import { db } from "../lib/db";
import { configured } from "../lib/ai";
import { decryptKey } from "../lib/crypto";
import { adapter } from "../lib/providers";
import { store, remove, load, requireStorageSpace } from "../lib/storage";
import {
  prepareAuditThumbnail,
  captureAuditThumbnail,
  cleanupAuditThumbnails,
  requireAuditSpace,
} from "../lib/visual-audit";
import { adaptImage } from "../lib/render";
import { AppError, demand } from "../lib/errors";
import {
  creativeSchema,
  creativeBrief,
  planToDesign,
  renderDesign,
  designSchema,
  type Design,
} from "../lib/design";
import {
  logoBytes,
  publishVersion,
  accessibleVariation,
} from "../lib/versions";
type Snapshot = {
  prompt: string;
  mode: string;
  index: number;
  configRevision: number;
  format: string;
  attachmentIds?: string[];
  renderMode?: "editable" | "flat";
  editVariationId?: string;
  expectedRevision?: number;
  editKind?: "background" | "full";
  sourceVariationId?: string;
};
export async function runOne(filter?: {
  id?: string;
  actorId?: string;
  deadlineMs?: number;
}) {
  const candidate = await db.generationJob.findFirst({
    where: {
      status: "PENDING",
      ...(filter?.id ? { id: filter.id } : {}),
      ...(filter?.actorId ? { actorId: filter.actorId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return false;
  const claim = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const active = await tx.generationJob.count({
      where: { actorId: candidate.actorId, status: "RUNNING" },
    });
    if (active) return { count: 0 };
    return tx.generationJob.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
  });
  if (!claim.count) return false;
  const signal = filter?.deadlineMs
    ? AbortSignal.timeout(filter.deadlineMs)
    : undefined;
  let called = false;
  const written: string[] = [];
  try {
    await requireAuditSpace();
    await requireStorageSpace();
    const c = await configured(),
      s = candidate.snapshot as unknown as Snapshot;
    demand(
      c.revision === s.configRevision,
      "La configuración cambió: vuelve a autorizar esta generación.",
    );
    const u = await db.user.findUnique({ where: { id: candidate.actorId } });
    demand(u?.status === "APPROVED", "La cuenta ya no está aprobada.");
    if (candidate.projectId !== "connection-test") {
      const { jobResourceAccess } = await import("../lib/auth");
      await jobResourceAccess(
        u,
        candidate,
        s.editVariationId ? "EDIT" : "GENERATE",
      );
    }
    const provider = adapter(c.provider),
      key = decryptKey(c.encryptedKey!);
    const refs = await db.attachment.findMany({
      where: { id: { in: s.attachmentIds ?? [] } },
    });
    demand(
      refs.length === new Set(s.attachmentIds ?? []).size,
      "Un adjunto fue eliminado. Revisa y vuelve a autorizar las instrucciones.",
    );
    demand(
      refs.length <= 9,
      "Selecciona como máximo nueve referencias visuales por afiche.",
    );
    const images = await Promise.all(
      refs.map(async (a) => ({ bytes: await load(a.path), mime: a.mime })),
    );
    let document: Design | null = null,
      backgroundPath: string | null = null,
      output: Buffer,
      creativePlan: string = "",
      creativeUsage: unknown = null,
      imageUsage: unknown = null;
    if (s.editVariationId) {
      const original = await accessibleVariation(u, s.editVariationId, "EDIT");
      demand(
        original.revision === s.expectedRevision,
        "El original cambió. Revisa la nueva versión antes de autorizar otra edición.",
      );
      const source = await db.imageVersion.findUniqueOrThrow({
        where: {
          variationId_number: {
            variationId: original.id,
            number: original.revision,
          },
        },
      });
      const preserve = s.editKind === "background";
      if (preserve) {
        demand(source.document, "El afiche no tiene capas independientes.");
        document = designSchema.parse(source.document);
      }
      const inputPath = preserve ? source.backgroundPath : source.path;
      const input = inputPath
        ? { bytes: await load(inputPath), mime: "image/png" }
        : null;
      called = true;
      const result = await provider.generate(key, {
        signal,
        model: c.imageModel!,
        prompt: preserve
          ? `${s.prompt}\nEditar solo el fondo o fotografía. Sin textos, letras ni logos: estos se mantienen como capas independientes.`
          : s.prompt,
        quality: c.quality,
        size: c.resolution,
        images: [...(input ? [input] : []), ...images],
      });
      imageUsage = result.usage;
      if (document) {
        backgroundPath = await store(await adaptImage(result.bytes, s.format));
        written.push(backgroundPath);
        output = await renderDesign(
          document,
          await load(backgroundPath),
          await logoBytes(document),
        );
      } else output = await adaptImage(result.bytes, s.format);
    } else {
      const brief = `${s.prompt}\nModalidad: ${s.mode}. Propuesta ${s.index + 1}: composición distinta. Formato ${s.format}. Si es Texto, sin fotografías temáticas.`;
      called = true;
      const plan = await provider.direct(
        key,
        c.creativeModel!,
        s.renderMode === "editable"
          ? creativeBrief(
              brief,
              s.format,
              refs
                .filter((a) => /logo/i.test(a.purpose))
                .map((a) => ({ id: a.id, name: a.name })),
            )
          : brief,
        s.renderMode === "editable",
        signal,
      );
      creativePlan = plan.text;
      creativeUsage = plan.usage;
      if (s.renderMode === "editable") {
        let raw;
        try {
          raw = JSON.parse(plan.text);
        } catch {
          throw new AppError(
            "La dirección creativa devolvió un plan ilegible. No se ejecutó una generación adicional de imágenes.",
          );
        }
        const parsed = creativeSchema.safeParse(raw);
        demand(
          parsed.success,
          "La dirección creativa devolvió una composición inválida. Revisa las instrucciones antes de volver a generar.",
        );
        document = planToDesign(
          parsed.data,
          s.format,
          refs.filter((a) => /logo/i.test(a.purpose)).map((a) => a.id),
        );
        if (s.mode !== "Texto") {
          const result = await provider.generate(key, {
            signal,
            model: c.imageModel!,
            prompt:
              parsed.data.backgroundPrompt +
              "\nCrear solo el recurso visual de fondo. Sin letras, precios ni logotipos.",
            quality: c.quality,
            size: c.resolution,
            images: images.filter((_, i) => !/logo/i.test(refs[i].purpose)),
          });
          imageUsage = result.usage;
          backgroundPath = await store(
            await adaptImage(result.bytes, s.format),
          );
          written.push(backgroundPath);
        }
        output = await renderDesign(
          document,
          backgroundPath ? await load(backgroundPath) : null,
          await logoBytes(document),
        );
      } else {
        const result = await provider.generate(key, {
          signal,
          model: c.imageModel!,
          prompt: plan.text,
          quality: c.quality,
          size: c.resolution,
          images,
        });
        imageUsage = result.usage;
        output = await adaptImage(result.bytes, s.format);
      }
    }
    const path = await store(output);
    written.push(path);
    const auditThumbnail = await prepareAuditThumbnail(output);
    await db.$transaction(async (tx) => {
      const active = await tx.generationJob.findUnique({
        where: { id: candidate.id },
      });
      demand(
        active?.status === "RUNNING",
        "El trabajo ya no está activo. Su resultado requiere revisión.",
        409,
      );
      if (s.editVariationId)
        await publishVersion(tx, {
          variationId: s.editVariationId,
          expectedRevision: s.expectedRevision!,
          actorId: candidate.actorId,
          path,
          backgroundPath,
          document,
          sourceJobId: candidate.id,
          action: "EDICION_IA",
          auditThumbnail,
        });
      else {
        const v = await tx.variation.create({
          data: {
            jobId: candidate.id,
            subproductId: candidate.subproductId,
            path,
            model: c.imageModel!,
            expiresAt: new Date(Date.now() + 48 * 3600000),
          },
        });
        const version = await tx.imageVersion.create({
          data: {
            variationId: v.id,
            number: 1,
            path,
            backgroundPath,
            document: document
              ? JSON.parse(JSON.stringify(document))
              : undefined,
            actorId: candidate.actorId,
            sourceJobId: candidate.id,
          },
        });
        await captureAuditThumbnail(tx, version.id, auditThumbnail);
      }
      await tx.generationJob.update({
        where: { id: candidate.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          snapshot: { ...s, creativePlan },
        },
      });
      await tx.usageLedger.update({
        where: { jobId: candidate.id },
        data: {
          status: "CONSUMED_ESTIMATE",
          usage: JSON.parse(
            JSON.stringify({ creative: creativeUsage, image: imageUsage }),
          ),
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: candidate.actorId,
          action: "GENERACION_COMPLETADA",
          resourceId: candidate.id,
        },
      });
    });
  } catch (e) {
    for (const path of written) await remove(path).catch(() => {});
    const error =
      e instanceof AppError
        ? e.message
        : "No se pudo completar la generación. Revisa el estado del servidor.";
    await db.$transaction([
      db.generationJob.update({
        where: { id: candidate.id },
        data: {
          status: called ? "UNCERTAIN" : "FAILED",
          error,
          completedAt: new Date(),
        },
      }),
      db.usageLedger.update({
        where: { jobId: candidate.id },
        data: { status: called ? "UNCERTAIN" : "RELEASED" },
      }),
    ]);
  }
  return true;
}
export async function cleanupExpired(now = new Date()) {
  await cleanupAuditThumbnails(now);
  const expired = await db.variation.findMany({
    where: { permanent: false, expired: false, expiresAt: { lt: now } },
    include: { versions: true },
    take: 25,
  });
  for (const v of expired) {
    // Claim expiry against a concurrent save-to-library before removing any file.
    const claim = await db.variation.updateMany({
      where: {
        id: v.id,
        permanent: false,
        expired: false,
        expiresAt: { lt: now },
      },
      data: { expired: true },
    });
    if (!claim.count) continue;
    for (const p of new Set([
      v.path,
      ...v.versions.flatMap((x) => [
        x.path,
        ...(x.backgroundPath ? [x.backgroundPath] : []),
      ]),
    ]))
      await remove(p).catch(() => {});
  }
  return expired.length;
}
export async function recoverInterrupted(now = new Date()) {
  return db.$transaction(async (tx) => {
    const stale = await tx.generationJob.findMany({
      where: {
        status: "RUNNING",
        startedAt: { lt: new Date(now.getTime() - 15 * 60000) },
      },
    });
    for (const j of stale) {
      const updated = await tx.generationJob.updateMany({
        where: { id: j.id, status: "RUNNING" },
        data: {
          status: "UNCERTAIN",
          error:
            "Operación interrumpida. Revisa el consumo del proveedor antes de volver a generar.",
        },
      });
      if (updated.count)
        await tx.usageLedger.updateMany({
          where: { jobId: j.id },
          data: { status: "UNCERTAIN" },
        });
    }
    return stale.length;
  });
}
async function main() {
  while (true) {
    await recoverInterrupted();
    await runOne();
    await cleanupExpired();
    await new Promise((r) => setTimeout(r, 1500));
  }
}
if (process.argv[1]?.endsWith("worker.ts"))
  main().catch(() => {
    process.stderr.write(
      "El worker se detuvo por un error de infraestructura.\n",
    );
    process.exit(1);
  });
