import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db';
import {selectionAnalysis} from '../lib/meta-ads/selection-analysis';
import {effectiveness} from '../lib/meta-ads/effectiveness';
import {limaDay} from '../lib/meta-ads/advisor-attribution';
test('Selected evaluation excludes unselected diplomas and other countries before aggregation',async()=>{
 assert(process.env.DATABASE_URL?.includes('library_organization_test')&&process.env.DATABASE_URL.includes('/workspace/work/pgdata'));
 const tag=randomUUID(),day=limaDay(new Date());
 const owner=await db.user.create({data:{name:'Selection QA',email:tag+'@example.test',passwordHash:'synthetic',role:'OWNER',status:'APPROVED'}});
 const list=await db.metaEffectivenessSheet.create({data:{kind:'INVENTORY',name:tag}});
 const table=await db.metaAliasTable.create({data:{name:tag,defaultCountry:'PE',defaultCurrency:'PEN'}});
 try{
  const aliases=await Promise.all(['First','Second','Excluded'].map(name=>db.metaAlias.create({data:{tableId:table.id,inventorySheetId:list.id,name:name+tag}})));
  for(const [index,alias] of aliases.entries())await db.metaEffectivenessRow.create({data:{aliasId:alias.id,country:'PE',currency:'',displayCurrency:'PEN',days:{create:{day,sales:[2,3,999][index],salesOverridden:true,annotations:{spend:{value:9999,currency:'PEN'}}}}}});
  await db.metaEffectivenessRow.create({data:{aliasId:aliases[0].id,country:'CO',currency:'',displayCurrency:'PEN',days:{create:{day,sales:888,salesOverridden:true}}}});
  const names=aliases.slice(0,2).map(a=>a.name),q={listId:list.id,tableId:table.id,country:'PE',names,since:day,until:day};
  const result=await selectionAnalysis(owner,q),full=await effectiveness(owner,table.id,day,day);
  assert.equal(result.sheet.rows.length,2);assert(result.sheet.rows.every(r=>r.country==='PE'&&aliases.slice(0,2).some(a=>a.id===r.aliasId)));
  assert.equal(result.sheet.rows.reduce((s,r)=>s+(r.days[day]?.sales??0),0),5);
  for(const r of result.sheet.rows)assert.deepEqual(r,full.rows.find(v=>v.aliasId===r.aliasId&&v.country===r.country));
  assert.equal(result.analysis.rows.length,2);assert(result.analysis.rows.every(r=>r.country==='PE'));
  assert.equal(result.analysis.bases.length,0);
  assert.equal(result.products.flatMap(p=>p.products).length,2);
  assert(result.products.flatMap(p=>p.products).every(p=>names.includes(p.name)));
  assert(result.analysis.rows.every(r=>r.report.metaSpend===null)); // manual G never becomes Meta spend
  const pending=await selectionAnalysis(owner,{...q,country:'EC'});
  assert.equal(pending.sheet.rows.length,2);assert(pending.sheet.rows.every(r=>r.country==='EC'&&Object.values(r.days).every(d=>d.sales===null)));
  await assert.rejects(selectionAnalysis(owner,{...q,listId:'unrelated-list'}));
  await assert.rejects(selectionAnalysis({...owner,role:'OBSERVER'},q));
  assert.equal((await db.metaEffectivenessDay.findMany({where:{row:{aliasId:aliases[2].id}},select:{sales:true}}))[0].sales,999);
 }finally{
  await db.metaEffectivenessRow.deleteMany({where:{alias:{tableId:table.id}}});
  await db.metaAlias.deleteMany({where:{tableId:table.id}});
  await db.metaAliasTable.delete({where:{id:table.id}});
  await db.metaEffectivenessSheet.delete({where:{id:list.id}});
  await db.user.delete({where:{id:owner.id}});await db.$disconnect();
 }
});
