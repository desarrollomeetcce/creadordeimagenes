import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { recordActivity } from "./activity";
import { defaults, effectiveSettings } from "./inheritance";
import { fullProjectFilter, projectFilter, categoryFullFilter } from "./auth";
type Actor = { id: string; role: string };
export async function quickStartOptions(actor: Actor) {
  demand(actor.role !== "OBSERVER", "El rol Observador solo permite ver y descargar.", 403);
  const [projects, full] = await Promise.all([
    db.project.findMany({where:{...projectFilter(actor),deletedAt:null},orderBy:{name:"asc"},select:{id:true,name:true,categories:{where:{...categoryFullFilter(actor),deletedAt:null},orderBy:{name:"asc"},select:{id:true,name:true}}}}),
    db.project.findMany({where:{...fullProjectFilter(actor),deletedAt:null},select:{id:true}}),
  ]);
  const creatable = new Set(full.map(p=>p.id));
  return projects.filter(p=>creatable.has(p.id)||p.categories.length).map(p=>({...p,canCreateProduct:creatable.has(p.id)}));
}
export async function quickStart(actor:Actor, input:unknown) {
  const data=z.object({requestId:z.string().uuid(),name:z.string().trim().min(1).max(160),prompt:z.string().max(30000).default(""),count:z.number().int().min(1).max(12),projectId:z.string().min(1).max(100).optional(),projectName:z.string().trim().min(1).max(200).optional(),categoryId:z.string().min(1).max(100).optional(),productName:z.string().trim().min(1).max(200).optional()}).strict().parse(input);
  demand(actor.role!=="OBSERVER","El rol Observador solo permite ver y descargar.",403);
  demand(!data.categoryId||data.projectId,"Elige el proyecto del producto.");
  const projectId=data.projectId??"quick-"+data.requestId,categoryId=data.categoryId??"quick-product-"+data.requestId,subproductId="quick-sub-"+data.requestId;
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    const user=await tx.user.findUniqueOrThrow({where:{id:actor.id}});
    demand(user.role===actor.role&&user.status==="APPROVED","La cuenta cambió. Inicia sesión de nuevo.",409);
    const previous=await tx.subproduct.findUnique({where:{id:subproductId},include:{category:{include:{project:true}}}});
    if(previous){
      const own=await tx.auditEvent.findFirst({where:{actorId:actor.id,action:"SUBPRODUCTO_INICIO_RAPIDO_CREADO",resourceId:subproductId}});
      const legacy=previous.category.projectId==="quick-"+data.requestId&&previous.category.project.ownerId===actor.id;
      demand((own||legacy)&&!previous.deletedAt&&!previous.category.deletedAt&&!previous.category.project.deletedAt,"Este inicio rápido ya no está disponible. Abre Inicia rápido de nuevo.",409);
      const accessible=await tx.category.findFirst({where:{id:previous.categoryId,...categoryFullFilter(actor),deletedAt:null,project:{deletedAt:null}}});
      demand(accessible,"Ya no tienes acceso al destino de este inicio rápido.",404);
      return {projectId:previous.category.projectId,categoryId:previous.categoryId,subproductId};
    }
    if(data.projectId){
      const p=await tx.project.findFirst({where:{id:projectId,...(data.categoryId?projectFilter(actor):fullProjectFilter(actor)),deletedAt:null}});
      demand(p,"No tienes acceso a este proyecto para crear ese destino.",404);
    } else await tx.project.create({data:{id:projectId,name:data.projectName??"Inicio rápido · "+data.name,description:"",prompt:"",ownerId:actor.id}});
    let category;
    if(data.categoryId){
      category=await tx.category.findFirst({where:{id:categoryId,projectId,...categoryFullFilter(actor),deletedAt:null,project:{deletedAt:null}}});
      demand(category,"El producto no pertenece al proyecto elegido o no permite añadir subproductos.",404);
    } else category=await tx.category.create({data:{id:categoryId,projectId,name:data.productName??"Creaciones rápidas",prompt:"",settings:{...defaults,count:data.count,imageTextCount:data.count},applySettingsToAll:true,applyPromptToAll:true}});
    const settings={...effectiveSettings(category.settings,{},category.applySettingsToAll),count:data.count,textCount:0,imageTextCount:data.count,imageCount:0};
    await tx.subproduct.create({data:{id:subproductId,categoryId,name:data.name,prompt:data.prompt,settings,instructionPolicy:{includeSelf:true,includeProject:!!data.projectId,includeProduct:!!data.categoryId}}});
    if(!data.projectId)await recordActivity(tx,{data:{actorId:actor.id,action:"PROYECTO_CREADO",resourceId:projectId,detail:{source:"inicio_rapido"}}});
    if(!data.categoryId)await recordActivity(tx,{data:{actorId:actor.id,action:"PRODUCTO_CREADO",resourceId:categoryId,detail:{source:"inicio_rapido"}}});
    await recordActivity(tx,{data:{actorId:actor.id,action:"SUBPRODUCTO_INICIO_RAPIDO_CREADO",resourceId:subproductId,detail:{source:"inicio_rapido"}}});
    return {projectId,categoryId,subproductId};
  });
}
