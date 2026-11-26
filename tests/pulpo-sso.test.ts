import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { linkedGeneratorUser, verifyPulpoAssertion } from "../lib/pulpo-sso";

const key = "11".repeat(32);
const claims = {
  sub: "b5b352cb-2925-4c72-9360-ecc987aeb78c",
  aud: "pulpo-generador",
  email: "usuario@example.com",
  exp: 130,
  nonce: "a".repeat(32),
  page: "home",
};
function sign(changes = {}) {
  const encoded = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString("base64url");
  return encoded + "." + createHmac("sha256", Buffer.from(key, "hex"))
    .update("pulpo-sso:v1:" + encoded).digest("base64url");
}
test("validates a short Pulpo assertion and rejects another audience, key or destination", () => {
  assert.deepEqual(verifyPulpoAssertion(sign(), key, 100), claims);
  assert.equal(verifyPulpoAssertion(sign(), key, 130), null);
  assert.equal(verifyPulpoAssertion(sign(), "22".repeat(32), 100), null);
  assert.equal(verifyPulpoAssertion(sign({ aud: "otro" }), key, 100), null);
  assert.equal(verifyPulpoAssertion(sign({ page: "https://example.com" }), key, 100), null);
});
test("accepts only signed, known workspace views on the normal sign-in path", () => {
  assert.equal(verifyPulpoAssertion(sign({ view: "products" }), key, 100)?.view, "products");
  assert.equal(verifyPulpoAssertion(sign({ view: "performance", panel: "advisor" }), key, 100)?.panel, "advisor");
  assert.equal(verifyPulpoAssertion(sign({ view: "performance", panel: "products" }), key, 100)?.panel, "products");
  assert.equal(verifyPulpoAssertion(sign({ view: "performance", panel: "private" }), key, 100), null);
  assert.equal(verifyPulpoAssertion(sign({ view: "products", panel: "team" }), key, 100), null);
  assert.equal(verifyPulpoAssertion(sign({ view: "https://example.com" }), key, 100), null);
  assert.equal(verifyPulpoAssertion(sign({ page: "plans", view: "products" }), key, 100), null);
});
test("limits signed embeds to the three approved modules", () => {
  for (const view of ["metaads", "advisors", "products"])
    assert.equal(verifyPulpoAssertion(sign({ embedded: true, view }), key, 100)?.view, view);
  for (const view of [undefined, "inventory", "performance", "https://example.com"])
    assert.equal(verifyPulpoAssertion(sign({ embedded: true, view }), key, 100), null);
  assert.equal(verifyPulpoAssertion(sign({ embedded: false, view: "metaads" }), key, 100), null);
});
test("requires an explicit link for that Pulpo account and the same email", () => {
  const assertion = verifyPulpoAssertion(sign(), key, 100)!;
  const links = JSON.stringify({ [claims.sub]: { id: "generator-id", email: claims.email } });
  assert.equal(linkedGeneratorUser(links, assertion), "generator-id");
  assert.equal(linkedGeneratorUser(links, { ...assertion, email: "otro@example.com" }), null);
  assert.equal(linkedGeneratorUser("{}", assertion), null);
});
