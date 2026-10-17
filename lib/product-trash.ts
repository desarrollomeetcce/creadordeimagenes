import { NextRequest,NextResponse } from "next/server";
import { db } from "./db";
import { demand } from "./errors";
import { projectAccess,resourceAccess } from "./auth";
import { recordActivity } from "./activity";
export async function productTrashRoutes(req:NextRequest,parts:string[],user:{id:string;role:string}) {
  const send=(data:unknown)=>NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
  demand(user.role!=="OBSERVER","El rol Observador solo permite ver y descargar.",403);
  if(parts[1]==="trash"&&parts.length===2&&req.method==="GET")return send(await db.category.findMany({where:{deletedAt:{not:null},project:{deletedAt:null,...(user.role==="OWNER"?{}:{ownerId:user.id})}},select:{id:true,name:true,deletedAt:true,project:{select:{id:true,name:true}}},orderBy:{deletedAt:"desc"},take:100}));
  if(!parts[1])return null;
  const item=await db.category.findUnique({where:{id:parts[1]},include:{project:true}});
  demand(item,"Producto no encontrado.",404);
  demand(user.role==="OWNER"||item.project.ownerId===user.id,"Solo el creador del proyecto o el OWNER pueden eliminar o restaurar este producto.",403);
  await projectAccess(user,item.projectId,"EDIT");
  if(parts[2]==="restore"&&parts.length===3&&req.method==="POST"){
    await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;await tx.category.update({where:{id:item.id},data:{deletedAt:null}});await recordActivity(tx,{data:{actorId:user.id,action:"PRODUCTO_RESTAURADO",resourceId:item.id}});});
    return send({ok:true});
  }
  if(req.method==="DELETE"&&parts.length===2){
    await resourceAccess(user,"category",item.id,"EDIT");
    const cancelled=await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${item.projectId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${item.id} FOR UPDATE`;
      const actor=await tx.user.findUnique({where:{id:user.id}});demand(actor?.status==="APPROVED"&&actor.role===user.role,"La cuenta cambió.",409);
      await projectAccess(user,item.projectId,"EDIT");
      const subs=await tx.subproduct.findMany({where:{categoryId:item.id},select:{id:true}});
      const jobs=await tx.generationJob.findMany({where:{subproductId:{in:subs.map(s=>s.id)},status:"PENDING"},select:{id:true}}),ids=jobs.map(j=>j.id);
      await tx.generationJob.updateMany({where:{id:{in:ids},status:"PENDING"},data:{status:"CANCELLED",completedAt:new Date()}});
      await tx.usageLedger.updateMany({where:{jobId:{in:ids}},data:{status:"RELEASED"}});
      await tx.category.update({where:{id:item.id},data:{deletedAt:new Date()}});
      await recordActivity(tx,{data:{actorId:user.id,action:"PRODUCTO_PAPELERA",resourceId:item.id,detail:{cancelled:ids.length}}});return ids.length;
    });return send({ok:true,cancelled});
  }
  return null;
}
