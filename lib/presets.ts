import { instructionPolicySchema,instructionFlags } from "./instruction-policy";
import { brandSchema } from "./brand";
import { randomUUID } from "node:crypto";
import { recordActivity } from "./activity";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { ownerOnly, projectAccess, resourceAccess } from "./auth";
import { demand } from "./errors";
import { presetAccess, presetFilter, canEditPreset } from "./preset-access";
import { withAttachmentCopies } from "./attachment-copies";
import { remove } from "./storage";
import { effectiveSettings, validateDistribution } from "./inheritance";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .transform((v) =>
      /^configuraci[oó]n\b/i.test(v) ? v : "CONFIGURACION " + v,
    ),
  prompt: z.string().max(30000),
  level:z.enum(["legacy","project","category","subproduct","brand"]).optional(),
  policy:instructionPolicySchema.optional(),
  settings: z.record(z.string(), z.unknown()),
  applyPromptToAll: z.boolean().default(true),
  applySettingsToAll: z.boolean().default(true),
  visibility: z.enum(["PERSONAL", "SHARED", "OFFICIAL"]).default("PERSONAL"),
});
const send = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export async function presetRoutes(
  req: NextRequest,
  parts: string[],
  user: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  const method = req.method;
  if (method === "GET" && parts.length === 1) {
    const items = await db.savedPreset.findMany({
      where: { AND:[await presetFilter(user), ...(req.nextUrl.searchParams.get("level") ? [{level:{in:[z.enum(["project","category","subproduct","brand"]).parse(req.nextUrl.searchParams.get("level")),...(["category","subproduct"].includes(req.nextUrl.searchParams.get("level")!)?["legacy"]:[])]}}] : [])] },
      orderBy: { updatedAt: "desc" },
      ...(req.nextUrl.searchParams.get("summary")==="1"?{select:{id:true,userId:true,name:true,level:true,visibility:true,updatedAt:true}}:{}),
    });
    const counts = await db.attachment.groupBy({
      by: ["resourceId"],
      where: { scope: "preset", resourceId: { in: items.map((i) => i.id) } },
      _count: true,
    });
    const countsById = new Map(counts.map((c) => [c.resourceId, c._count]));
    return send(
      items.map((i) => ({
        ...i,
        attachmentCount: countsById.get(i.id) ?? 0,
        canEdit: canEditPreset(user, i),
      })),
    );
  }
  if (method === "POST" && parts.length === 1) {
    const b = schema
      .extend({
        sourceProjectId: z.string().optional(),
        sourceCategoryId: z.string().optional(),
        sourceSubproductId: z.string().optional(),
        includeAttachments: z.boolean().default(false),
      })
      .parse(await body());
    if (b.visibility === "OFFICIAL") ownerOnly(user);
    demand(
      [b.sourceProjectId,b.sourceCategoryId,b.sourceSubproductId].filter(Boolean).length <= 1,
      "Selecciona un solo origen.",
    );
    const sourceId = b.sourceProjectId ?? b.sourceCategoryId ?? b.sourceSubproductId;
    const sourceScope = b.sourceProjectId ? "project" : b.sourceCategoryId ? "category" : "subproduct";
    const level = b.level ?? "legacy";
    demand(level==="legacy" || !sourceId || level===sourceScope || (level==="brand"&&sourceScope==="project"),"La configuración debe corresponder al nivel de origen.");
    demand(
      !b.includeAttachments || !!sourceId,
      "Selecciona la producto de origen.",
    );
    if (sourceId) await resourceAccess(user, sourceScope, sourceId, "EDIT");
    let attachmentIds:string[]|undefined;
    if(level==="brand"&&sourceId){const logos=await db.brandLogo.findMany({where:{projectId:sourceId},select:{attachmentId:true}}),selected=new Set(logos.map(l=>l.attachmentId));const files=await db.attachment.findMany({where:{scope:"project",resourceId:sourceId,archivedAt:null},select:{id:true,purpose:true}});attachmentIds=files.filter(f=>/logo/i.test(f.purpose)?selected.has(f.id):/^(?:Marca ·)|manual de marca|referencia visual|fotografía/i.test(f.purpose)).map(f=>f.id);}
    const result = await withAttachmentCopies(
      b.includeAttachments
        ? { scope: sourceScope, resourceId: sourceId!,attachmentIds }
        : null,
      async (tx, copies) => {
        if (sourceId) await resourceAccess(user, sourceScope, sourceId, "EDIT");
        const preset = await tx.savedPreset.create({
          data: {
            name: b.name,
            level,
            policy:JSON.parse(JSON.stringify(instructionFlags(b.policy))),
            prompt: b.prompt,
            settings: JSON.parse(JSON.stringify(b.settings)),
            visibility: b.visibility,
            applyPromptToAll: b.applyPromptToAll,
            applySettingsToAll: b.applySettingsToAll,
            userId: user.id,
          },
        });
        if (copies.length)
          await tx.attachment.createMany({
            data: copies.map((c) => ({
              ...c,
              scope: "preset",
              resourceId: preset.id,
            })),
          });
        await recordActivity(tx, {
          data: {
            actorId: user.id,
            action: "CONFIGURACION_GUARDADA",
            resourceId: preset.id,
          },
        });
        return preset;
      },
    );
    return send(result, 201);
  }
  if (!parts[1]) return null;
  if (parts[2] === "shares") {
    const { presetShares } = await import("./preset-shares");
    return await presetShares(req, parts, user, body);
  }
  const preset = await presetAccess(user, parts[1]);
  async function currentPreset(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT id FROM "SavedPreset" WHERE id=${preset.id} FOR UPDATE`;
    const current = await tx.savedPreset.findUnique({
      where: { id: preset.id },
    });
    demand(current, "Configuración no encontrada.", 404);
    await presetAccess(user, preset.id);
    demand(
      current.updatedAt.getTime() === preset.updatedAt.getTime(),
      "La configuración cambió. Actualiza la página y vuelve a intentarlo.",
      409,
    );
    return current;
  }
  if (parts[2] === "duplicate" && method === "POST" && parts.length === 3) {
    const result = await withAttachmentCopies(
      { scope: "preset", resourceId: preset.id },
      async (tx, copies) => {
        await currentPreset(tx);
        const item = await tx.savedPreset.create({
          data: {
            name: preset.name.slice(0, 140) + " · copia",
            prompt: preset.prompt,
            settings: preset.settings!,
            visibility: "PERSONAL",
            level:preset.level,
            policy:preset.policy!,
            applyPromptToAll: preset.applyPromptToAll,
            applySettingsToAll: preset.applySettingsToAll,
            userId: user.id,
          },
        });
        if (copies.length)
          await tx.attachment.createMany({
            data: copies.map((c) => ({
              ...c,
              scope: "preset",
              resourceId: item.id,
            })),
          });
        await recordActivity(tx, {
          data: {
            actorId: user.id,
            action: "CONFIGURACION_DUPLICADA",
            resourceId: item.id,
          },
        });
        return item;
      },
    );
    return send(result, 201);
  }
  if (parts[2] === "apply" && method === "POST" && parts.length === 3) {
    const b = z.object({projectId:z.string().optional(),categoryId:z.string().optional(),subproductId:z.string().optional(),brand:z.boolean().default(false),includeAttachments:z.boolean().default(true)}).parse(await body());
    demand([b.projectId,b.categoryId,b.subproductId].filter(Boolean).length===1,"Selecciona un solo destino.");
    const targetId=(b.projectId??b.categoryId??b.subproductId)!, scope=b.projectId?"project":b.categoryId?"category":"subproduct";
    const level=b.brand?"brand":scope;
    demand(!b.brand||scope==="project","La marca debe pertenecer a un proyecto.");
    demand(preset.level===level||(preset.level==="legacy"&&["category","subproduct"].includes(level)),"Elige una configuración del mismo nivel de jerarquía.");
    await resourceAccess(user,scope,targetId,"EDIT");
    if(["category","subproduct"].includes(scope))validateDistribution(effectiveSettings(preset.settings,{}));
    let policy:Record<string,unknown>={includeSelf:true,includeProject:true,includeProduct:true,...instructionFlags(preset.policy),loadedPresetId:preset.id,loadedPresetName:preset.name};
    const targetBrandRevision=b.brand?(await db.brandKit.findUnique({where:{projectId:targetId},select:{revision:true}}))?.revision??0:null;
    const currentTarget=scope==="project"?await db.project.findUniqueOrThrow({where:{id:targetId}}):scope==="category"?await db.category.findUniqueOrThrow({where:{id:targetId}}):await db.subproduct.findUniqueOrThrow({where:{id:targetId}});
    policy={...(currentTarget.instructionPolicy as object),...policy};
    const previousPolicy=currentTarget.instructionPolicy as Record<string,unknown>,mapKey=b.brand?"brandPresetAttachments":"presetAttachments";
    const previousMap=(previousPolicy[mapKey]??{}) as Record<string,string>;
    const originals=await db.attachment.findMany({where:{scope:"preset",resourceId:preset.id,archivedAt:null},select:{id:true,name:true,mime:true,purpose:true,size:true}});
    const existing=await db.attachment.findMany({where:{scope,resourceId:targetId,id:{in:Object.values(previousMap)},archivedAt:null},select:{id:true,name:true,mime:true,purpose:true,size:true}});
    const kept=Object.fromEntries(originals.filter(source=>existing.some(dest=>dest.id===previousMap[source.id]&&dest.name===source.name&&dest.mime===source.mime&&dest.purpose===source.purpose&&dest.size===source.size)).map(source=>[source.id,previousMap[source.id]]));
    const missing=originals.filter(source=>!kept[source.id]).map(source=>source.id);
    const count = await withAttachmentCopies(
      b.includeAttachments ? { scope: "preset", resourceId: preset.id,attachmentIds:missing } : null,
      async (tx, copies,sourceIds) => {
        await currentPreset(tx);
        await resourceAccess(user, scope, targetId, "EDIT");
        if(scope==="project")await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${targetId} FOR UPDATE`;
        else if(scope==="category")await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${targetId} FOR UPDATE`;
        else await tx.$queryRaw`SELECT id FROM "Subproduct" WHERE id=${targetId} FOR UPDATE`;
        const fresh=scope==="project"?await tx.project.findUniqueOrThrow({where:{id:targetId}}):scope==="category"?await tx.category.findUniqueOrThrow({where:{id:targetId}}):await tx.subproduct.findUniqueOrThrow({where:{id:targetId}});
        demand(JSON.stringify(fresh.instructionPolicy)===JSON.stringify(currentTarget.instructionPolicy)&&fresh.prompt===currentTarget.prompt,"El espacio cambió durante la carga. Vuelve a seleccionar la configuración.",409);
        demand(await tx.attachment.count({where:{id:{in:Object.values(kept)},scope,resourceId:targetId,archivedAt:null}})===Object.keys(kept).length,"Los adjuntos cambiaron. Vuelve a cargar la configuración.",409);
        if (scope === "project") {
          await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${targetId} FOR UPDATE`;
          if(b.brand){
            const settings=preset.settings as Record<string,unknown>, previous=await tx.brandKit.findUnique({where:{projectId:targetId}});
            demand((previous?.revision??0)===targetBrandRevision,"La identidad de destino cambió. Vuelve a cargarla.",409);
            const brand=brandSchema.parse({expectedRevision:previous?.revision??0,name:settings.brandName??"",prompt:preset.prompt,colors:settings.colors??[],font:settings.font??null,logoAttachmentIds:[]});
            await tx.brandKit.upsert({where:{projectId:targetId},create:{projectId:targetId,name:brand.name,prompt:brand.prompt,colors:brand.colors,font:brand.font},update:{name:brand.name,prompt:brand.prompt,colors:brand.colors,font:brand.font,revision:{increment:1}}});
            await tx.brandLogo.deleteMany({where:{projectId:targetId}});
            const current=await tx.project.findUniqueOrThrow({where:{id:targetId}});
            await tx.project.update({where:{id:targetId},data:{instructionPolicy:{...(current.instructionPolicy as object),brandPresetId:preset.id,brandPresetName:preset.name}}});
          }else await tx.project.update({where:{id:targetId},data:{prompt:preset.prompt,instructionPolicy:JSON.parse(JSON.stringify(policy))}});
        } else if (scope === "category") {
          await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${targetId} FOR UPDATE`;
          await tx.category.update({where:{id:targetId},data:{prompt:preset.prompt,settings:preset.settings!,instructionPolicy:JSON.parse(JSON.stringify(policy)),applyPromptToAll:preset.applyPromptToAll,applySettingsToAll:preset.applySettingsToAll}});
        } else {
          await tx.$queryRaw`SELECT id FROM "Subproduct" WHERE id=${targetId} FOR UPDATE`;
          await tx.subproduct.update({where:{id:targetId},data:{prompt:preset.prompt,settings:preset.settings!,instructionPolicy:JSON.parse(JSON.stringify(policy))}});
        }
        const data=copies.map(c=>({...c,id:randomUUID(),scope,resourceId:targetId}));
        if(data.length)await tx.attachment.createMany({data});
        const copied=Object.fromEntries(sourceIds.map((sourceId,index)=>[sourceId,data[index].id]));
        const validPrevious=Object.fromEntries(Object.entries(previousMap).filter(([,id])=>existing.some(row=>row.id===id)));
        const finalMap=b.includeAttachments?{...validPrevious,...kept,...copied}:validPrevious;
        demand(Object.keys(finalMap).length<=50,"Este espacio acumula más de 50 adjuntos importados. Retira los que ya no uses antes de cargar otra configuración.",413);
        if(b.brand){const logos=await tx.attachment.findMany({where:{id:{in:originals.map(source=>finalMap[source.id]).filter(Boolean)},scope,resourceId:targetId,archivedAt:null,mime:{startsWith:"image/"},purpose:{contains:"logo",mode:"insensitive"}},select:{id:true}});demand(logos.length<=6,"La identidad admite hasta seis logos.");if(logos.length)await tx.brandLogo.createMany({data:logos.map(c=>({projectId:targetId,attachmentId:c.id}))});}
        if(scope==="project"){const row=await tx.project.findUniqueOrThrow({where:{id:targetId}});await tx.project.update({where:{id:targetId},data:{instructionPolicy:{...(row.instructionPolicy as object),[mapKey]:finalMap}}});}
        else if(scope==="category")await tx.category.update({where:{id:targetId},data:{instructionPolicy:JSON.parse(JSON.stringify({...policy,[mapKey]:finalMap}))}});
        else await tx.subproduct.update({where:{id:targetId},data:{instructionPolicy:JSON.parse(JSON.stringify({...policy,[mapKey]:finalMap}))}});
        await tx.promptVersion.create({
          data: {
            scope,
            resourceId: targetId,
            prompt: preset.prompt,
            actorId: user.id,
          },
        });
        await recordActivity(tx, {
          data: {
            actorId: user.id,
            action: "CONFIGURACION_APLICADA",
            resourceId: targetId,
            detail: {
              presetId: preset.id,
              attachmentsCopied: copies.length,
              scope,
            },
          },
        });
        return copies.length;
      },
    );
    return send({ ok: true, attachmentsCopied: count,preset:{id:preset.id,name:preset.name,updatedAt:preset.updatedAt,visibility:preset.visibility,level:preset.level,canEdit:canEditPreset(user,preset)} });
  }
  demand(parts.length === 2, "Operación no encontrada.", 404);
  await presetAccess(user, preset.id, true);
  if (method === "DELETE") {
    const files = await db.$transaction(async (tx) => {
      await currentPreset(tx);
      const files = await tx.attachment.findMany({
        where: { scope: "preset", resourceId: preset.id },
      });
      await tx.attachment.deleteMany({
        where: { scope: "preset", resourceId: preset.id },
      });
      await tx.savedPreset.delete({ where: { id: preset.id } });
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action: "CONFIGURACION_ELIMINADA",
          resourceId: preset.id,
        },
      });
      return files;
    });
    await Promise.all(files.map((f) => remove(f.path)));
    return send({ ok: true });
  }
  if (method === "PATCH") {
    const b=schema.extend({sourceProjectId:z.string().optional(),sourceCategoryId:z.string().optional(),sourceSubproductId:z.string().optional(),includeAttachments:z.boolean().default(false),expectedUpdatedAt:z.iso.datetime().optional()}).parse(await body());
    if(b.visibility==="OFFICIAL")ownerOnly(user);
    demand(!b.expectedUpdatedAt||new Date(b.expectedUpdatedAt).getTime()===preset.updatedAt.getTime(),"La configuración cambió desde que la cargaste. Vuelve a cargarla antes de sobrescribir.",409);
    const sourceId=b.sourceProjectId??b.sourceCategoryId??b.sourceSubproductId, sourceScope=b.sourceProjectId?"project":b.sourceCategoryId?"category":"subproduct";
    demand([b.sourceProjectId,b.sourceCategoryId,b.sourceSubproductId].filter(Boolean).length<=1,"Selecciona un origen.");
    demand(!b.includeAttachments||!!sourceId,"Falta el espacio de origen de los adjuntos.");
    if(sourceId)await resourceAccess(user,sourceScope,sourceId,"EDIT");
    demand(!sourceId||preset.level==="legacy"||preset.level===sourceScope||(preset.level==="brand"&&sourceScope==="project"),"El origen debe corresponder al nivel de la configuración.");
    let attachmentIds:string[]|undefined;
    if(preset.level==="brand"&&sourceId){const logos=await db.brandLogo.findMany({where:{projectId:sourceId},select:{attachmentId:true}}),selected=new Set(logos.map(l=>l.attachmentId));const files=await db.attachment.findMany({where:{scope:"project",resourceId:sourceId,archivedAt:null},select:{id:true,purpose:true}});attachmentIds=files.filter(f=>/logo/i.test(f.purpose)?selected.has(f.id):/^(?:Marca ·)|manual de marca|referencia visual|fotografía/i.test(f.purpose)).map(f=>f.id);}
    const oldPaths:string[]=[];
    await withAttachmentCopies(b.includeAttachments?{scope:sourceScope,resourceId:sourceId!,attachmentIds}:null,async(tx,copies)=>{
      await currentPreset(tx);if(sourceId)await resourceAccess(user,sourceScope,sourceId,"EDIT");
      demand(!b.level||preset.level===b.level||preset.level==="legacy","No cambies el nivel de una configuración existente.");
      await tx.savedPreset.update({where:{id:preset.id},data:{name:b.name,prompt:b.prompt,settings:JSON.parse(JSON.stringify(b.settings)),visibility:b.visibility,applyPromptToAll:b.applyPromptToAll,applySettingsToAll:b.applySettingsToAll,...(b.level?{level:b.level}:{}),...(b.policy?{policy:JSON.parse(JSON.stringify(instructionFlags(b.policy)))}:{})}});
      if(b.includeAttachments){const old=await tx.attachment.findMany({where:{scope:"preset",resourceId:preset.id},select:{path:true}});oldPaths.push(...old.map(f=>f.path));await tx.attachment.deleteMany({where:{scope:"preset",resourceId:preset.id}});if(copies.length)await tx.attachment.createMany({data:copies.map(c=>({...c,scope:"preset",resourceId:preset.id}))});}
      await recordActivity(tx,{data:{actorId:user.id,action:"CONFIGURACION_ACTUALIZADA",resourceId:preset.id}});
    });
    await Promise.allSettled(oldPaths.map(remove));return send({ok:true});
  }
  return null;
}
