import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { resourceAccess, accessFlags } from "./auth";
import { demand } from "./errors";
import { recordActivity } from "./activity";
import { instructionPolicySchema, policyOf,instructionFlags,publicInstructionPolicy,reviewedPrompt } from "./instruction-policy";
type Actor={id:string;role:string};
const revision = (row:{prompt:string;instructionPolicy:unknown},subPolicy:unknown) => createHash("sha256").update(JSON.stringify({prompt:row.prompt,policy:row.instructionPolicy,local:policyOf(subPolicy).reviewOverrides??{}})).digest("hex");
async function chain(actor:Actor,id:string) {
  await resourceAccess(actor,"subproduct",id,"VIEW");
  const sub=await db.subproduct.findUniqueOrThrow({where:{id},include:{category:{include:{project:true}}}});
  return {subproduct:sub,category:sub.category,project:sub.category.project};
}
export async function readReview(actor:Actor,id:string) {
  const rows=await chain(actor,id);
  const subFlags=await accessFlags(actor,"subproduct",id,rows.project.id);
  const layers=await Promise.all((["project","category","subproduct"] as const).map(async scope=>{
    const row=rows[scope], flags=await accessFlags(actor,scope,row.id,rows.project.id);
    return {scope,id:row.id,name:row.name,prompt:flags.fullAccess?(scope==="subproduct"?row.prompt:reviewedPrompt(scope,row,rows.subproduct.instructionPolicy)):null,policy:flags.fullAccess?publicInstructionPolicy(row.instructionPolicy):{includeSelf:policyOf(row.instructionPolicy).includeSelf},canEdit:subFlags.canEdit&&flags.fullAccess,revision:flags.fullAccess?revision(row,rows.subproduct.instructionPolicy):null};
  }));
  return {layers,productApplies:rows.category.applyPromptToAll};
}
export async function saveReview(actor:Actor,id:string,input:unknown) {
  const b=z.object({layers:z.array(z.object({scope:z.enum(["project","category","subproduct"]),id:z.string(),prompt:z.string().max(30000),policy:instructionPolicySchema,revision:z.string().length(64)})).min(1).max(3)}).parse(input);
  const rows=await chain(actor,id), scopes=new Set<string>();
  await resourceAccess(actor,"subproduct",id,"EDIT");
  for(const layer of b.layers){demand(!scopes.has(layer.scope),"No repitas un nivel.");scopes.add(layer.scope);demand(rows[layer.scope].id===layer.id,"El nivel no corresponde a este subproducto.",400);const flags=await accessFlags(actor,layer.scope,layer.id,rows.project.id);demand(flags.fullAccess,"No tienes acceso al texto de este nivel.",404);}
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const users=await tx.$queryRaw<{role:string;status:string}[]>`SELECT role,status FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    demand(users[0]?.role===actor.role&&users[0]?.status==="APPROVED","La cuenta cambió. Inicia sesión de nuevo.",409);
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${rows.project.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${rows.category.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Subproduct" WHERE id=${id} FOR UPDATE`;
    await resourceAccess(actor,"subproduct",id,"EDIT");
    const currentSub=await tx.subproduct.findUniqueOrThrow({where:{id}});
    let prompt=currentSub.prompt;
    const policy=policyOf(currentSub.instructionPolicy),overrides={...policy.reviewOverrides};
    for(const layer of b.layers){
      const current=layer.scope==="project"?await tx.project.findUniqueOrThrow({where:{id:layer.id}}):layer.scope==="category"?await tx.category.findUniqueOrThrow({where:{id:layer.id}}):currentSub;
      const flags=await accessFlags(actor,layer.scope,layer.id,rows.project.id);demand(flags.fullAccess,"El acceso a este nivel cambió.",404);
      demand(revision(current,currentSub.instructionPolicy)===layer.revision,"Las instrucciones cambiaron. Actualiza la revisión antes de guardar.",409);
      if(layer.scope==="subproduct"){prompt=layer.prompt;Object.assign(policy,instructionFlags(layer.policy));}
      else if(layer.prompt===current.prompt)delete overrides[layer.scope];
      else overrides[layer.scope]={sourceId:layer.id,prompt:layer.prompt};
    }
    await tx.subproduct.update({where:{id},data:{prompt,instructionPolicy:{...policy,reviewOverrides:overrides}}});
    await tx.promptVersion.create({data:{scope:"subproduct",resourceId:id,prompt,actorId:actor.id}});
    await recordActivity(tx,{data:{actorId:actor.id,action:"REVISION_INSTRUCCIONES_GUARDADA",resourceId:id,detail:{levels:b.layers.map(l=>l.scope),localToSubproduct:true}}});
  });
  return readReview(actor,id);
}
