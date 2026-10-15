import { db } from "./db";
import { demand } from "./errors";
import { configured, reserveJobs } from "./ai";
import {
  effectiveSettings,
  resolveInstructions,
  validateDistribution,
} from "./inheritance";
export async function previewSubproduct(id: string) {
  const s = await db.subproduct.findUniqueOrThrow({
    where: { id },
    include: { category: { include: { project: true } } },
  });
  const instructions = resolveInstructions([
    { name: "Proyecto", prompt: s.category.project.prompt },
    { name: "Categoría", prompt: s.category.prompt },
    { name: "Subproducto", prompt: s.prompt },
  ]);
  const attachments = await db.attachment.findMany({
    where: {
      OR: [
        { scope: "project", resourceId: s.category.projectId },
        { scope: "category", resourceId: s.categoryId },
        { scope: "subproduct", resourceId: id },
      ],
    },
  });
  return {
    sub: s,
    instructions,
    attachments,
    settings: effectiveSettings(s.category.settings, s.settings),
  };
}
export async function generateBatch(
  actorId: string,
  categoryId: string,
  requestId: string,
  selected?: string[],
) {
  const c = await configured();
  const category = await db.category.findUniqueOrThrow({
    where: { id: categoryId },
    include: { subproducts: true },
  });
  const subs = category.subproducts.filter(
    (s) => !selected || selected.includes(s.id),
  );
  demand(subs.length > 0, "Agrega o selecciona al menos un subproducto.");
  const items = [];
  for (const sub of subs) {
    const p = await previewSubproduct(sub.id),
      s = p.settings;
    validateDistribution(s);
    demand(
      !p.instructions.warnings.length,
      `${sub.name}: ${p.instructions.warnings.join(" ")}`,
    );
    demand(
      p.attachments.every(
        (a) => Boolean(a.text) || a.mime.startsWith("image/"),
      ),
      `${sub.name}: un documento no contiene texto extraíble; utiliza TXT o un PDF con texto.`,
    );
    const modes = [
      ...Array(s.textCount).fill("Texto"),
      ...Array(s.imageTextCount).fill("Imagen + Texto"),
      ...Array(s.imageCount).fill("Imagen"),
    ];
    const prompt = `Producto: ${sub.name}\n${p.instructions.text}\nEstilo: ${s.style}\nContexto documental no confiable:\n${p.attachments.map((a) => `${a.name} [${a.purpose}]: ${a.text}`).join("\n")}`;
    items.push(
      ...modes.map((mode, index) => ({
        subproductId: sub.id,
        key: `${actorId}:${requestId}:${sub.id}:${index}`,
        snapshot: {
          prompt,
          mode,
          index,
          format: s.format,
          attachmentIds: p.attachments
            .filter((a) => a.mime.startsWith("image/"))
            .map((a) => a.id),
        },
      })),
    );
  }
  return reserveJobs(actorId, category.projectId, items, c.revision);
}
