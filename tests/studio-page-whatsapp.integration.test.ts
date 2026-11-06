import test from "node:test";
import { Prisma } from "@prisma/client";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { MetaReader } from "../lib/meta-ads/provider";
import {
  campaignPageWhatsApp,
  beginLaunch,
  createLaunch,
} from "../lib/creative-studio/campaigns";

test("Automatic page WhatsApp is scoped, cached, refreshed and verified before publishing", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
    await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
  );
  const owner = await db.user.findUniqueOrThrow({
      where: { id: q.users[0].id },
    }),
    other = await db.user.findUniqueOrThrow({ where: { id: q.users[1].id } });
  const a = await db.metaAdAccount.findUniqueOrThrow({
    where: { id: q.accountId },
    include: { connection: true },
  });
  const prior = await db.creativeMetaPageDirectory.findUnique({
    where: { accountId: a.id },
  });
  await db.creativeMetaPageDirectory.upsert({
    where: { accountId: a.id },
    create: {
      accountId: a.id,
      connectionId: a.connectionId,
      credentialRevision: a.connection.revision,
      pages: [{ id: q.pageId, name: "QA page", whatsapp: "" }],
      fetchedAt: new Date(),
    },
    update: {
      connectionId: a.connectionId,
      credentialRevision: a.connection.revision,
      pages: [{ id: q.pageId, name: "QA page", whatsapp: "" }],
      fetchedAt: new Date(),
    },
  });
  const old = MetaReader.prototype.launchRequest,
    fetch = globalThis.fetch,
    calls: { edge: string; page?: string; body?: unknown }[] = [];
  let number = "+59899999999",
    wrongPage = false;
  globalThis.fetch = async () => {
    throw Error("No real provider calls in WhatsApp QA");
  };
  MetaReader.prototype.launchRequest = async function (
    accountId,
    edge,
    body,
    id,
    fields,
  ) {
    calls.push({ edge, page: id, body });
    assert.equal(accountId, q.accountId);
    assert.equal(body, undefined, "No Meta write is permitted in QA");
    if (edge === "promote_pages")
      return { data: [{ id: q.pageId, name: "QA page" }] };
    assert.equal(edge, "object");
    assert.equal(fields, "id,whatsapp_number");
    return { id: wrongPage ? "999999999" : id, whatsapp_number: number };
  };
  const drafts: string[] = [];
  try {
    assert.equal(
      (await campaignPageWhatsApp(owner, q.accountId, q.pageId)).number,
      number,
    );
    assert.equal(calls.length, 1);
    await campaignPageWhatsApp(owner, q.accountId, q.pageId);
    assert.equal(calls.length, 1, "Reuse Meta's stored number without Graph");
    await assert.rejects(
      () => campaignPageWhatsApp(owner, q.accountId, "888888888"),
      /autorizada/,
    );
    assert.equal(calls.length, 1);
    await assert.rejects(() =>
      campaignPageWhatsApp(other, q.accountId, q.pageId),
    );
    assert.equal(calls.length, 1);
    number = "+51999999999";
    assert.equal(
      (await campaignPageWhatsApp(owner, q.accountId, q.pageId, true)).number,
      number,
    );
    assert.equal(calls.length, 2);
    const payload = {
      categoryId: q.productId,
      requestId: randomUUID(),
      config: {
        accountId: q.accountId,
        pageId: q.pageId,
        country: "UY",
        whatsapp: "+59800000000",
        dailyBudget: 10,
        body: "QA {diplomado}",
        headline: "QA",
        audiences: [{ name: "QA A" }, { name: "QA B" }],
      },
      items: [
        { subproductId: q.images[0].subId, variationIds: [q.images[0].id] },
      ],
    };
    await assert.rejects(
      () => createLaunch(owner, payload),
      /WhatsApp.*cambió/,
    );
    const good=await createLaunch(owner,{...payload,requestId:randomUUID(),config:{...payload.config,whatsapp:number}});
    drafts.push(good.id);
    const begun=await beginLaunch(owner,good.id,{revision:good.revision,confirmPublish:true});
    assert.equal(begun.status,"PUBLISHING","Matching Meta number allows the existing publish workflow; no tick or Meta write is executed");
    const phoneReads=calls.filter(c=>c.edge==="object").length;
    const fallback=await createLaunch(owner,{...payload,requestId:randomUUID(),config:{...payload.config,whatsapp:""}});
    drafts.push(fallback.id);
    assert.equal((await beginLaunch(owner,fallback.id,{revision:fallback.revision,confirmPublish:true})).status,"PUBLISHING");
    assert.equal(calls.filter(c=>c.edge==="object").length,phoneReads,"Meta page default does not require reading a phone number");
    const legacy = await db.creativeMetaLaunch.create({
      data: {
        actorId: owner.id,
        projectId: q.projectId,
        categoryId: q.productId,
        requestId: randomUUID(),
        accountId: q.accountId,
        connectionId: a.connectionId,
        connectionRevision: a.connection.revision,
        config: { ...payload.config, targetStatus: "PAUSED" },
        campaigns: [],
        steps: [],
      },
    });
    drafts.push(legacy.id);
    await assert.rejects(
      () =>
        beginLaunch(owner, legacy.id, {
          revision: legacy.revision,
          confirmPublish: true,
        }),
      /WhatsApp.*cambió/,
    );
    assert.equal(
      (
        await db.creativeMetaLaunch.findUniqueOrThrow({
          where: { id: legacy.id },
        })
      ).status,
      "DRAFT",
    );
    number = "";
    await assert.rejects(
      () => campaignPageWhatsApp(owner, q.accountId, q.pageId, true),
      /no devolvió/,
    );
    number = "+51999999999";
    wrongPage = true;
    await assert.rejects(
      () => campaignPageWhatsApp(owner, q.accountId, q.pageId, true),
      /otra página/,
    );
    assert(calls.every((c) => c.body === undefined));
  } finally {
    MetaReader.prototype.launchRequest = old;
    globalThis.fetch = fetch;
    await db.creativeMetaLaunch.deleteMany({ where: { id: { in: drafts } } });
    await db.creativeMetaPageDirectory.deleteMany({
      where: { accountId: a.id },
    });
    if (prior) await db.creativeMetaPageDirectory.create({ data: {...prior,pages:prior.pages as Prisma.InputJsonValue} });
    await db.$disconnect();
  }
});
