import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptKey, decryptKey, maskKey } from "../lib/crypto";
import {
  resolveInstructions,
  validateDistribution,
  defaults,
} from "../lib/inheritance";
import { compatibleModels, providerError } from "../lib/providers";
import { validateUpload } from "../lib/uploads";
test("credenciales: cifrado autenticado, aleatorio, contextual y sin exposición", () => {
  process.env.AI_MASTER_KEY = randomBytes(32).toString("base64");
  const key = "sk-secreto-prueba-0123456789";
  const a = encryptKey(key),
    b = encryptKey(key);
  assert.notEqual(a, b);
  assert(!a.includes(key));
  assert.equal(decryptKey(a), key);
  assert.equal(maskKey(key), "••••••••6789");
  assert.throws(() => decryptKey(a, "otro-proveedor"));
  const pieces = a.split(".");
  pieces[3] = Buffer.from("alterado").toString("base64");
  assert.throws(() => decryptKey(pieces.join(".")));
  process.env.AI_MASTER_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptKey(a));
});
test("no se aceptan claves maestras débiles ni se guarda sin cifrado", () => {
  process.env.AI_MASTER_KEY = "corta";
  assert.throws(() => encryptKey("secreto"));
});
test("herencia: Ecuador y USD 40 reemplazan el precio y mercado heredados", () => {
  const result = resolveInstructions([
    { name: "Proyecto", prompt: "Diseño institucional." },
    {
      name: "Categoría",
      prompt:
        "Todos los afiches serán para Perú. Mostrar Mensualidades Gratis. Pago único S/90. Precio pequeño.",
    },
    {
      name: "Subproducto",
      prompt:
        "Este diplomado será para Ecuador. El precio es USD 40. No utilizar logos gubernamentales exclusivos de Perú.",
    },
  ]);
  assert(!result.text.includes("S/90"));
  assert(!result.text.includes("serán para Perú"));
  assert(result.text.includes("USD 40"));
  assert(result.text.includes("Mensualidades Gratis"));
  assert(result.text.includes("No utilizar logos"));
  assert.equal(result.warnings.length, 0);
});
test("precios ambiguos bloquean generación y proyectos independientes no heredan educación", () => {
  const result = resolveInstructions([
    { name: "Subproducto", prompt: "Precio USD 40 o S/90." },
  ]);
  assert.equal(result.warnings.length, 1);
  assert(
    !resolveInstructions([
      { name: "Proyecto", prompt: "Vender cortinas." },
    ]).text.includes("Diplomados"),
  );
});
test("distribución de 10 afiches 3 texto + 7 imagen y límites por solicitud", () => {
  validateDistribution({
    ...defaults,
    count: 10,
    textCount: 3,
    imageTextCount: 7,
  });
  assert.throws(() =>
    validateDistribution({
      ...defaults,
      count: 10,
      textCount: 3,
      imageTextCount: 8,
    }),
  );
  assert.throws(() =>
    validateDistribution({ ...defaults, count: 13, imageTextCount: 13 }),
  );
  assert.throws(() =>
    validateDistribution({ ...defaults, textCount: -1, imageTextCount: 2 }),
  );
});
test("catálogo solo incluye modelos devueltos y compatibles, no modelos supuestos", () => {
  assert.deepEqual(compatibleModels([]), []);
  assert.deepEqual(compatibleModels(["desconocido"]), []);
  assert.deepEqual(
    compatibleModels(["gpt-image-1", "gpt-4.1-mini"]).map((x) => x.kind),
    ["image", "creative"],
  );
  assert(!providerError(401).includes("sk-"));
});
test("adjuntos: rechaza un ejecutable renombrado y no ejecuta HTML", async () => {
  await assert.rejects(
    validateUpload(new File(["<script>bad</script>"], "logo.png")),
  );
  await assert.rejects(
    validateUpload(new File(['<svg onload="bad()"/>'], "logo.svg")),
  );
  const result = await validateUpload(new File(["Precio USD 40"], "datos.txt"));
  assert.equal(result.text, "Precio USD 40");
  assert.equal(result.mime, "text/plain");
});
test("las proporciones se adaptan con márgenes, nunca deformación", async () => {
  const sharp = (await import("sharp")).default;
  const { adaptImage } = await import("../lib/render");
  const source = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#116655" },
  })
    .png()
    .toBuffer();
  for (const format of ["1:1", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16"]) {
    const b = await adaptImage(source, format);
    const meta = await sharp(b).metadata();
    const [w, h] = format.split(":").map(Number);
    assert.equal(meta.width! * h, meta.height! * w);
  }
});

test("adaptador OpenAI: petición real construida, catálogo limitado y errores sin secretos (transporte simulado)", async () => {
  const { adapter } = await import("../lib/providers");
  const p = adapter("openai");
  const original = globalThis.fetch;
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          data: [
            { id: "gpt-image-1" },
            { id: "gpt-4.1-mini" },
            { id: "incompatible" },
          ],
        }),
        { status: 200 },
      );
    };
    assert.equal((await p.listModels("clave-sintetica")).length, 2);
    assert.equal(calls[0].url, "https://api.openai.com/v1/models");
    const bytes = await (
      await import("sharp")
    )
      .default({
        create: { width: 32, height: 32, channels: 3, background: "#fff" },
      })
      .png()
      .toBuffer();
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          data: [{ b64_json: bytes.toString("base64") }],
          usage: { input_tokens: 1 },
        }),
        { status: 200 },
      );
    };
    const r = await p.generate("clave-sintetica", {
      model: "gpt-image-1",
      prompt: "Prueba de contrato",
      quality: "low",
      size: "1024x1024",
    });
    assert(r.bytes.equals(bytes));
    assert.equal(calls[1].url, "https://api.openai.com/v1/images/generations");
    assert.equal(
      JSON.parse(calls[1].init!.body as string).model,
      "gpt-image-1",
    );
    await p.generate("clave-sintetica", {
      model: "gpt-image-1",
      prompt: "Referencia",
      quality: "low",
      size: "1024x1024",
      images: [{ bytes, mime: "image/png" }],
    });
    assert.equal(calls[2].url, "https://api.openai.com/v1/images/edits");
    assert(calls[2].init!.body instanceof FormData);
    assert.equal((calls[2].init!.body as FormData).getAll("image[]").length, 1);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "clave-sintetica" } }), {
        status: 401,
      });
    await assert.rejects(
      p.listModels("clave-sintetica"),
      (e) =>
        e instanceof Error &&
        e.message.includes("no es válida") &&
        !e.message.includes("clave-sintetica"),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("documentos PDF y DOCX se extraen convencionalmente sin IA", async () => {
  const stream = "BT /F1 12 Tf 20 100 Td (Datos autorizados USD 40) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [o, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${o + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await validateUpload(new File([pdf], "datos.pdf"));
  assert(result.text.includes("USD 40"));
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Datos autorizados USD 40</w:t></w:r></w:p></w:body></w:document>',
  );
  const docx = await validateUpload(
    new File(
      [new Uint8Array(await zip.generateAsync({ type: "nodebuffer" }))],
      "datos.docx",
    ),
  );
  assert(docx.text.includes("USD 40"));
});

test("importes en microUSD conservan seis decimales y precisión fuera del rango Number", async () => {
  const { usdMicros } = await import("../lib/usage-format");
  assert.equal(usdMicros(null), "No informado");
  assert.equal(usdMicros("0"), "0.000000");
  assert.equal(usdMicros("1"), "0.000001");
  assert.equal(usdMicros("9007199254740993"), "9007199254.740993");
  assert.equal(usdMicros(-1n), "-0.000001");
});
