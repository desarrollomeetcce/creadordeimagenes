import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { refreshConnection } from "../lib/meta-ads/service";
import { metaQuotaScope } from "../lib/meta-ads/quota";

test("Explicit connection check recovers local cooldown only, preserving imports and provider deadlines", async () => {
  assert(process.env.DATABASE_URL?.includes("library_organization_test"));
  const tag = randomUUID(), uid = "check-user-" + tag,
    cid = "check-connection-" + tag, token = "synthetic-" + tag,
    aid = String(Date.now()) + "94", scope = metaQuotaScope({appId:null,metaUserId:null}, token),
    unrelated = "unrelated-" + tag, originalFetch = globalThis.fetch,
    cursor = {plan:"focus",phase:9,after:"keep-cursor",historyProcessed:42},
    nextSyncAt = new Date(Date.now() + 3600000);
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.hostname, "graph.facebook.com");
    assert.equal(url.pathname, "/v26.0/me/adaccounts");
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(url.searchParams.get("fields"), "id,name");
    return Response.json({data:[{id:aid,name:"QA"}]});
  };
  try {
    await db.user.create({data:{id:uid,name:"QA",email:tag+"@example.test",passwordHash:"synthetic",role:"OWNER",status:"APPROVED"}});
    await db.metaConnection.create({data:{id:cid,ownerId:uid,name:"QA",transport:"API",apiVersion:"v26.0",encryptedToken:encryptKey(token,"meta:"+cid),verifiedAt:new Date()}});
    await db.metaAdAccount.create({data:{id:aid,connectionId:cid,name:"QA",currency:"PEN",timezone:"America/Lima",enabled:true,syncState:cursor,nextSyncAt}});
    for (const s of [scope, unrelated]) await db.metaApiQuota.create({data:{scope:s,blockedUntil:nextSyncAt,lastLimitedAt:new Date(Date.now()-3600000),failures:5}});
    const actor = {id:uid,role:"OWNER"};
    assert.equal((await refreshConnection(actor,cid)).ok,true);
    assert.equal(calls,1,"One bounded GET; no catalogue discovery or advertising writes");
    const account = await db.metaAdAccount.findUniqueOrThrow({where:{id:aid}});
    assert.deepEqual(account.syncState,cursor);
    assert.equal(account.nextSyncAt?.valueOf(),nextSyncAt.valueOf());
    assert.equal((await db.metaApiQuota.findUniqueOrThrow({where:{scope:unrelated}})).blockedUntil?.valueOf(),nextSyncAt.valueOf());
    assert.equal((await db.metaApiQuota.findUniqueOrThrow({where:{scope}})).failures,5);
    await db.metaApiQuota.update({where:{scope},data:{blockedUntil:nextSyncAt}});
    await assert.rejects(()=>refreshConnection(actor,cid),/limitó/);
    assert.equal(calls,1,"Shared recovery cooldown prevents repeated provider checks");
    await db.metaApiQuota.deleteMany({where:{scope:"recovery:"+scope}});
    await db.metaApiQuota.create({data:{scope:"provider:"+scope,blockedUntil:nextSyncAt}});
    await assert.rejects(()=>refreshConnection(actor,cid),/limitó/);
    assert.equal(calls,1,"Meta Retry-After is never bypassed");
    await db.user.update({where:{id:uid},data:{status:"SUSPENDED"}});
    await assert.rejects(()=>refreshConnection(actor,cid));
    assert.equal(calls,1,"Revoked access cannot recover or query");
  } finally {
    globalThis.fetch=originalFetch;
    await db.metaAccountSource.deleteMany({where:{connectionId:cid}});
    await db.metaAdAccount.deleteMany({where:{id:aid}});
    await db.metaConnection.deleteMany({where:{id:cid}});
    await db.auditEvent.deleteMany({where:{actorId:uid}});
    await db.rateLimit.deleteMany({where:{key:"meta:refresh:"+uid}});
    await db.user.deleteMany({where:{id:uid}});
    await db.metaApiQuota.deleteMany({where:{scope:{in:[scope,"provider:"+scope,"recovery:"+scope,unrelated]}}});
    await db.$disconnect();
  }
});
