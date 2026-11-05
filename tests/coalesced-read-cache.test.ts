import test from 'node:test';
import assert from 'node:assert/strict';
import {CoalescedReadCache} from '../lib/coalesced-read-cache';
test('group directory shares pending reads, expires and isolates user/document keys',async()=>{
 let now=0,calls=0;const c=new CoalescedReadCache<number>(15,10,()=>now),load=async()=>++calls;
 const a=c.read('user1:doc1',load),b=c.read('user1:doc1',load);assert.equal(a,b);assert.equal(await a,1);
 assert.equal(await c.read('user2:doc1',load),2);assert.equal(await c.read('user1:doc2',load),3);
 assert.equal(await c.read('user1:doc1',load),1);now=16;assert.equal(await c.read('user1:doc1',load),4);
 assert.equal(await c.read('user1:doc1',load,true),5);
});
test('writes invalidate pending and cached directories; late old responses cannot repopulate',async()=>{
 const c=new CoalescedReadCache<number>();let finish!:(n:number)=>void;
 const old=c.read('k',()=>new Promise<number>(r=>{finish=r}));await Promise.resolve();c.clear();
 assert.equal(await c.read('k',async()=>2),2);finish(1);assert.equal(await old,1);assert.equal(await c.read('k',async()=>3),2);
 c.clear();assert.equal(await c.read('k',async()=>4),4);
});
test('failed reads are retryable and cache stays bounded',async()=>{
 const c=new CoalescedReadCache<number>(15,2);await assert.rejects(c.read('k',async()=>{throw Error('offline')}));
 assert.equal(await c.read('k',async()=>1),1);await c.read('b',async()=>2);await c.read('c',async()=>3);assert.equal(await c.read('k',async()=>4),4);
});

import {invalidatesGroupDirectory} from '../app/components/inventory-group-directory-cache';
test('read-only FX POST preserves groups cache; edits invalidate it',()=>{
 assert.equal(invalidatesGroupDirectory('meta-ads/effectiveness/fx','POST'),false);
 assert.equal(invalidatesGroupDirectory('meta-ads/inventory/trials','POST'),true);
 assert.equal(invalidatesGroupDirectory('meta-ads/inventory/categories','PATCH'),true);
 assert.equal(invalidatesGroupDirectory('meta-ads/inventory/trials?mode=directory','GET'),false);
});
