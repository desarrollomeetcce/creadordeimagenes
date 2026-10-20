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

test("copy literal forense: textos exactos, variantes independientes y render local sin IA",async()=>{
 const {readFile}=await import("node:fs/promises"),{extractFlyerCopy,oneFlyerBrief}=await import("../lib/flyer-copy"),{exactFlyer}=await import("../lib/exact-flyer");
 const prompt=await readFile("tests/fixtures/forensic-brief.txt","utf8");
 const visual=oneFlyerBrief(prompt+"\nEJE TEMÁTICO OBLIGATORIO: Forense.\nDocumento: contexto heredado.","Imagen + Texto",0),typography=oneFlyerBrief(prompt,"Texto",1);
 assert(!visual.includes("VARIACIÓN 2"));assert(visual.includes("Documento: contexto heredado"));assert(typography.includes("VARIACIÓN 2"));assert(!typography.includes("VARIACIÓN 1"));
 const copy=extractFlyerCopy(visual)!;assert.equal(copy.title,"DIPLOMADO EN PSICOLOGÍA FORENSE");assert.equal(copy.offer,"MENSUALIDADES GRATIS");assert.equal(copy.price,"Pago único $40 USD");assert.deepEqual(copy.brands,["Cámara Nacional de Negocios","WOSA","ISO 9001","ISO 22001"]);assert(!JSON.stringify(copy).includes("Ministerio"));assert(!JSON.stringify(copy).includes("Perú"));
 const {design}=await exactFlyer(copy,"1:1","Texto",[],[]);const bytes=await renderDesign(design,null,new Map());const meta=await sharp(bytes).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1080);assert(design.layers.some(l=>l.type==="text"&&l.text==="Pago único $40 USD"));
 const bright=await exactFlyer(copy,"1:1","Texto",["#ffff00","#ffffff"],[]);assert(bright.design.layers.some(l=>l.type==="text"&&l.id==="headline"&&l.color==="#102a43"));
 assert.equal(extractFlyerCopy("Crea un flyer sin datos comerciales explícitos"),null);
 const updated=extractFlyerCopy(prompt+"\n### PRECIO\n**Pago único $50 USD**")!;assert.equal(updated.price,"Pago único $50 USD");
});

test("tiradores de edición respetan límites, conservan tipo y cambian ancho/tamaño de texto",async()=>{
 const {resizeLayer}=await import("../lib/editor-geometry");
 const shape={id:"s",type:"shape" as const,kind:"rectangle" as const,x:100,y:100,width:200,height:100,color:"#ffffff"};
 assert.deepEqual(resizeLayer(shape,"se",60,30,{width:1080,height:1080},100),{...shape,width:260,height:130});
 const bounds=resizeLayer(shape,"nw",-500,-500,{width:1080,height:1080},100);assert.equal(bounds.x,0);assert.equal(bounds.y,0);assert.equal(bounds.width,300);
 const text={id:"t",type:"text" as const,x:30,y:30,width:300,fontSize:40,font:"DejaVu Sans" as const,color:"#ffffff",align:"left" as const,text:"MENSAJE"};
 const wider=resizeLayer(text,"e",100,0,{width:1080,height:1080},50);assert.equal(wider.width,400);assert(wider.type==="text"&&wider.fontSize===40);
 const bigger=resizeLayer(text,"se",100,50,{width:1080,height:1080},50);assert(bigger.type==="text"&&bigger.fontSize===80);
});


test("copy explícito admite etiquetas sin Markdown, campos opcionales y aísla documentos del texto comercial",async()=>{
 const {extractFlyerCopy}=await import("../lib/flyer-copy");
 const copy=extractFlyerCopy("Título principal: DIPLOMADO EN PSICOLOGÍA FORENSE\nOferta: MENSUALIDADES GRATIS\nPrecio: Pago único $40 USD\nBeneficios:\n- Evaluación forense\n- Informes periciales\nCTA: SOLICITA INFORMACIÓN\nEJE TEMÁTICO OBLIGATORIO: Forense.\nContexto documental no confiable:\n### PRECIO\n**$999**")!;
 assert.equal(copy.title,"DIPLOMADO EN PSICOLOGÍA FORENSE");assert.equal(copy.offer,"MENSUALIDADES GRATIS");assert.equal(copy.price,"Pago único $40 USD");assert.equal(copy.cta,"SOLICITA INFORMACIÓN");assert.deepEqual(copy.benefits,["Evaluación forense","Informes periciales"]);
 const free=extractFlyerCopy("**TÍTULO:** Taller de fotografía\nFRASE DE IMPACTO\nAprende a mirar de otra manera")!;assert.equal(free.title,"Taller de fotografía");assert.equal(free.price,"");assert.equal(free.offer,"");
});
test("composición literal adapta el área visual por formato y reserva el texto al compositor",async()=>{
 const {extractFlyerCopy}=await import("../lib/flyer-copy"),{exactFlyer,visualOnlyContext}=await import("../lib/exact-flyer");
 const brief="Título: PSICOLOGÍA FORENSE\nOferta: MENSUALIDADES GRATIS\nPrecio: Pago único $40 USD\nFotografía profesional de una especialista revisando informes en un estudio legal.\nEl título debe ser grande. Los logos deben ir arriba.\nContexto documental no confiable:\ninforme.txt: Documento de revisión de referencia";
 const copy=extractFlyerCopy(brief)!;
 assert(!visualOnlyContext(brief).includes("MENSUALIDADES GRATIS"));assert(!visualOnlyContext(brief).includes("logos deben"));assert(visualOnlyContext(brief).includes("Documento de revisión"));
 for(const format of ["1:1","4:3","3:4","4:5","5:4","16:9","9:16"]){const composition=await exactFlyer(copy,format,"Imagen + Texto",[],[],{index:1,brief});const png=await renderDesign(composition.design,null,new Map());assert(png.length>1000);assert(!composition.backgroundPrompt.includes("MENSUALIDADES GRATIS"));assert(composition.backgroundPrompt.includes("SOLO EL RECURSO VISUAL"));}
 const left=await exactFlyer(copy,"1:1","Imagen + Texto",[],[],{index:0,brief}),right=await exactFlyer(copy,"1:1","Imagen + Texto",[],[],{index:1,brief});assert.notEqual(left.design.layers.find(l=>l.id==="copy-panel")!.x,right.design.layers.find(l=>l.id==="copy-panel")!.x);
});


test("variaciones explícitas conservan orden, cantidad y un máximo de llamadas de imagen",async()=>{
 const {flyerModes,oneFlyerBrief}=await import("../lib/flyer-copy");
 const prompt="Título: Tema\nVARIACIÓN 1 — CON IMAGEN\nFotografía profesional\nVARIACIÓN 2 — SOLO TEXTO\nFondo blanco";
 assert.deepEqual(flyerModes(prompt,["Imagen + Texto","Imagen + Texto"]),["Imagen + Texto","Texto"]);
 assert.deepEqual(flyerModes(prompt,["Texto","Imagen + Texto"]),["Imagen + Texto","Texto"]);
 assert.deepEqual(flyerModes(prompt,["Texto","Texto"]),["Texto","Texto"]);
 assert.deepEqual(flyerModes(prompt,["Imagen + Texto"]),["Imagen + Texto"]);
 assert(!oneFlyerBrief(prompt,"Texto",1).includes("VARIACIÓN 1"));
});
test("PropioX: texto literal, fotos propias, resolución y dirección híbrida sin red",async()=>{
 const {composePropiox,propioxCopy,hybridDirectionPrompt}=await import('../lib/propiox');
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('La composición local no puede usar la red');};
 try{
  const copy=propioxCopy('Oferta: MENSUALIDADES GRATIS\nPrecio: Pago único $40 USD\nBeneficios: Evaluación forense; Peritaje psicológico\nCTA: SOLICITA INFORMACIÓN','PSICOLOGÍA FORENSE');
  assert.equal(copy.title,'PSICOLOGÍA FORENSE');assert.equal(copy.price,'Pago único $40 USD');assert.equal(copy.cta,'SOLICITA INFORMACIÓN');assert.equal(copy.benefits.length,2);
  assert.equal(propioxCopy('Diseño institucional limpio','Servicio').price,'');
  const photo=await sharp({create:{width:640,height:800,channels:3,background:'#bcd4e6'}}).png().toBuffer();
  const args={subject:'PSICOLOGÍA FORENSE',prompt:'Título: DIPLOMADO EN PSICOLOGÍA FORENSE\nOferta: MENSUALIDADES GRATIS\nPrecio: Pago único $40 USD',format:'1:1',mode:'Imagen + Texto',index:0,quality:'high',resolution:'1024x1024',resources:[{id:'foto',name:'Psicología forense.png',purpose:'Fotografía principal',mime:'image/png',bytes:photo}]};
  const local=await composePropiox(args);const meta=await sharp(local.bytes).metadata();assert.equal(meta.width,1024);assert.equal(meta.height,1024);assert(local.background);assert(local.design.layers.some(l=>l.type==='text'&&l.text.includes('PSICOLOGÍA FORENSE')));
  const hybrid=await composePropiox({...args,resolution:'1536x1536',direction:'{"layout":"right","palette":["#203040","#ffbb33"]}'});assert.equal(hybrid.design.width,1536);assert.equal(hybrid.design.backgroundColor,'#203040');assert(hybrid.design.layers.find(l=>l.id==='copy-panel')!.x>0);
  const brand=await composePropiox({...args,colors:['#102030','#ffee22'],direction:'{"palette":["#ff0000","#ffffff"]}'});assert.equal(brand.design.backgroundColor,'#102030');
  const fs=await import('node:fs/promises'),forensicBrief=await fs.readFile('tests/fixtures/forensic-brief.txt','utf8');const branded=await composePropiox({...args,prompt:forensicBrief,mode:'Texto',resources:[{id:'wosa',name:'WOSA.png',purpose:'Logo',mime:'image/png',bytes:photo},{id:'min',name:'ministerio.png',purpose:'Logo',mime:'image/png',bytes:photo}]});assert(branded.design.layers.some(l=>l.type==='logo'&&l.attachmentId==='wosa'));assert(!branded.design.layers.some(l=>l.type==='logo'&&l.attachmentId==='min'));
  const text=await composePropiox({...args,mode:'Texto',resources:[],quality:'low'});assert.equal(text.background,null);
  await assert.rejects(composePropiox({...args,resources:[]}),/necesita una fotografía/);
  const brief=hybridDirectionPrompt('Tema','x'.repeat(30000),Array(50).fill({name:'foto'.repeat(200),purpose:'Fondo',description:'x'.repeat(2000)}));assert(brief.length<9000);assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
