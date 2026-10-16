import { demand } from "./errors";
export async function validateUpload(file: File) {
  let bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase();
  let mime = "",
    text = "";
  if (ext === "txt" || ext === "csv") {
    demand(!bytes.includes(0), "El archivo de texto contiene datos binarios.");
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    demand(
      text.length < 100000,
      "El texto supera el límite de 100.000 caracteres.",
    );
    mime = ext === "csv" ? "text/csv" : "text/plain";
  } else if (["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) {
    if (ext === "png")
      demand(
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        "PNG no válido.",
      );
    if (ext === "jpg" || ext === "jpeg")
      demand(
        bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
        "JPEG no válido.",
      );
    if (ext === "webp")
      demand(
        bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP",
        "WebP no válido.",
      );
    const sharp = (await import("sharp")).default;
    const meta = await sharp(bytes, { limitInputPixels: 20000000 }).metadata();
    demand(
      meta.width && meta.height && meta.width * meta.height <= 20000000,
      "La imagen supera 20 megapíxeles.",
    );
    mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
  } else if (ext === "svg") {
    const { rasterizeSafeSvg } = await import("./svg");
    bytes = await rasterizeSafeSvg(bytes);
    mime = "image/png";
  } else if (ext === "pdf") {
    demand(bytes.toString("ascii", 0, 5) === "%PDF-", "PDF no válido.");
    mime = "application/pdf";
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const info = await parser.getInfo();
      demand(info.total <= 100, "El PDF supera 100 páginas.");
      text = (await parser.getText()).text;
      demand(text.length <= 100000, "El documento supera 100.000 caracteres.");
    } finally {
      await parser.destroy();
    }
  } else if (ext === "docx") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files);
    demand(
      entries.length <= 1000,
      "El documento contiene demasiados archivos internos.",
    );
    const size = entries.reduce(
      (sum, f) =>
        sum +
        ((f as unknown as { _data?: { uncompressedSize: number } })._data
          ?.uncompressedSize ?? 0),
      0,
    );
    demand(size <= 30000000, "El documento expandido supera 30 MB.");
    demand(
      Boolean(zip.file("word/document.xml")),
      "El archivo no es un DOCX válido.",
    );
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: bytes })).value;
    demand(text.length <= 100000, "El documento supera 100.000 caracteres.");
    mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else {
    demand(
      false,
      "Formato no admitido. Usa TXT, CSV, PDF, DOCX, PNG, JPG, WebP o SVG simple sin contenido activo.",
    );
  }
  return { bytes, mime, text };
}
