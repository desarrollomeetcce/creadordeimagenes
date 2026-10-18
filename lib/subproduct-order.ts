import { db } from "./db";
/** Stable creation order from existing immutable creation events; no content changes. */
export async function subproductsInCreationOrder<T extends {id:string}>(categoryId:string,rows:T[]):Promise<T[]> {
  if(rows.length<2)return rows;
  const ids=new Set(rows.map(row=>row.id));
  const events=await db.auditEvent.findMany({where:{OR:[{action:"SUBPRODUCTOS_CREADOS",resourceId:categoryId},{action:"SUBPRODUCTO_INICIO_RAPIDO_CREADO",resourceId:{in:[...ids]}}]},select:{resourceId:true,action:true,createdAt:true,detail:true},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  const positions=new Map<string,number>();let position=0;
  for(const event of events){
    const detail=event.detail as {subproductIds?:unknown};
    const created=event.action==="SUBPRODUCTO_INICIO_RAPIDO_CREADO"?[event.resourceId]:Array.isArray(detail?.subproductIds)?detail.subproductIds:[];
    for(const id of created)if(typeof id==="string"&&ids.has(id)&&!positions.has(id))positions.set(id,position++);
  }
  // Legacy resources without a creation event retain their relative order first.
  return rows.slice().sort((a,b)=>(positions.get(a.id)??-1)-(positions.get(b.id)??-1));
}
