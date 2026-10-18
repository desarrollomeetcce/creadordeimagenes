import sharp from "sharp";
import { join } from "node:path";
import { dimensions, escapeMarkup, type Design } from "./design";
import type { FlyerCopy } from "./flyer-copy";
const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
const ink = (color: string) => {
  const [r, g, b] = color
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 155 ? "#102a43" : "#ffffff";
};
/** The image model supplies the visual; these literal text layers supply spelling. */
export async function exactFlyer(
  copy: FlyerCopy,
  format: string,
  mode: string,
  colors: unknown,
  logos: { id: string; name: string; label?: string }[],
) {
  const { width: w, height: h } = dimensions(format),
    palette = Array.isArray(colors) ? colors.filter(validColor) : [];
  const primary = palette[0] ?? "#102a43",
    accent = palette[1] ?? "#f2c14e",
    textOnly = mode === "Texto";
  const readableText=textOnly?(ink(primary)==="#ffffff"?primary:"#102a43"):ink(primary);
  const design: Design = {
    width: w,
    height: h,
    backgroundColor: textOnly ? "#ffffff" : primary,
    layers: [],
  };
  const n = (v: number) => Math.round(v),
    x = n(w * 0.05),
    inner = n(w * 0.9),
    panel = n(w * 0.59);
  const box = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ) =>
    design.layers.push({
      id,
      type: "shape",
      kind: "rectangle",
      x: n(x),
      y: n(y),
      width: n(width),
      height: Math.max(20,n(height)),
      color,
    });
  const text = async (
    id: string,
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    size: number,
    color: string,
    bold = false,
    align: "left" | "center" = "left",
  ) => {
    if (!value) return;
    let fontSize = Math.min(240, n(size));
    while (fontSize > 12) {
      const rendered = await sharp({
        text: {
          text: `<span weight="${bold ? "bold" : "normal"}" foreground="${color}">${escapeMarkup(value)}</span>`,
          font: `DejaVu Sans ${fontSize}`,
          fontfile: join(process.cwd(), "assets/fonts/DejaVuSans.ttf"),
          width: n(width),
          align,
          rgba: true,
          spacing: 4,
          wrap: "word",
        },
      })
        .png()
        .toBuffer();
      const meta = await sharp(rendered).metadata();
      if ((meta.height ?? 0) <= height && (meta.width ?? 0) <= width) break;
      fontSize--;
    }
    design.layers.push({
      id,
      type: "text",
      x: n(x),
      y: n(y),
      width: n(width),
      fontSize,
      color,
      font: "DejaVu Sans",
      fontWeight: bold ? "bold" : "normal",
      align,
      text: value,
    });
  };
  if (!textOnly) box("copy-panel", 0, 0, panel, h, primary);
  else {
    box("rule-top", x, h * 0.105, inner, 4, accent);
    box("rule-bottom", x, h * 0.88, inner, 4, accent);
  }
  box("brand-bar", 0, 0, w, h * 0.1, "#ffffff");
  const brands = copy.brands.length ? copy.brands.map(name=>({id:logos.find(logo=>logo.label===name)?.id??"",name})) : logos.slice(0,6);
  for (let index = 0; index < brands.length; index++) {
    const item = brands[index],
      bw = inner / brands.length,
      bx = x + index * bw;
    if (item.id)
      design.layers.push({
        id: "logo-" + index,
        type: "logo",
        attachmentId: item.id,
        x: n(bx),
        y: n(h * 0.018),
        width: n(bw - 16),
        height: n(h * 0.062),
      });
    else
      await text(
        "brand-" + index,
        item.name,
        bx,
        h * 0.02,
        bw - 16,
        h * 0.06,
        Math.min(w * 0.021, h * 0.026),
        "#102a43",
        true,
        "center",
      );
  }
  const tx = textOnly ? x : x,
    tw = textOnly ? inner : n(panel - w * 0.09),
    align = textOnly ? "center" : "left";
  await text(
    "headline",
    copy.title,
    tx,
    h * 0.135,
    tw,
    h * 0.235,
    Math.min(w * 0.087, h * 0.09),
    readableText,
    true,
    align,
  );
  await text(
    "impact",
    copy.phrase,
    tx,
    h * 0.38,
    tw,
    h * 0.072,
    Math.min(w * 0.031, h * 0.032),
    readableText,
    false,
    align,
  );
  box("offer-band", tx, h * 0.475, tw, h * 0.135, accent);
  await text(
    "offer",
    copy.offer,
    tx + tw * 0.025,
    h * 0.49,
    tw * 0.95,
    h * 0.105,
    Math.min(w * 0.065, h * 0.065),
    ink(accent),
    true,
    "center",
  );
  await text(
    "price",
    copy.price,
    tx,
    h * 0.635,
    tw,
    h * 0.052,
    Math.min(w * 0.042, h * 0.042),
    readableText,
    true,
    align,
  );
  await text(
    "benefits",
    copy.benefits.map((value) => "• " + value).join("\n"),
    tx,
    h * 0.71,
    tw,
    h * 0.15,
    Math.min(w * 0.029, h * 0.029),
    readableText,
    false,
    align,
  );
  if (copy.cta) {
    box("cta-band", tx, h * 0.91, tw, h * 0.06, textOnly ? primary : accent);
    await text(
      "cta",
      copy.cta,
      tx + tw * 0.025,
      h * 0.921,
      tw * 0.95,
      h * 0.04,
      Math.min(w * 0.029, h * 0.029),
      textOnly ? ink(primary) : ink(accent),
      true,
      "center",
    );
  }
  const backgroundPrompt = `Recurso fotográfico o ilustrado profesional para un afiche ${format}. Tema: ${copy.title}. Estilo y marca según el brief. Sitúa la persona o escena principal en el 40% derecho del lienzo, sin cortar la cabeza ni los elementos importantes. El 59% izquierdo se cubre con un panel ${primary}, la franja superior se cubre con logos reales. Trabaja profundidad, iluminación y presencia institucional en la zona derecha. SOLO EL RECURSO VISUAL: no dibujes letras, palabras, precios, logos, sellos, marcas de agua ni carteles; los textos exactos y logos se componen después con tipografía y archivos reales.`;
  return { design, backgroundPrompt };
}
