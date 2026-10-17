import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  creativeBrief,
  designSchema,
  planToDesign,
  renderDesign,
  validateManualChange,
  type Design,
} from "../lib/design";
const document: Design = {
  width: 1080,
  height: 1080,
  backgroundColor: "#f2f6f5",
  layers: [
    {
      id: "title",
      type: "text",
      x: 70,
      y: 80,
      width: 900,
      text: "Tratamiento de Aguas",
      fontSize: 64,
      color: "#163c32",
      font: "DejaVu Sans",
      align: "left",
    },
    {
      id: "price",
      type: "text",
      x: 70,
      y: 900,
      width: 300,
      text: "USD 40",
      fontSize: 28,
      color: "#163c32",
      font: "DejaVu Sans",
      align: "left",
    },
  ],
};
test("composición independiente se renderiza y modificar el precio cambia el PNG sin IA", async () => {
  const first = await renderDesign(document, null, new Map());
  const next = structuredClone(document);
  const price = next.layers[1];
  if (price.type === "text") price.fontSize = 20;
  const second = await renderDesign(next, null, new Map());
  assert(!first.equals(second));
  const meta = await sharp(second).metadata();
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1080);
});
test("se rechazan texto cortado, recursos ajenos, duplicados y valores peligrosos", async () => {
  const cropped = structuredClone(document);
  cropped.layers[0].y = 1070;
  await assert.rejects(
    renderDesign(cropped, null, new Map()),
    /corta|márgenes/,
  );
  assert.throws(() =>
    designSchema.parse({
      ...document,
      backgroundColor: "url(https://otro.test)",
    }),
  );
  assert.throws(() =>
    planToDesign(
      {
        backgroundPrompt: "",
        backgroundColor: "#ffffff",
        texts: [],
        logos: [
          {
            id: "x",
            attachmentId: "ajeno",
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
        ],
      },
      "1:1",
      [],
    ),
  );
  assert.throws(() =>
    validateManualChange(document, { ...document, width: 2000 }),
  );
});
test("texto con marcado se renderiza como contenido literal, sin ejecutar instrucciones", async () => {
  const d = structuredClone(document);
  if (d.layers[0].type === "text")
    d.layers[0].text = "<script>alert(1)</script> & precio USD 40";
  const png = await renderDesign(d, null, new Map());
  assert(png.length > 100);
});
test("logos mantienen proporción dentro de su área y solo admiten IDs autorizados", async () => {
  const logo = await sharp({
    create: { width: 200, height: 80, channels: 4, background: "#335577" },
  })
    .png()
    .toBuffer();
  const d: Design = {
    ...document,
    layers: [
      ...document.layers,
      {
        id: "brand",
        type: "logo",
        attachmentId: "autorizado",
        x: 800,
        y: 950,
        width: 200,
        height: 100,
      },
    ],
  };
  const output = await renderDesign(d, null, new Map([["autorizado", logo]]));
  assert(output.length > 100);
  await assert.rejects(renderDesign(d, null, new Map()), /logo/);
  assert.throws(() => validateManualChange(document, d), /ajeno/);
});
test("SVG simple se rasteriza; scripts, entidades y recursos remotos se rechazan", async () => {
  const { rasterizeSafeSvg } = await import("../lib/svg");
  const safe =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#335577"/></svg>';
  const png = await rasterizeSafeSvg(Buffer.from(safe));
  assert.equal((await sharp(png).metadata()).format, "png");
  for (const unsafe of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://otro.test/logo"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" onload="bad()"/></svg>',
  ])
    await assert.rejects(rasterizeSafeSvg(Buffer.from(unsafe)));
});

test("formas manuales cubren el fondo sin IA y respetan el orden de capas y los límites", async () => {
  const d = designSchema.parse({
    width: 512,
    height: 512,
    backgroundColor: "#176b59",
    layers: [
      {
        id: "cover",
        type: "shape",
        kind: "rectangle",
        x: 50,
        y: 50,
        width: 200,
        height: 100,
        color: "#ffffff",
      },
      {
        id: "dot",
        type: "shape",
        kind: "ellipse",
        x: 100,
        y: 60,
        width: 40,
        height: 40,
        color: "#ff0000",
      },
    ],
  });
  const bytes = await renderDesign(d, null, new Map());
  const pixel = await sharp(bytes).removeAlpha().raw().toBuffer();
  const rgb = (x: number, y: number) => [
    ...pixel.subarray((y * 512 + x) * 3, (y * 512 + x) * 3 + 3),
  ];
  assert.deepEqual(rgb(0, 0), [23, 107, 89]);
  assert.deepEqual(rgb(60, 60), [255, 255, 255]);
  assert.deepEqual(rgb(120, 80), [255, 0, 0]);
  const invalid = { ...d, layers: [{ ...d.layers[0], y: 500 }] };
  await assert.rejects(renderDesign(invalid, null, new Map()), /fuera/);
});

test("paleta de marca: elección automática explícita o colores propios sin inventar colores guardados", async () => {
  const { brandInstructions } = await import("../lib/brand");
  const kit = { sourcePolicy:{}, projectId:"synthetic-brand", name:"Marca de prueba", prompt:"Usar un estilo editorial.", colors:[] as string[], font:null, revision:1, updatedAt:new Date(0).toISOString(), logoAttachmentIds:[] };
  const automatic = brandInstructions(kit);
  assert(automatic.includes("Paleta libre"));
  assert(automatic.includes("tema del subproducto"));
  assert(!automatic.includes("#"));
  const custom = brandInstructions({ ...kit, colors:["#123456", "#abcdef"] });
  assert(custom.includes("Paleta de marca preferida: #123456, #abcdef"));
  assert(!custom.includes("Paleta libre"));
  assert.equal(brandInstructions(null), "");
});

test("dirección de arte distingue afiche completo, tipografía sin foto y capas sin pedir un fondo genérico",async()=>{
 const {artDirection}=await import("../lib/art-direction");
 const prompt="TERAPIA INFANTIL. S/40 por tres meses y luego S/20 mensual.";
 const professional=artDirection(prompt,"Imagen + Texto","1:1",0);
 assert(professional.includes(prompt));assert(professional.includes("afiche publicitario terminado"));assert(professional.includes("No generes solamente un fondo"));assert(professional.includes("titulares grandes y contundentes"));assert(professional.includes("columnas o módulos legibles"));assert(professional.includes("No traslades la palabra GRATIS"));
 const text=artDirection(prompt,"Texto","4:5",1);assert(text.includes("sin fotografías temáticas"));assert(text.includes("afiche tipográfico de diseño"));
 const image=artDirection(prompt,"Imagen","1:1",2);assert(image.includes("sin titulares, precios ni bloques de texto"));
 assert.notEqual(professional,artDirection(prompt,"Imagen + Texto","1:1",1));
 const layered=creativeBrief(artDirection(prompt,"Imagen + Texto","1:1",0,true),"1:1",[]);assert(layered.includes("no copies sus coordenadas ni color"));assert(layered.includes("sin dibujar letras ni logos"));
});

test("recuperación local conserva brief completo y reconoce JSON rodeado de Markdown sin aceptar capas inválidas",async()=>{
 const {completePosterPrompt,usableLayeredPlan}=await import("../lib/creative-recovery");
 const brief="Marca autorizada. TERAPIA INFANTIL. S/40 por tres meses y luego S/20. Documento de referencia: contexto autorizado.";
 for(const text of [""," \n ",'{"backgroundPrompt":',"```json\n{}\n```"]){const result=completePosterPrompt(brief,text);assert.equal(result.prompt,brief);assert.equal(result.recovered,true);}
 assert.equal(completePosterPrompt(brief,"Oferta parcial",true).prompt,brief);
 assert(completePosterPrompt(brief,"Fotografía cálida y titular dominante").prompt.includes(brief));
 const plan={backgroundPrompt:"Escena familiar",backgroundColor:"#ffffff",texts:[{id:"title",text:"TERAPIA INFANTIL",x:40,y:60,width:900,fontSize:90,color:"#123456",font:"DejaVu Sans",align:"left"}],logos:[]};
 assert(usableLayeredPlan("```json\n"+JSON.stringify(plan)+"\n```","1:1",[]));
 assert(usableLayeredPlan("Propuesta:\n"+JSON.stringify(plan),"1:1",[]));
 assert.equal(usableLayeredPlan(JSON.stringify({...plan,texts:[{...plan.texts[0],x:5000}]}),"1:1",[]),null);
 assert.equal(usableLayeredPlan(JSON.stringify({...plan,logos:[{id:"logo",attachmentId:"private",x:0,y:0,width:40,height:40}]}),"1:1",[]),null);
 assert.equal(usableLayeredPlan("{incompleto","1:1",[]),null);
});
