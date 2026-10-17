import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { recordActivity } from "./activity";
import { defaults } from "./inheritance";
export async function quickStart(actor:{id:string;role:string}, input:unknown) {
  const data=z.object({requestId:z.string().uuid(),name:z.string().trim().min(1).max(160),prompt:z.string().max(30000).default(""),count:z.number().int().min(1).max(12)}).strict().parse(input);
  demand(actor.role!=="OBSERVER","El rol Observador solo permite ver y descargar.",403);
  const projectId="quick-"+data.requestId,categoryId="quick-product-"+data.requestId,subproductId="quick-sub-"+data.requestId;
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    const user=await tx.user.findUniqueOrThrow({where:{id:actor.id}});
    demand(user.role===actor.role&&user.status==="APPROVED","La cuenta cambió. Inicia sesión de nuevo.",409);
    const previous=await tx.project.findUnique({where:{id:projectId},include:{categories:{include:{subproducts:true}}}});
    if(previous){
      demand(previous.ownerId===actor.id&&!previous.deletedAt&&previous.categories.some(c=>c.id===categoryId&&!c.deletedAt&&c.subproducts.some(s=>s.id===subproductId&&!s.deletedAt)),"Este inicio rápido ya no está disponible. Abre Inicia rápido de nuevo.",409);
      return {projectId,categoryId,subproductId};
    }
    await tx.project.create({data:{id:projectId,name:"Inicio rápido · "+data.name,description:"Imágenes creadas desde Inicia rápido",prompt:"",ownerId:actor.id}});
    await tx.category.create({data:{id:categoryId,projectId,name:"Creaciones rápidas",prompt:"",settings:{...defaults,count:data.count,imageTextCount:data.count},applySettingsToAll:true,applyPromptToAll:true}});
    await tx.subproduct.create({data:{id:subproductId,categoryId,name:data.name,prompt:data.prompt,instructionPolicy:{includeSelf:true,includeProject:false,includeProduct:false}}});
    for(const [action,resourceId] of [["PROYECTO_CREADO",projectId],["PRODUCTO_CREADO",categoryId],["SUBPRODUCTOS_CREADOS",categoryId]])await recordActivity(tx,{data:{actorId:actor.id,action,resourceId,detail:{source:"inicio_rapido"}}});
    return {projectId,categoryId,subproductId};
  });
}
