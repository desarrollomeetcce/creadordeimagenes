import { z } from "zod";
import sharp, { type OverlayOptions } from "sharp";
import { demand } from "./errors";
import { ratios } from "./render";
import { join } from "node:path";
const fontFiles = {
  "DejaVu Sans": "DejaVuSans.ttf",
  "DejaVu Serif": "DejaVuSerif.ttf",
  "DejaVu Sans Mono": "DejaVuSansMono.ttf",
};
const box = {
  id: z.string().min(1).max(80),
  x: z.number().int().min(0).max(4096),
  y: z.number().int().min(0).max(4096),
  width: z.number().int().min(20).max(4096),
};
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const textLayer = z
  .object({
    ...box,
    type: z.literal("text"),
    text: z.string().max(1000),
    fontSize: z.number().int().min(12).max(240),
    color,
    font: z.enum(["DejaVu Sans", "DejaVu Serif", "DejaVu Sans Mono"]),
    align: z.enum(["left", "center", "right"]),
  })
  .strict();
export const logoLayer = z
  .object({
    ...box,
    type: z.literal("logo"),
    attachmentId: z.string().max(100),
    height: z.number().int().min(20).max(4096),
  })
  .strict();
export const shapeLayer = z
  .object({
    ...box,
    type: z.literal("shape"),
    kind: z.enum(["rectangle", "ellipse"]),
    height: z.number().int().min(20).max(4096),
    color,
  })
  .strict();
export const designSchema = z
  .object({
    width: z.number().int().min(256).max(4096),
    height: z.number().int().min(256).max(4096),
    backgroundColor: color,
    layers: z
      .array(z.discriminatedUnion("type", [textLayer, logoLayer, shapeLayer]))
      .max(40),
  })
  .strict();
export type Design = z.infer<typeof designSchema>;
export const creativeSchema = z
  .object({
    backgroundPrompt: z.string().max(12000),
    backgroundColor: color,
    texts: z.array(textLayer.omit({ type: true })).max(25),
    logos: z.array(logoLayer.omit({ type: true })).max(10),
  })
  .strict();
export type CreativePlan = z.infer<typeof creativeSchema>;
export function dimensions(format: string) {
  const r = ratios[format];
  demand(r, "Formato no admitido.");
  const scale = Math.ceil(1080 / Math.min(...r));
  return { width: r[0] * scale, height: r[1] * scale };
}
export function planToDesign(
  plan: CreativePlan,
  format: string,
  logos: string[],
): Design {
  const design = designSchema.parse({
    ...dimensions(format),
    backgroundColor: plan.backgroundColor,
    layers: [
      ...plan.texts.map((x) => ({ ...x, type: "text" as const })),
      ...plan.logos.map((x) => ({ ...x, type: "logo" as const })),
    ],
  });
  const ids = new Set<string>();
  for (const l of design.layers) {
    demand(!ids.has(l.id), "La composición contiene elementos duplicados.");
    ids.add(l.id);
    if (l.type === "logo")
      demand(
        logos.includes(l.attachmentId),
        "La dirección creativa utilizó un logo no autorizado.",
      );
  }
  validateBounds(design);
  return design;
}
export function validateBounds(design: Design) {
  for (const l of design.layers) {
    demand(
      l.x + l.width <= design.width && l.y < design.height,
      "Un elemento queda fuera del área de diseño.",
    );
    if (l.type !== "text")
      demand(
        l.y + l.height <= design.height,
        "Un logo queda fuera del área de diseño.",
      );
  }
}
export const escapeMarkup = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export async function renderDesign(
  design: Design,
  background: Buffer | null,
  logos: Map<string, Buffer>,
) {
  design = designSchema.parse(design);
  validateBounds(design);
  const canvas = background
    ? await sharp(background, { limitInputPixels: 40000000 })
        .resize(design.width, design.height, {
          fit: "contain",
          background: design.backgroundColor,
        })
        .png()
        .toBuffer()
    : await sharp({
        create: {
          width: design.width,
          height: design.height,
          channels: 4,
          background: design.backgroundColor,
        },
      })
        .png()
        .toBuffer();
  const layers: OverlayOptions[] = [];
  for (const layer of design.layers) {
    if (layer.type === "text") {
      if (!layer.text.trim()) continue;
      const image = sharp({
        text: {
          text: `<span foreground="${layer.color}">${escapeMarkup(layer.text)}</span>`,
          font: `${layer.font} ${layer.fontSize}`,
          fontfile: join(
            process.cwd(),
            "assets",
            "fonts",
            fontFiles[layer.font],
          ),
          width: layer.width,
          align: layer.align,
          rgba: true,
          spacing: 4,
          wrap: "word-char",
        },
      });
      const bytes = await image.png().toBuffer();
      const meta = await sharp(bytes).metadata();
      demand(
        meta.height && meta.width && layer.y + meta.height <= design.height,
        "Un texto se corta o queda fuera de los márgenes. Reduce su tamaño o muévelo.",
      );
      layers.push({ input: bytes, left: layer.x, top: layer.y });
    } else if (layer.type === "shape") {
      const element =
        layer.kind === "ellipse"
          ? `<ellipse cx="${layer.width / 2}" cy="${layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}" fill="${layer.color}"/>`
          : `<rect width="${layer.width}" height="${layer.height}" fill="${layer.color}"/>`;
      const bytes = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${layer.width}" height="${layer.height}">${element}</svg>`,
        ),
      )
        .png()
        .toBuffer();
      layers.push({ input: bytes, left: layer.x, top: layer.y });
    } else {
      const bytes = logos.get(layer.attachmentId);
      demand(bytes, "Falta un logo autorizado de esta composición.");
      const image = await sharp(bytes, { limitInputPixels: 20000000 })
        .resize(layer.width, layer.height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      layers.push({ input: image, left: layer.x, top: layer.y });
    }
  }
  return sharp(canvas).composite(layers).png().toBuffer();
}
export function validateManualChange(previous: Design, next: Design) {
  demand(
    previous.width === next.width && previous.height === next.height,
    "No se pueden cambiar las dimensiones del original desde el editor.",
  );
  const previousLogos = new Set(
    previous.layers.filter((x) => x.type === "logo").map((x) => x.attachmentId),
  );
  for (const l of next.layers)
    if (l.type === "logo")
      demand(
        previousLogos.has(l.attachmentId),
        "No puedes introducir un recurso ajeno en esta composición.",
      );
  validateBounds(next);
}
export function creativeBrief(
  brief: string,
  format: string,
  logos: { id: string; name: string }[],
) {
  return `${brief}\nConstruye una composición editable en JSON, sin bloques Markdown. Lienzo ${JSON.stringify(dimensions(format))}. Devuelve exactamente {"backgroundPrompt":"instrucción visual sin letras ni logos", "backgroundColor":"#ffffff", "texts":[{"id":"titulo","text":"texto autorizado","x":60,"y":80,"width":900,"fontSize":64,"color":"#123456","font":"DejaVu Sans","align":"left"}],"logos":[{"id":"logo1","attachmentId":"ID autorizado","x":60,"y":30,"width":180,"height":100}]}. Usa posiciones dentro del lienzo y suficiente espacio para que el texto no se corte. Fuentes: DejaVu Sans, DejaVu Serif, DejaVu Sans Mono. Solo incorpora textos comerciales presentes en las instrucciones. El precio, si existe, será discreto cuando se indique. Logos autorizados: ${JSON.stringify(logos)}. No inventes logos. Para modalidad Texto no se generará fotografía. Las capas de texto y logos se renderizan exactamente en servidor; backgroundPrompt debe excluir ambos.`;
}
