import { db } from "../lib/db";
import { configured } from "../lib/ai";
import { decryptKey } from "../lib/crypto";
import { adapter } from "../lib/providers";
import { store, remove, load } from "../lib/storage";
import { adaptImage } from "../lib/render";
import { AppError, demand } from "../lib/errors";
type Snapshot = {
  prompt: string;
  mode: string;
  index: number;
  configRevision: number;
  format: string;
  attachmentIds?: string[];
};
export async function runOne() {
  const candidate = await db.generationJob.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return false;
  const claim = await db.generationJob.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (!claim.count) return true;
  let called = false;
  try {
    const c = await configured();
    const s = candidate.snapshot as unknown as Snapshot;
    demand(
      c.revision === s.configRevision,
      "La configuración cambió: vuelve a autorizar esta generación.",
    );
    const u = await db.user.findUnique({ where: { id: candidate.actorId } });
    demand(u?.status === "APPROVED", "La cuenta ya no está aprobada.");
    if (candidate.projectId !== "connection-test") {
      const { projectAccess } = await import("../lib/auth");
      await projectAccess(u, candidate.projectId, "GENERATE");
    }
    const provider = adapter(c.provider),
      key = decryptKey(c.encryptedKey!);
    const brief = `${s.prompt}\nModalidad: ${s.mode}. Propuesta ${s.index + 1}: composición distinta, márgenes seguros, texto legible. Formato ${s.format}. Si es Texto, conservar logos autorizados, sin fotografías temáticas.`;
    const references = await db.attachment.findMany({
      where: { id: { in: s.attachmentIds ?? [] } },
    });
    demand(
      references.length <= 10,
      "Selecciona como máximo 10 referencias visuales por generación.",
    );
    const images = await Promise.all(
      references.map(async (a) => ({
        bytes: await load(a.path),
        mime: a.mime,
      })),
    );
    called = true;
    const plan = await provider.direct(key, c.creativeModel!, brief);
    const result = await provider.generate(key, {
      model: c.imageModel!,
      prompt: plan.text,
      quality: c.quality,
      size: c.resolution,
      images,
    });
    const path = await store(await adaptImage(result.bytes, s.format));
    await db.$transaction(async (tx) => {
      await tx.variation.create({
        data: {
          jobId: candidate.id,
          subproductId: candidate.subproductId,
          path,
          model: c.imageModel!,
          expiresAt: new Date(Date.now() + 48 * 3600000),
        },
      });
      await tx.generationJob.update({
        where: { id: candidate.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          snapshot: { ...s, creativePlan: plan.text },
        },
      });
      await tx.usageLedger.update({
        where: { jobId: candidate.id },
        data: {
          status: "CONSUMED_ESTIMATE",
          usage: JSON.parse(
            JSON.stringify({ creative: plan.usage, image: result.usage }),
          ),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: candidate.actorId,
          action: "GENERACION_COMPLETADA",
          resourceId: candidate.id,
        },
      });
    });
  } catch (e) {
    const message =
      e instanceof AppError
        ? e.message
        : "No se pudo completar la generación. Revisa el estado del servidor.";
    await db.$transaction([
      db.generationJob.update({
        where: { id: candidate.id },
        data: {
          status: called ? "UNCERTAIN" : "FAILED",
          error: message,
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
async function main() {
  // Interrupted API calls have uncertain billing; never replay automatically.
  await db.generationJob.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: new Date(Date.now() - 15 * 60000) },
    },
    data: {
      status: "UNCERTAIN",
      error:
        "Operación interrumpida. Revisa el consumo del proveedor antes de volver a generar.",
    },
  });
  while (true) {
    await runOne();
    const expired = await db.variation.findMany({
      where: {
        permanent: false,
        expired: false,
        expiresAt: { lt: new Date() },
      },
      take: 25,
    });
    for (const v of expired) {
      await remove(v.path).catch(() => {});
      await db.variation.update({
        where: { id: v.id },
        data: { expired: true },
      });
    }
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
