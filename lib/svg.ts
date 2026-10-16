import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import sharp from "sharp";
import { demand, AppError } from "./errors";
// Deliberately small allowlist. SVG is rasterized; active XML is never served.
const tags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
]);
const attrs = new Set([
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "cx",
  "cy",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "points",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "rx",
  "ry",
  "r",
  "x1",
  "x2",
  "y1",
  "y2",
  "transform",
  "fill-rule",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "version",
]);
export async function rasterizeSafeSvg(bytes: Buffer) {
  const source = bytes.toString("utf8");
  demand(
    source.length <= 1000000 && !/<!DOCTYPE|<!ENTITY/i.test(source),
    "SVG no admitido: contiene declaraciones XML externas o supera 1 MB.",
  );
  let invalid = false;
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {
        invalid = true;
      },
      error: () => {
        invalid = true;
      },
      fatalError: () => {
        invalid = true;
      },
    },
  }).parseFromString(source, "image/svg+xml");
  demand(
    !invalid &&
      doc.documentElement?.tagName === "svg" &&
      doc.documentElement.namespaceURI === "http://www.w3.org/2000/svg",
    "El archivo SVG no es válido.",
  );
  let count = 0;
  function walk(node: Node) {
    demand(++count < 10000, "El SVG contiene demasiados elementos.");
    if (node.nodeType === 1) {
      const e = node as Element;
      demand(
        tags.has(e.tagName) && e.namespaceURI === "http://www.w3.org/2000/svg",
        "El SVG contiene un elemento no permitido. Convierte el recurso a PNG.",
      );
      for (let i = 0; i < e.attributes.length; i++) {
        const a = e.attributes.item(i)!;
        demand(
          (attrs.has(a.name) &&
            !/[<>]|url\s*\(|javascript:|data:|https?:/i.test(a.value)) ||
            (a.name === "xmlns" && a.value === "http://www.w3.org/2000/svg"),
          "El SVG contiene estilos, enlaces o contenido activo no permitido.",
        );
      }
    } else
      demand(
        [3, 4, 8, 9].includes(node.nodeType),
        "El SVG contiene instrucciones no permitidas.",
      );
    for (let child = node.firstChild; child; child = child.nextSibling)
      walk(child as unknown as Node);
  }
  walk(doc as unknown as Node);
  try {
    const image = sharp(
      Buffer.from(new XMLSerializer().serializeToString(doc)),
      { limitInputPixels: 20000000 },
    );
    const m = await image.metadata();
    demand(
      m.width && m.height && m.width * m.height <= 20000000,
      "El SVG supera el límite de resolución.",
    );
    return await image.png().toBuffer();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("No se pudo convertir el SVG. Utiliza una versión PNG.");
  }
}
