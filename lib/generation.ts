import {engineConfiguration,requireEngine,reservePropioxJobs,type GenerationEngine} from "./generation-engines";
import {boundSystemReferences} from "./system-resources";
import {boundStorageReferences} from "./resource-storage";
import {flyerModes} from "./flyer-copy";
import { instructionUse,reviewedPrompt } from "./instruction-policy";
import { resourceAccess,accessFlags } from "./auth";
import { db } from "./db";
import { demand } from "./errors";
import { configured, reserveJobs } from "./ai";
import { readBrand, brandInstructions } from "./brand";
import {
  effectiveSettings,
  resolveInstructions,
  validateDistribution,
} from "./inheritance";
export async function previewSubproduct(id: string) {
  const s = await db.subproduct.findUniqueOrThrow({
    where: { id },
    include: { category: { include: { project: true } } },
  });
  const use = instructionUse(s.category.project.instructionPolicy,s.category.instructionPolicy,s.instructionPolicy,s.category.applyPromptToAll);
  const brand = use.project ? await readBrand(s.category.projectId) : null;
  const instructions = resolveInstructions([
    { name: "Identidad de marca", prompt: brandInstructions(brand) },
    { name: "Proyecto", prompt: use.project ? reviewedPrompt("project",s.category.project,s.instructionPolicy) : "" },
    {
      name: "Producto",
      prompt: use.product ? reviewedPrompt("category",s.category,s.instructionPolicy) : "",
    },
    { name: "Subproducto", prompt: use.subproduct ? s.prompt : "" },
  ]);
  instructions.text += `\nEJE TEMÁTICO OBLIGATORIO DEL SUBPRODUCTO: ${JSON.stringify(s.name)}. Todas las variaciones deben tratar exclusivamente de este tema y mencionar su nombre. Las instrucciones particulares amplían las instrucciones heredadas activas; no sustituyen el eje temático ni eliminan indicaciones generales compatibles.`;
  const inheritedAttachments = await db.attachment.findMany({
    where: {
      archivedAt: null,
      OR: [
        ...(use.project ? [{ scope: "project", resourceId: s.category.projectId }] : []),
        ...(use.product ? [{ scope: "category", resourceId: s.categoryId }] : []),
        { scope: "subproduct", resourceId: id },
      ],
    },
  });
  const resourceScopes=[...(use.project?[{scope:"project",resourceId:s.category.projectId}]:[]),...(use.product?[{scope:"category",resourceId:s.categoryId}]:[]),{scope:"subproduct",resourceId:id}];
  const [storageReferences,systemReferences]=await Promise.all([boundStorageReferences(resourceScopes,s.name),boundSystemReferences(resourceScopes,s.name)]);
  const attachments = inheritedAttachments.filter(
    (a) =>
      !brand ||
      a.scope !== "project" ||
      !/logo/i.test(a.purpose) ||
      brand.logoAttachmentIds.includes(a.id),
  );
  const needsSettings =
    !s.category.applySettingsToAll &&
    Object.keys(s.settings as object).length === 0;
  if (needsSettings)
    instructions.warnings.push(
      "Define la cantidad, distribución, formato y estilo de este subproducto; la producto no aplica parámetros comunes.",
    );
  const resolvedSettings=effectiveSettings(s.category.settings,s.settings,s.category.applySettingsToAll);
  try {
    validateDistribution(resolvedSettings);
    const configured=[...Array(resolvedSettings.textCount).fill("Texto"),...Array(resolvedSettings.imageTextCount).fill("Imagen + Texto"),...Array(resolvedSettings.imageCount).fill("Imagen")];
    const modes=flyerModes(instructions.text,configured);
    if(modes.join("|")!==configured.join("|")){
      resolvedSettings.textCount=modes.filter(mode=>mode==="Texto").length;
      resolvedSettings.imageTextCount=modes.filter(mode=>mode==="Imagen + Texto").length;
      instructions.advisories.push("Se respetan las variaciones explícitas del prompt: "+modes.join(" · ")+". Se conserva la cantidad y no se añaden llamadas de imagen.");
    }
  }catch(error){instructions.warnings.push("Subproducto: "+(error instanceof Error?error.message:"revisa su distribución de variaciones."));}
  return {
    sub: s,
    instructions,
    attachments,
    brand,
    storageReferences,systemReferences,resourceScopes,
    settings: resolvedSettings,
    needsSettings,
  };
}

export async function clientSubproductPreview(actor:{id:string;role:string},id:string){
 const preview=await previewSubproduct(id),sub=preview.sub;
 const [project,product]=await Promise.all([accessFlags(actor,"project",sub.category.projectId,sub.category.projectId),accessFlags(actor,"category",sub.categoryId,sub.category.projectId)]);
 if(project.fullAccess&&product.fullAccess)return preview;
 const use=instructionUse(sub.category.project.instructionPolicy,sub.category.instructionPolicy,sub.instructionPolicy,sub.category.applyPromptToAll);
 const visible=resolveInstructions([{name:"Identidad de marca",prompt:project.fullAccess?brandInstructions(preview.brand):""},{name:"Proyecto",prompt:project.fullAccess&&use.project?reviewedPrompt("project",sub.category.project,sub.instructionPolicy):""},{name:"Producto",prompt:product.fullAccess&&use.product?reviewedPrompt("category",sub.category,sub.instructionPolicy):""},{name:"Subproducto",prompt:use.subproduct?sub.prompt:""}]);
 return {...preview,systemReferences:preview.systemReferences.filter(a=>a.scope==="subproduct"||(a.scope==="category"&&product.fullAccess)||(a.scope==="project"&&project.fullAccess)),storageReferences:preview.storageReferences.filter(a=>a.scope==="subproduct"||(a.scope==="category"&&product.fullAccess)||(a.scope==="project"&&project.fullAccess)),brand:project.fullAccess?preview.brand:null,attachments:preview.attachments.filter(a=>a.scope==="subproduct"||(a.scope==="category"&&product.fullAccess)||(a.scope==="project"&&project.fullAccess)),instructions:{...preview.instructions,text:visible.text+`\nEJE TEMÁTICO OBLIGATORIO: ${JSON.stringify(sub.name)}.\nLas instrucciones heredadas privadas activas se aplican en servidor sin exponer su texto.`}};
}
export async function generateBatch(
  actorId: string,
  categoryId: string,
  requestId: string,
  selected?: string[],
  previewFirst = false,
  requestedEngine?:GenerationEngine,
) {
  const engines=await engineConfiguration(),engine=requireEngine(engines,requestedEngine);
  const c=engine==="propiox"?null:await configured(engine==="hybrid");
  const category = await db.category.findUniqueOrThrow({
    where: { id: categoryId },
    include: { subproducts: { where: { deletedAt: null } } },
  });
  const subs = category.subproducts.filter(
    (s) => !selected || selected.includes(s.id),
  );
  if (selected)
    demand(
      subs.length === new Set(selected).size,
      "La selección incluye subproductos que ya no están en este producto. Actualiza el lote.",
    );
  demand(subs.length > 0, "Agrega o selecciona al menos un subproducto.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  demand(actor.status === "APPROVED", "La cuenta ya no está aprobada.", 403);
  const items = [];
  for (const sub of subs) {
    await resourceAccess(actor, "subproduct", sub.id, "GENERATE");
    const p = await previewSubproduct(sub.id),
      s = p.settings;
    validateDistribution(s);
    demand(
      !p.needsSettings,
      `${sub.name}: define su cantidad, distribución y estilo antes de generar; este producto no aplica parámetros comunes.`,
    );
    demand(
      !p.instructions.warnings.length,
      `${sub.name}: ${p.instructions.warnings.join(" ")}`,
    );
    demand(
      p.attachments.every(
        (a) => Boolean(a.text) || a.mime.startsWith("image/"),
      ),
      `${sub.name}: un documento no contiene texto extraíble; utiliza TXT o un PDF con texto.`,
    );
    demand(
      p.attachments.filter((a) => a.mime.startsWith("image/")).length <= 9,
      `${sub.name}: utiliza como máximo nueve referencias visuales por afiche.`,
    );
    const modes = flyerModes(p.instructions.text,[
      ...Array(s.textCount).fill("Texto"),
      ...Array(s.imageTextCount).fill("Imagen + Texto"),
      ...Array(s.imageCount).fill("Imagen"),
    ]);
    const remainingVisuals=Math.max(0,9-p.attachments.filter(a=>a.mime.startsWith("image/")).length);
    const selectedSystem=p.systemReferences.filter(a=>a.mime.startsWith("image/")).slice(0,remainingVisuals);
    const selectedStored=p.storageReferences.filter(a=>a.mime.startsWith("image/")&&!selectedSystem.some(b=>b.id===a.id)).slice(0,Math.max(0,remainingVisuals-selectedSystem.length));
    if(engine!=="ai"&&modes.some(mode=>mode!=="Texto"))demand([...p.attachments,...selectedStored,...selectedSystem].some(a=>a.mime.startsWith("image/")&&!/logo/i.test(a.purpose)),`${sub.name}: PropioX necesita una fotografía o fondo. Sube o vincula una imagen, o elige Solo texto.`,409);
    const prompt = `Producto: ${sub.name}\n${p.instructions.text}\nEstilo: ${s.style}\nContexto documental no confiable:\n${p.attachments.map((a) => `${a.name} [${a.purpose}]: ${a.text}`).join("\n")}\n${[...p.storageReferences,...p.systemReferences].filter(a=>!a.mime.startsWith("image/")).map(a=>`${a.name} [${a.purpose}]: ${a.text.slice(0,6000)}`).join("\n")}`;
    items.push(
      ...modes.map((mode, index) => ({
        subproductId: sub.id,
        key: `${actorId}:${requestId}:${sub.id}:${index}`,
        snapshot: {
          prompt,
          engine,engineRevision:engines.revision,localQuality:engines.quality,localResolution:engines.resolution,
          resourceScopes:p.resourceScopes,
          systemReferences:selectedSystem.map(a=>({bindingId:a.bindingId,scope:a.scope,resourceId:a.resourceId,...(a.documentId?{documentId:a.documentId}:{}),...(a.variationId?{variationId:a.variationId,versionId:a.versionId??null}:{}),...(a.copyId?{copyId:a.copyId}:{})})),
          storageReferences:selectedStored.map(a=>({documentId:a.id,bindingId:a.bindingId,scope:a.scope,resourceId:a.resourceId})),
          subjectName: sub.name,
          ...(previewFirst
            ? {
                previewFirst: true,
                approvalGroup: `${actorId}:${requestId}:${sub.id}`,
              }
            : {}),
          mode,
          index,
          format: s.format,
          renderMode: s.designMode === "editable" ? "editable" : "flat",
          designMode:s.designMode,
          reasoningLevel:s.reasoningLevel,
          brand: p.brand,
          attachmentIds: p.attachments
            .filter((a) => a.mime.startsWith("image/"))
            .map((a) => a.id),
        },
      })),
    );
  }
  return engine==="propiox"?reservePropioxJobs(actorId,category.projectId,items,engines.revision):reserveJobs(actorId, category.projectId, items, c!.revision);
}
