import test from "node:test";
import assert from "node:assert/strict";
import { fillInventorySlots } from "../lib/creative-studio/inventory-slots";
import {
  metaPageWhatsAppNumber,
  readMetaPageWhatsApp,
} from "../lib/creative-studio/page-whatsapp";
import type { MetaReader } from "../lib/meta-ads/provider";
import { whatsappPromotedObject } from "../lib/creative-studio/campaign-policy";

test("Missing WhatsApp uses Meta's page default without inventing a number",()=>{
  assert.deepEqual(whatsappPromotedObject({pageId:"123",whatsapp:""}),{page_id:"123"});
  assert.deepEqual(whatsappPromotedObject({pageId:"123",whatsapp:"+51999999999"}),{page_id:"123",whatsapp_phone_number:"51999999999"});
});

test("Random clicks fill one next slot and preserve manual choices", () => {
  const original = ["manual", "", "", ""];
  const first = fillInventorySlots(
    original,
    ["manual", "a", "b", "c"],
    false,
    () => 0,
  );
  assert.deepEqual(first, ["manual", "a", "", ""]);
  assert.deepEqual(original, ["manual", "", "", ""]);
  assert.deepEqual(
    fillInventorySlots(first, ["manual", "a", "b", "c"], false, () => 0),
    ["manual", "a", "b", ""],
  );
});
test("Complete remaining uses distinct filtered IDs without replacing existing selections", () => {
  assert.deepEqual(
    fillInventorySlots(
      ["manual", "", "", ""],
      ["a", "a", "manual", "b", "c"],
      true,
      () => 0,
    ),
    ["manual", "a", "b", "c"],
  );
});
test("Insufficient filtered inventory leaves empty slots, never repeats or invents products", () => {
  assert.deepEqual(
    fillInventorySlots(["", "", "", ""], ["one", "one"], true, () => 0),
    ["one", "", "", ""],
  );
  assert.deepEqual(
    fillInventorySlots(["kept"], ["other"], true, () => 0),
    ["kept"],
  );
});
test("Meta phone formatting is normalized without adding a guessed country code", () => {
  assert.equal(metaPageWhatsAppNumber("+51 (999) 999-999"), "+51999999999");
  assert.equal(metaPageWhatsAppNumber("59899999999"), "+59899999999");
  for (const value of [
    null,
    undefined,
    123,
    "",
    "not-a-number",
    "+51abc999999",
    "1234567890123456",
  ])
    assert.equal(metaPageWhatsAppNumber(value), "");
});
test("WhatsApp lookup requests exactly the selected page and rejects missing or foreign receipts", async () => {
  const calls: unknown[][] = [];
  let response: any = { id: "123", whatsapp_number: "+51999999999" };
  const reader = {
    launchRequest: async (...args: unknown[]) => {
      calls.push(args);
      return response;
    },
  } as unknown as MetaReader;
  assert.equal(
    await readMetaPageWhatsApp(reader, "456", "123"),
    "+51999999999",
  );
  assert.deepEqual(calls[0], [
    "456",
    "object",
    undefined,
    "123",
    "id,whatsapp_number",
  ]);
  response = { id: "999", whatsapp_number: "+51999999999" };
  await assert.rejects(
    () => readMetaPageWhatsApp(reader, "456", "123"),
    /otra página/,
  );
  response = { id: "123" };
  await assert.rejects(
    () => readMetaPageWhatsApp(reader, "456", "123"),
    /no devolvió/,
  );
});
