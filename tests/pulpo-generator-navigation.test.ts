import assert from "node:assert/strict";
import { test } from "node:test";
import { availableGeneratorModules } from "../lib/pulpo-generator-modules";

test("marketing entries follow the individual Generator permissions", () => {
  const advisor = { role: "ADVISOR" };
  assert.deepEqual(availableGeneratorModules(advisor), ["performance"]);
  assert.deepEqual(availableGeneratorModules({ ...advisor, inventoryShared: true }), ["performance", "inventory"]);
  assert.deepEqual(availableGeneratorModules({ ...advisor, salesShared: true }), ["performance", "products"]);
  assert.deepEqual(availableGeneratorModules({ ...advisor, advisorsShared: true }), ["performance", "advisors"]);
});
