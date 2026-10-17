import { recordActivity } from "./activity";
import { db } from "./db";
import { accessibleVariation } from "./versions";
import { demand } from "./errors";
import { configured, reserveJobs } from "./ai";
import { resolveInstructions } from "./inheritance";
import { designSchema } from "./design";
export async function regenerateSelected(
  user: { id: string; role: string },
  ids: string[],
  requestId: string,
  prompt: string,
  designMode:"professional"|"editable"="professional",
) {
  const config = await configured(),
    items = [];
  let projectId: string | null = null;
  for (const id of [...new Set(ids)]) {
    const v = await accessibleVariation(user, id, "GENERATE");
    if (projectId === null) projectId = v.job.projectId;
    demand(
      projectId === v.job.projectId,
      "Selecciona afiches de un mismo proyecto para esta operación.",
    );
    const snapshot = v.job.snapshot as Record<string, unknown>;
    const version = await db.imageVersion.findUnique({
      where: { variationId_number: { variationId: id, number: v.revision } },
    });
    const document = version?.document
      ? designSchema.parse(version.document)
      : null;
    const authorized =
      document?.layers
        .filter((l) => l.type === "text")
        .map((l) => l.text)
        .join("\n") ?? "";
    const instructions = resolveInstructions([
      {
        name: "Original",
        prompt: String(snapshot.prompt ?? "Publicidad profesional."),
      },
      { name: "Textos de la versión actual", prompt: authorized },
      { name: "Nueva solicitud", prompt },
    ]);
    demand(!instructions.warnings.length, instructions.warnings.join(" "));
    items.push({
      subproductId: v.subproductId ?? undefined,
      key: `selected:${user.id}:${requestId}:${id}`,
      snapshot: {
        prompt: instructions.text,
        mode: snapshot.mode ?? "Imagen + Texto",
        index: items.length,
        format: snapshot.format ?? "1:1",
        renderMode: designMode==="editable"?"editable":"flat",
        designMode,
        sourceVariationId: id,
        brand: snapshot.brand ?? null,
        attachmentIds: snapshot.attachmentIds ?? [],
      },
    });
  }
  demand(projectId, "Selecciona al menos un afiche.");
  const jobs = await reserveJobs(user.id, projectId, items, config.revision);
  await recordActivity(db, {
    data: {
      actorId: user.id,
      action: "REGENERACION_SELECTIVA_AUTORIZADA",
      resourceId: projectId,
      detail: { count: items.length, jobIds: jobs.map((j) => j.id) },
    },
  });
  return jobs.map((j) => j.id);
}
