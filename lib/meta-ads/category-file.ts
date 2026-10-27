import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { categoryRows, parseCategoryText } from "./category-paste";
import { AppError, demand } from "../errors";
function decodeText(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
export async function parseCategoryFile(name: string, encoded: string) {
  demand(
    /\.(xlsx|csv|tsv|txt)$/i.test(name),
    "Usa un archivo Excel .xlsx, CSV, TSV o TXT.",
  );
  demand(/^[A-Za-z0-9+/]*={0,2}$/.test(encoded), "Archivo inválido.");
  const bytes = Buffer.from(encoded, "base64");
  demand(
    bytes.length > 0 && bytes.length <= 2000000,
    "El archivo admite hasta 2 MB.",
  );
  if (!/\.xlsx$/i.test(name))
    return {
      rows: parseCategoryText(decodeText(bytes), /\.csv$/i.test(name)),
      sheetName: null,
    };
  const zip = await JSZip.loadAsync(bytes);
  demand(
    Object.keys(zip.files).length <= 1000,
    "El Excel contiene demasiadas entradas.",
  );
  let expanded = 0;
  const xml = async (path: string) => {
    const file = zip.file(path);
    demand(file, "El Excel no contiene una hoja válida.");
    const declared = (
      file as unknown as { _data?: { uncompressedSize?: number } }
    )._data?.uncompressedSize;
    demand(
      typeof declared === "number" &&
        declared <= 8000000 &&
        expanded + declared <= 8000000,
      "El contenido del Excel supera 8 MB.",
    );
    expanded += declared;
    const content = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0,
        failed = false;
      const stream = file.nodeStream("nodebuffer");
      stream.on("data", (chunk: Uint8Array) => {
        if (failed) return;
        size += chunk.byteLength;
        if (size > declared || size > 8000000) {
          failed = true;
          stream.pause();
          reject(
            new AppError("El contenido del Excel supera el límite permitido."),
          );
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.on("error", reject);
      stream.on("end", () => {
        if (!failed) resolve(Buffer.concat(chunks));
      });
      stream.resume();
    });
    const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
    demand(
      text.length <= 8000000 && !/<!DOCTYPE|<!ENTITY/i.test(text),
      "XML no válido en el Excel.",
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
    }).parseFromString(text, "application/xml");
    demand(!invalid && doc.documentElement, "Excel no válido.");
    return doc;
  };
  const workbook = await xml("xl/workbook.xml"),
    rels = await xml("xl/_rels/workbook.xml.rels");
  const sheets = Array.from(workbook.getElementsByTagName("sheet"));
  const sheet =
    sheets.find(
      (s) => !s.getAttribute("state") || s.getAttribute("state") === "visible",
    ) ?? sheets[0];
  demand(sheet, "El Excel está vacío.");
  const rid = sheet.getAttribute("r:id"),
    rel = Array.from(rels.getElementsByTagName("Relationship")).find(
      (r) => r.getAttribute("Id") === rid,
    );
  demand(
    rel && rel.getAttribute("TargetMode") !== "External",
    "Hoja de Excel no válida.",
  );
  let target = rel.getAttribute("Target") ?? "";
  target = target.startsWith("/") ? target.slice(1) : "xl/" + target;
  demand(
    /^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(target),
    "Ruta de hoja no válida.",
  );
  let strings: string[] = [];
  if (zip.file("xl/sharedStrings.xml")) {
    const shared = await xml("xl/sharedStrings.xml");
    strings = Array.from(shared.getElementsByTagName("si")).map((si) =>
      Array.from(si.getElementsByTagName("t"))
        .map((t) => t.textContent ?? "")
        .join(""),
    );
  }
  const data = await xml(target),
    records: string[][] = [];
  for (const row of Array.from(data.getElementsByTagName("row"))) {
    const values: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r") ?? "",
        letters = ref.match(/^[A-Z]+/)?.[0];
      demand(letters, "Celda de Excel no válida.");
      const column =
        [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "",
        type = c.getAttribute("t");
      if (type === "s")
        demand(
          /^\d+$/.test(v) && Number(v) < strings.length,
          "Índice de texto no válido en el Excel.",
        );
      const content =
        type === "s"
          ? (strings[Number(v)] ?? "")
          : type === "inlineStr"
            ? Array.from(c.getElementsByTagName("t"))
                .map((t) => t.textContent ?? "")
                .join("")
            : v;
      demand(
        !c.getElementsByTagName("f").length,
        "Convierte las fórmulas a valores antes de importar categorías.",
      );
      if (!content.trim()) continue;
      demand(column < 2, "Usa solo las columnas A y B para las categorías.");
      values[column] = content;
    }
    if (values.some((v) => v?.trim()))
      records.push([values[0] ?? "", values[1] ?? ""]);
    demand(records.length <= 501, "Se admiten hasta 500 filas.");
  }
  return {
    rows: categoryRows(records),
    sheetName: sheet.getAttribute("name") ?? "Hoja 1",
  };
}
