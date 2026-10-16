import { db } from "./db";
import { demand } from "./errors";
import { configured, reserveJobs } from "./ai";
import { readBrand, brandInstructions } from "./brand";
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
  const brand = await readBrand(s.category.projectId);
  const instructions = resolveInstructions([
    { name: "Identidad de marca", prompt: brandInstructions(brand) },
    { name: "Proyecto", prompt: s.category.project.prompt },
    {
      name: "Categoría",
      prompt: s.category.applyPromptToAll ? s.category.prompt : "",
    },
    { name: "Subproducto", prompt: s.prompt },
  ]);
  instructions.text += `\nEJE TEMÁTICO OBLIGATORIO DEL SUBPRODUCTO: ${JSON.stringify(s.name)}. Todas las variaciones deben tratar exclusivamente de este tema y mencionar su nombre. Las instrucciones particulares amplían las instrucciones heredadas activas; no sustituyen el eje temático ni eliminan indicaciones generales compatibles.`;
  const inheritedAttachments = await db.attachment.findMany({
    where: {
      OR: [
        { scope: "project", resourceId: s.category.projectId },
        { scope: "category", resourceId: s.categoryId },
        { scope: "subproduct", resourceId: id },
      ],
    },
  });
  const attachments = inheritedAttachments.filter(
    (a) =>
      !brand ||
      a.scope !== "project" ||
      !/logo/i.test(a.purpose) ||
      brand.logoAttachmentIds.includes(a.id),
  );
  const needsSettings =
    !s.category.applySettingsToAll &&
    Object.keys(s.settings as object).length === 0;
  if (needsSettings)
    instructions.warnings.push(
      "Define la cantidad, distribución, formato y estilo de este subproducto; la categoría no aplica parámetros comunes.",
    );
  return {
    sub: s,
    instructions,
    attachments,
    brand,
    settings: effectiveSettings(
      s.category.settings,
      s.settings,
      s.category.applySettingsToAll,
    ),
    needsSettings,
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
  if (selected)
    demand(
      subs.length === new Set(selected).size,
      "La selección incluye subproductos que ya no están en esta categoría. Actualiza el lote.",
    );
  demand(subs.length > 0, "Agrega o selecciona al menos un subproducto.");
  const items = [];
  for (const sub of subs) {
    const p = await previewSubproduct(sub.id),
      s = p.settings;
    validateDistribution(s);
    demand(
      !p.needsSettings,
      `${sub.name}: define su cantidad, distribución y estilo antes de generar; esta categoría no aplica parámetros comunes.`,
    );
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
    demand(
      p.attachments.filter((a) => a.mime.startsWith("image/")).length <= 9,
      `${sub.name}: utiliza como máximo nueve referencias visuales por afiche.`,
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
          subjectName: sub.name,
          mode,
          index,
          format: s.format,
          renderMode: s.editable ? "editable" : "flat",
          brand: p.brand,
          attachmentIds: p.attachments
            .filter((a) => a.mime.startsWith("image/"))
            .map((a) => a.id),
        },
      })),
    );
  }
  return reserveJobs(actorId, category.projectId, items, c.revision);
}
