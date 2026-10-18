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
    fontWeight: z.enum(["normal","bold"]).optional(),
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
          text: `<span weight="${layer.fontWeight??"normal"}" foreground="${layer.color}">${escapeMarkup(layer.text)}</span>`,
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
      const offset=layer.align==="center"?(layer.width-meta.width!)/2:layer.align==="right"?layer.width-meta.width!:0;
      layers.push({ input: bytes, left: Math.max(layer.x,Math.round(layer.x+offset)), top: layer.y });
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
  return `${brief}\nDIRECCIÓN DE COMPOSICIÓN EDITABLE\nDevuelve JSON válido sin Markdown para el lienzo ${JSON.stringify(dimensions(format))}. Esquema exacto: {"backgroundPrompt":"dirección visual detallada sin letras ni logos, con protagonista, iluminación, profundidad, color y contraste coordinados con las cajas de texto", "backgroundColor":"#163c32", "texts":[{"id":"titulo","text":"titular autorizado","x":70,"y":90,"width":850,"fontSize":100,"color":"#ffffff","font":"DejaVu Sans","align":"left"}], "logos":[]}. Este ejemplo ilustra el esquema; crea una composición original adaptada al tema, no copies sus coordenadas ni color.\nEl fondo es una parte principal del afiche: no lo reduzcas a líneas decorativas o a un lienzo blanco sin intención. Para Imagen + Texto crea un protagonista visual, áreas de contraste y un encuadre que dialogue con el texto; reserva solo el espacio necesario para lectura. La imagen de fondo puede incorporar formas, bloques de color, profundidad y recursos gráficos sin letras. Para Texto construye jerarquía tipográfica y contraste con los elementos disponibles; no se genera fotografía. Para Imagen deja texts vacío.\nUsa titulares con escala apropiada para móvil, cuerpo legible y como máximo tres familias tipográficas. Distribuye contenido en el lienzo con márgenes y ritmo visual, sin dejar casi todo vacío ni superponerlo. Cada caja debe caber con su texto completo. Ajusta tamaños a ${JSON.stringify(dimensions(format))}; no uses siempre el mismo esquema. Fuentes disponibles: DejaVu Sans, DejaVu Serif y DejaVu Sans Mono. Solo textos comerciales autorizados, conservando exactamente nombres, ofertas, períodos y precios. El precio será discreto cuando se pida. No imprimas instrucciones internas. Logos autorizados: ${JSON.stringify(logos)}; incorpora únicamente sus IDs, no inventes logos. Las capas de texto y logos se renderizan en servidor: backgroundPrompt debe describir la composición visual sin dibujar letras ni logos.`;
}
