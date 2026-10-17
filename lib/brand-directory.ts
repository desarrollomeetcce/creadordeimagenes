import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db} from './db';
import {fullProjectFilter,projectAccess} from './auth';
import {demand} from './errors';
import {readBrand} from './brand';
import {withAttachmentCopies} from './attachment-copies';
import {recordActivity} from './activity';
export async function brandDirectoryRoutes(req:NextRequest,parts:string[],actor:{id:string;role:string},body:()=>Promise<unknown>){
 const send=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(parts.length===1&&req.method==='GET')return send(await db.brandKit.findMany({where:{project:{...fullProjectFilter(actor),deletedAt:null}},select:{projectId:true,name:true,revision:true,project:{select:{name:true}}},orderBy:{updatedAt:'desc'},take:500}));
 if(parts.length===3&&parts[2]==='apply'&&req.method==='POST'){
  const b=z.object({projectId:z.string()}).parse(await body());await projectAccess(actor,parts[1],'EDIT');await projectAccess(actor,b.projectId,'EDIT');
  const source=await readBrand(parts[1]);demand(source,'La identidad no existe.',404);if(parts[1]===b.projectId)return send({kit:source});
  const originals=await db.attachment.findMany({where:{scope:'project',resourceId:parts[1],archivedAt:null}});
  const selected=originals.filter(file=>/logo/i.test(file.purpose)?source.logoAttachmentIds.includes(file.id):/^(?:Marca ·)|manual de marca|referencia visual|fotografía/i.test(file.purpose));
  const destinationBrandRevision=(await db.brandKit.findUnique({where:{projectId:b.projectId},select:{revision:true}}))?.revision??0;
  const destination=await db.project.findUniqueOrThrow({where:{id:b.projectId}}),previous=destination.instructionPolicy as Record<string,unknown>,previousMap=(previous.brandPresetAttachments??{}) as Record<string,string>;
  const existing=await db.attachment.findMany({where:{scope:'project',resourceId:b.projectId,id:{in:Object.values(previousMap)},archivedAt:null}});
  const valid=Object.fromEntries(Object.entries(previousMap).filter(([,id])=>existing.some(file=>file.id===id)));
  const reused=Object.fromEntries(selected.filter(file=>existing.some(target=>target.id===previousMap[file.id]&&target.name===file.name&&target.mime===file.mime&&target.purpose===file.purpose&&target.size===file.size)).map(file=>[file.id,previousMap[file.id]]));
  await withAttachmentCopies({scope:'project',resourceId:parts[1],attachmentIds:selected.filter(file=>!reused[file.id]).map(file=>file.id)},async(tx,copies,ids)=>{
   await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${b.projectId} FOR UPDATE`;
   await projectAccess(actor,parts[1],'EDIT');await projectAccess(actor,b.projectId,'EDIT');
   const fresh=await tx.project.findUniqueOrThrow({where:{id:b.projectId}}),currentSource=await tx.brandKit.findUnique({where:{projectId:parts[1]}});
   demand(((await tx.brandKit.findUnique({where:{projectId:b.projectId},select:{revision:true}}))?.revision??0)===destinationBrandRevision,'La identidad de destino cambió. Vuelve a seleccionarla.',409);
   demand(JSON.stringify(fresh.instructionPolicy)===JSON.stringify(destination.instructionPolicy)&&currentSource?.revision===source.revision,'La identidad cambió. Vuelve a seleccionarla.',409);
   const rows=copies.map(file=>({...file,id:randomUUID(),scope:'project',resourceId:b.projectId}));if(rows.length)await tx.attachment.createMany({data:rows});
   const map={...valid,...reused,...Object.fromEntries(ids.map((id,index)=>[id,rows[index].id]))};demand(Object.keys(map).length<=50,'Retira adjuntos importados que ya no uses antes de añadir otra identidad.',413);
   await tx.brandKit.upsert({where:{projectId:b.projectId},create:{projectId:b.projectId,name:source.name,prompt:source.prompt,colors:source.colors,font:source.font},update:{name:source.name,prompt:source.prompt,colors:source.colors,font:source.font,revision:{increment:1}}});
   await tx.brandLogo.deleteMany({where:{projectId:b.projectId}});const logos=source.logoAttachmentIds.map(id=>map[id]).filter(Boolean);if(logos.length)await tx.brandLogo.createMany({data:logos.map(attachmentId=>({projectId:b.projectId,attachmentId}))});
   const {brandPresetId,brandPresetName,...policy}=fresh.instructionPolicy as Record<string,unknown>;await tx.project.update({where:{id:b.projectId},data:{instructionPolicy:JSON.parse(JSON.stringify({...policy,brandPresetAttachments:map}))}});
   await recordActivity(tx,{data:{actorId:actor.id,action:'IDENTIDAD_MARCA_CARGADA',resourceId:b.projectId,detail:{sourceProjectId:parts[1]}}});
  });
  return send({kit:await readBrand(b.projectId)});
 }
 return null;
}
