import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { resourceAccess, accessFlags } from "./auth";
import { demand } from "./errors";
import { recordActivity } from "./activity";
import { instructionPolicySchema, policyOf,instructionFlags } from "./instruction-policy";
type Actor={id:string;role:string};
const revision = (row:{prompt:string;instructionPolicy:unknown}) => createHash("sha256").update(JSON.stringify({prompt:row.prompt,policy:row.instructionPolicy})).digest("hex");
async function chain(actor:Actor,id:string) {
  await resourceAccess(actor,"subproduct",id,"VIEW");
  const sub=await db.subproduct.findUniqueOrThrow({where:{id},include:{category:{include:{project:true}}}});
  return {subproduct:sub,category:sub.category,project:sub.category.project};
}
export async function readReview(actor:Actor,id:string) {
  const rows=await chain(actor,id);
  const layers=await Promise.all((["project","category","subproduct"] as const).map(async scope=>{
    const row=rows[scope], flags=await accessFlags(actor,scope,row.id,rows.project.id);
    return {scope,id:row.id,name:row.name,prompt:flags.fullAccess?row.prompt:null,policy:flags.fullAccess?policyOf(row.instructionPolicy):{includeSelf:policyOf(row.instructionPolicy).includeSelf},canEdit:flags.canEdit,revision:flags.fullAccess?revision(row):null};
  }));
  return {layers,productApplies:rows.category.applyPromptToAll};
}
export async function saveReview(actor:Actor,id:string,input:unknown) {
  const b=z.object({layers:z.array(z.object({scope:z.enum(["project","category","subproduct"]),id:z.string(),prompt:z.string().max(30000),policy:instructionPolicySchema,revision:z.string().length(64)})).min(1).max(3)}).parse(input);
  const rows=await chain(actor,id), scopes=new Set<string>();
  for(const layer of b.layers){demand(!scopes.has(layer.scope),"No repitas un nivel.");scopes.add(layer.scope);demand(rows[layer.scope].id===layer.id,"El nivel no corresponde a este subproducto.",400);await resourceAccess(actor,layer.scope,layer.id,"EDIT");}
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const users=await tx.$queryRaw<{role:string;status:string}[]>`SELECT role,status FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    demand(users[0]?.role===actor.role&&users[0]?.status==="APPROVED","La cuenta cambió. Inicia sesión de nuevo.",409);
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${rows.project.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${rows.category.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Subproduct" WHERE id=${id} FOR UPDATE`;
    for(const layer of b.layers){
      await resourceAccess(actor,layer.scope,layer.id,"EDIT");
      const current=layer.scope==="project"?await tx.project.findUniqueOrThrow({where:{id:layer.id}}):layer.scope==="category"?await tx.category.findUniqueOrThrow({where:{id:layer.id}}):await tx.subproduct.findUniqueOrThrow({where:{id:layer.id}});
      demand(revision(current)===layer.revision,"Las instrucciones cambiaron en otra pantalla. Actualiza la revisión antes de guardar.",409);
      const data={prompt:layer.prompt,instructionPolicy:{...(current.instructionPolicy as object),...instructionFlags(layer.policy)}};
      if(layer.scope==="project")await tx.project.update({where:{id:layer.id},data});
      else if(layer.scope==="category")await tx.category.update({where:{id:layer.id},data});
      else await tx.subproduct.update({where:{id:layer.id},data});
      await tx.promptVersion.create({data:{scope:layer.scope,resourceId:layer.id,prompt:layer.prompt,actorId:actor.id}});
    }
    await recordActivity(tx,{data:{actorId:actor.id,action:"REVISION_INSTRUCCIONES_GUARDADA",resourceId:id,detail:{levels:b.layers.map(l=>l.scope)}}});
  });
  return readReview(actor,id);
}
