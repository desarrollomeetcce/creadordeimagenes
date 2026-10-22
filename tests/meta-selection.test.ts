import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import { dashboard } from "../lib/meta-ads/dashboard";

const exclusive=process.env.DATABASE_URL?.includes('/library_organization_test?host=/workspace/work/pgdata');
test('Meta selección: canceladas/sin fecha no bloquean todas las cuentas; cortes válidos y permisos se conservan', {skip:!exclusive},async()=>{
  const owner=await db.user.findFirstOrThrow({where:{role:'OWNER',status:'APPROVED'}});
  const c=await db.metaConnection.create({data:{name:'Selección cancelada sintética',ownerId:owner.id,transport:'API',apiVersion:'v26.0'}});
  const outsider=await db.user.create({data:{email:'meta-selection-private@example.test',name:'Prueba de privacidad',role:'OBSERVER',status:'APPROVED',passwordHash:'not-a-login'}});
  const ids=['93801','93802','93803'];const recent=new Date(),old=new Date(Date.now()-86400000);
  try{
    for(const [i,id] of ids.entries()){
      await db.metaAdAccount.create({data:{id,connectionId:c.id,name:'Selección '+i,currency:'PEN',timezone:'America/Lima',syncState:i===0?{plan:'focus',stop:'cancelled',recentDays:7}:i===1?{plan:'focus',phase:0,started:'invalid'}:{plan:'focus',phase:0,started:recent.toISOString()}}});
      await db.metaAdObject.create({data:{id:id+'1',accountId:id,level:'ad',name:'Historial conservado '+i,status:'PAUSED',effectiveStatus:'PAUSED',selectedAt:old,seenAt:old}});
    }
    const a=await dashboard(owner,new URLSearchParams('accounts=93801&level=ad'));assert.equal(a.total,1);assert.equal(a.items[0].id,'938011');
    assert.equal((await dashboard(owner,new URLSearchParams('accounts=93802&level=ad'))).total,1);
    assert.equal((await dashboard(owner,new URLSearchParams('accounts=93803&level=ad'))).total,0);
    const all=await dashboard(owner,new URLSearchParams('level=ad'));assert(all.total>=2);
    assert.equal((await dashboard(outsider,new URLSearchParams('level=ad'))).total,0);
    await assert.rejects(()=>dashboard(outsider,new URLSearchParams('accounts=93801')),/autorizadas/);
    assert.equal(await db.metaAdObject.count({where:{accountId:{in:ids}}}),3);
  }finally{await db.metaAdAccount.deleteMany({where:{id:{in:ids},connectionId:c.id}});await db.metaConnection.delete({where:{id:c.id}});await db.user.delete({where:{id:outsider.id}});await db.$disconnect();}
});
