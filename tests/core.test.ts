import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptKey, decryptKey, maskKey } from "../lib/crypto";
import {
  effectiveSettings,
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
test("precios múltiples se revisan sin bloqueo y proyectos independientes no heredan educación", () => {
  const result = resolveInstructions([
    { name: "Subproducto", prompt: "Precio USD 40 o S/90." },
  ]);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.advisories.length, 1);
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

test("OpenAI 429 diferencia cuota y límite temporal sin exponer la respuesta del proveedor", async () => {
  const { adapter } = await import("../lib/providers");
  const prior = globalThis.fetch;
  try {
    for (const [code, expected] of [
      ["insufficient_quota", /no tiene cuota o saldo/],
      ["rate_limit_exceeded", /límite temporal/],
      ["other", /límite de uso o saldo/],
    ] as const) {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ error: { code, message: "NO MOSTRAR secreto" } }),
          { status: 429 },
        );
      await assert.rejects(
        adapter("openai").listModels("clave-sintetica"),
        (error) =>
          error instanceof Error &&
          expected.test(error.message) &&
          !error.message.includes("NO MOSTRAR"),
      );
    }
  } finally {
    globalThis.fetch = prior;
  }
});

test("importes de conciliación: decimales exactos y rechazo de formatos ambiguos", async () => {
  const { parseUsdMicros } = await import("../lib/usage-format");
  assert.equal(parseUsdMicros("0"), 0n);
  assert.equal(parseUsdMicros("0.000001"), 1n);
  assert.equal(parseUsdMicros("1,234567"), 1234567n);
  assert.equal(parseUsdMicros("999999999.999999"), 999999999999999n);
  for (const value of [
    "",
    "1e3",
    "-1",
    "+1",
    "1.0000001",
    "1,000.00",
    "01",
    "NaN",
    "1000000000",
  ])
    assert.equal(parseUsdMicros(value), null, value);
});

test("gasto diario del proveedor: fechas UTC, importes, paginación y rechazo sin datos inventados", async () => {
  const { billingRange, reportedMicros, openaiDailyCosts } =
    await import("../lib/provider-costs");
  assert.throws(() => billingRange("2026-02-30", "2026-03-01"));
  assert.throws(() => billingRange("2026-01-01", "2026-02-01"));
  assert.equal(reportedMicros("1.2345678").micros, 1234568n);
  assert.equal(reportedMicros("-0.0000005").micros, -1n);
  assert.equal(reportedMicros(1e-7).rounded, true);
  assert.throws(() => reportedMicros(null));
  const { start } = billingRange("2026-01-01", "2026-01-03");
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    assert.equal(options?.method, undefined);
    assert.equal(options?.cache, "no-store");
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer synthetic-key",
    );
    const query = new URL(String(url));
    assert.equal(query.pathname, "/v1/organization/costs");
    assert.equal(query.searchParams.get("bucket_width"), "1d");
    calls++;
    if (calls === 1)
      return Response.json({
        data: [
          {
            start_time: start,
            results: [{ amount: { currency: "usd", value: "0.1234567" } }],
          },
        ],
        has_more: true,
        next_page: "next",
      });
    assert.equal(query.searchParams.get("page"), "next");
    return Response.json({
      data: [{ start_time: start + 86400, results: [] }],
      has_more: false,
      next_page: null,
    });
  };
  const report = await openaiDailyCosts(
    "synthetic-key",
    "2026-01-01",
    "2026-01-03",
    transport,
  );
  assert.equal(calls, 2);
  assert.equal(report.totalMicros, "123457");
  assert.equal(report.rounded, true);
  assert.deepEqual(report.rows, [
    { day: "2026-01-01", micros: "123457" },
    { day: "2026-01-02", micros: null },
  ]);
  assert(!JSON.stringify(report).includes("synthetic-key"));
  await assert.rejects(
    openaiDailyCosts(
      "x",
      "2026-01-01",
      "2026-01-01",
      async () => new Response("private body", { status: 403 }),
    ),
    /administrativa/,
  );
  await assert.rejects(
    openaiDailyCosts("x", "2026-01-01", "2026-01-01", async () =>
      Response.json({
        data: [
          {
            start_time: start,
            results: [{ amount: { currency: "eur", value: 1 } }],
          },
        ],
      }),
    ),
    /moneda/,
  );
  const empty = await openaiDailyCosts(
    "x",
    "2026-01-01",
    "2026-01-01",
    async () => Response.json({ data: [] }),
  );
  assert.equal(empty.totalMicros, null);
  await assert.rejects(
    openaiDailyCosts("x", "2026-01-01", "2026-01-01", async () =>
      Response.json({
        data: [
          { start_time: start, results: [] },
          { start_time: start, results: [] },
        ],
      }),
    ),
    /repitió/,
  );
});

test("cola interactiva pausa después del actual y reanuda sin repetir intentos", async () => {
  const { InteractiveQueue } = await import("../lib/interactive-queue");
  const queue = new InteractiveQueue(() => {});
  queue.load(["a", "b", "c", "b"]);
  const attempts: string[] = [];
  let finish!: () => void;
  const first = queue.run(async (id) => {
    attempts.push(id);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  assert.equal(queue.current, "a");
  queue.pause();
  await queue.run(async (id) => {
    attempts.push(id);
  }); // concurrent resume cannot dispatch
  finish();
  await first;
  assert.deepEqual(attempts, ["a"]);
  assert.deepEqual(queue.pending, ["b", "c"]);
  await queue.run(async (id) => {
    attempts.push(id);
  });
  assert.deepEqual(attempts, ["a", "b", "c"]);
  assert.equal(queue.running, false);
});

test("detener descarta los siguientes y conserva el intento en curso", async () => {
  const { InteractiveQueue } = await import("../lib/interactive-queue");
  const queue = new InteractiveQueue(() => {});
  queue.load(["a", "b", "c"]);
  const attempts: string[] = [];
  let finish!: () => void;
  const running = queue.run(async (id) => {
    attempts.push(id);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  assert.deepEqual(queue.stop(), ["b", "c"]);
  assert.equal(queue.current, "a");
  finish();
  await running;
  await queue.run(async (id) => {
    attempts.push(id);
  });
  assert.deepEqual(attempts, ["a"]);
  assert.equal(queue.last, "a");
});

test("un cargo incierto interrumpe la cola y nunca se reintenta al reanudar", async () => {
  const { InteractiveQueue } = await import("../lib/interactive-queue");
  const queue = new InteractiveQueue(() => {});
  queue.load(["incierto", "siguiente"]);
  const attempts: string[] = [];
  await assert.rejects(
    queue.run(async (id) => {
      attempts.push(id);
      throw Error("resultado incierto");
    }),
    /incierto/,
  );
  assert.equal(queue.paused, true);
  await queue.run(async (id) => {
    attempts.push(id);
  });
  assert.deepEqual(attempts, ["incierto", "siguiente"]);
});


test("ofertas por etapas conservan promoción y mensualidad sin exigir un precio único",()=>{const result=resolveInstructions([{name:"Proyecto",prompt:"S/40 por los primeros 3 meses."},{name:"Subproducto",prompt:"Luego S/20 por mes. Mostrar ambos períodos."}]);assert(result.text.includes("S/40"));assert(result.text.includes("S/20"));assert.equal(result.warnings.length,0);const same=resolveInstructions([{name:"Subproducto",prompt:"S/40 por tres meses y luego S/20 mensuales."}]);assert.equal(same.warnings.length,0);assert(same.text.includes("S/40"));assert(same.text.includes("S/20"));});

test("políticas de instrucciones respetan desactivaciones sin borrar texto", async()=>{const {instructionUse}=await import("../lib/instruction-policy");assert.deepEqual(instructionUse({},{},{}),{project:true,product:true,subproduct:true});assert.equal(instructionUse({includeSelf:false},{},{includeProject:true}).project,false);assert.equal(instructionUse({},{includeProject:false},{}).project,false);assert.deepEqual(instructionUse({},{},{includeProject:false,includeProduct:false,includeSelf:false}),{project:false,product:false,subproduct:false});assert.equal(instructionUse({},{},{},false).product,false);});

test("acabado profesional por defecto, incluso para el editable heredado; capas solo al elegirlas",()=>{
 assert.equal(effectiveSettings({editable:true},{},true).editable,false);
 assert.equal(effectiveSettings({editable:true},{},true).designMode,"professional");
 assert.equal(effectiveSettings({designMode:"editable"},{},true).editable,true);
 assert.equal(effectiveSettings({designMode:"editable"},{designMode:"professional"},true).editable,false);
 assert.equal(effectiveSettings({designMode:"editable"},{},false).designMode,"professional");
});

test("Medio predeterminado y niveles de razonamiento siguen la herencia sin cambiar el acabado profesional",()=>{
 for(const level of ["low","medium","high"] as const){const value=effectiveSettings({reasoningLevel:level},null);assert.equal(value.reasoningLevel,level);assert.equal(value.designMode,"professional");}
 assert.equal(effectiveSettings({},{}).reasoningLevel,"medium");
 assert.equal(effectiveSettings({reasoningLevel:"high"},{reasoningLevel:"low"}).reasoningLevel,"low");
 assert.equal(effectiveSettings({reasoningLevel:"high"},{},false).reasoningLevel,"medium");
 assert.equal(effectiveSettings({reasoningLevel:"invalid"},{}).reasoningLevel,"medium");
});


test("recuperación de orden distingue muestra aprobada, pendientes y cargos inciertos sin ocultar el motivo",async()=>{
 const {orderRecovery,continuationError}=await import("../lib/order-recovery");
 const sample={status:"COMPLETED",snapshot:{previewFirst:true,index:0},variation:{reviewStatus:"APPROVED",deletedAt:null}},pending={status:"PENDING",snapshot:{previewFirst:true,index:1}};
 const r=orderRecovery("NEEDS_REVIEW",[sample,pending],"Error",true);assert.equal(r.canContinuePending,true);assert(r.error?.includes("interrumpió"));assert(r.recoveryHint?.includes("no se vuelven a generar"));
 assert.equal(orderRecovery("NEEDS_REVIEW",[{...sample,variation:{reviewStatus:"PENDING",deletedAt:null}},pending],null,true).canApproveSample,true);
 assert.equal(orderRecovery("NEEDS_REVIEW",[sample,pending],null,false).canContinuePending,false);
 for(const status of ["FAILED","UNCERTAIN","RUNNING"]){const blocked=orderRecovery("NEEDS_REVIEW",[sample,pending,{status,snapshot:{}}],null,true);assert.equal(blocked.canContinuePending,false);assert.equal(blocked.canApproveSample,false);}
 assert.equal(orderRecovery("STOPPED",[sample,{...pending,status:"UNCERTAIN",error:"Error anterior privado"}],null,true).error,null);
 assert.equal(orderRecovery("NEEDS_REVIEW",[sample,pending],"El OWNER debe guardar y verificar la conexión de IA.",true).needsConnectionReview,true);
 assert(!continuationError(new Error("SQL con un secreto sintético")).includes("secreto"));assert(continuationError(new Error("interno")).includes("ORDEN_CONTINUACION"));
});


test("Paginación de Biblioteca mezcla referencias y originales con empates, páginas profundas y fuentes vacías",async()=>{
 const {mergedPage}=await import("../lib/library-organization");
 for(const ascending of [true,false])for(const sizes of [[500,307],[0,27],[27,0],[0,0]]){
  const compare=(a:{id:string;createdAt:Date},b:{id:string;createdAt:Date})=>(a.createdAt.getTime()-b.createdAt.getTime())*(ascending?1:-1)||a.id.localeCompare(b.id);
  const a=Array.from({length:sizes[0]},(_,i)=>({id:"a"+i.toString().padStart(4,"0"),createdAt:new Date(1000*(i%100))})).sort(compare);
  const b=Array.from({length:sizes[1]},(_,i)=>({id:"b"+i.toString().padStart(4,"0"),createdAt:new Date(1000*(i%100))})).sort(compare);
  for(const offset of [0,1,24,25,400,806,807,999]){
   let reads=0;const read=(rows:typeof a)=>async(skip:number,take:number)=>{reads++;return rows.slice(skip,skip+take);};
   const result=await mergedPage(a.length,b.length,offset,25,ascending,read(a),read(b));
   assert.deepEqual(result,[...a,...b].sort(compare).slice(offset,offset+25));assert(reads<24);
  }
 }
});
test('motores explícitos y recursos propios: sin fallback facturable, herencia de carpetas y relevancia por tema',async()=>{
 const {requireEngine,engineDefaults}=await import('../lib/generation-engines');const {folderDescendants,storageRelevance}=await import('../lib/resource-storage');
 const local={...engineDefaults,aiEnabled:false,propioxEnabled:true,defaultEngine:'propiox'};assert.equal(requireEngine(local,undefined),'propiox');assert.throws(()=>requireEngine(local,'ai'),/IA está desactivada/);assert.throws(()=>requireEngine(local,'hybrid'),/IA está desactivada/);assert.throws(()=>requireEngine(engineDefaults,'propiox'),/Activa PropioX/);assert.equal(requireEngine({...engineDefaults,propioxEnabled:true},'hybrid'),'hybrid');
 assert.deepEqual(folderDescendants([{id:'a',parentId:null},{id:'b',parentId:'a'},{id:'c',parentId:'b'},{id:'otro',parentId:null}],'a'),['a','b','c']);assert(storageRelevance('PSICOLOGÍA forense.png','','Psicología Forense')>storageRelevance('Ambiental.png','','Psicología Forense'));assert.equal(storageRelevance('Foto.png','Evaluación de psicología forense','PSICOLOGIA FORENSE'),2);
});
test('archivos de 1 GB: límite inclusivo y fragmentos acotados sin reservar buffers grandes',async()=>{
 const {maxResourceFileBytes,uploadChunkBytes,expectedChunkBytes,resourceFilename,largeFileMime}=await import('../lib/large-upload-limits');assert.equal(maxResourceFileBytes,1073741824);assert.equal(expectedChunkBytes(maxResourceFileBytes,511),uploadChunkBytes);assert.equal(expectedChunkBytes(maxResourceFileBytes,512),0);assert.equal(expectedChunkBytes(maxResourceFileBytes+1,0),0);assert.equal(expectedChunkBytes(uploadChunkBytes+7,1),7);assert.equal(resourceFilename('carpeta/subcarpeta/referencia.png'),'referencia.png');assert.equal(largeFileMime('documento.pdf'),'application/pdf');assert.equal(largeFileMime('activo.html'),null);
});
