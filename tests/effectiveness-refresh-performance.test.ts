import test from 'node:test';import assert from 'node:assert/strict';
import{reuseFinancialResponse}from'../lib/reuse-financial-response';
import{notifyAdvisorSalesChanged,subscribeAdvisorSalesChanged}from'../app/components/advisor-sales-events';
test('unchanged financial payload retains reference; amounts, FX, rights and approval changes never reuse stale data',()=>{
 const before={canEdit:true,rows:[{token:'unchanged-token',metaSpend:20,fx:null,approvals:[] as string[]}]};
 assert.equal(reuseFinancialResponse(before,structuredClone(before)),before);
 for(const after of [{...before,canEdit:false},{...before,rows:[{...before.rows[0],metaSpend:21}]},{...before,rows:[{...before.rows[0],approvals:['APPROVED']}]}])assert.notEqual(reuseFinancialResponse(before,after),before);
 assert.equal(reuseFinancialResponse(null,before),before);
});
test('writer skips only its own local notification; other views, focus and remote events still refresh',()=>{
 const saved=new Map<string,PropertyDescriptor|undefined>();for(const k of ['window','document','localStorage','requestAnimationFrame','cancelAnimationFrame','BroadcastChannel'])saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));
 const w=new EventTarget(),d=Object.assign(new EventTarget(),{hidden:false}),frames=new Map<number,()=>void>();let id=0,writes=0;
 Object.defineProperties(globalThis,{window:{configurable:true,value:w},document:{configurable:true,value:d},localStorage:{configurable:true,value:{setItem(){writes++}}},requestAnimationFrame:{configurable:true,value:(fn:()=>void)=>{frames.set(++id,fn);return id}},cancelAnimationFrame:{configurable:true,value:(id:number)=>frames.delete(id)},BroadcastChannel:{configurable:true,value:undefined}});
 const flush=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(f=>f())};let writer=0,other=0;const stop=subscribeAdvisorSalesChanged(()=>writer++,'writer'),stopOther=subscribeAdvisorSalesChanged(()=>other++,'other');
 try{notifyAdvisorSalesChanged('writer');flush();assert.equal(writer,0);assert.equal(other,1);assert.equal(writes,1);
 notifyAdvisorSalesChanged();flush();assert.equal(writer,1);assert.equal(other,2);
 w.dispatchEvent(new Event('focus'));d.dispatchEvent(new Event('visibilitychange'));flush();assert.equal(writer,2);assert.equal(other,3);
 d.hidden=true;notifyAdvisorSalesChanged();flush();assert.equal(writer,2);assert.equal(other,3);
 stop();stopOther();d.hidden=false;w.dispatchEvent(new Event('focus'));flush();assert.equal(writer,2);
 }finally{stop();stopOther();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k)}}
});
