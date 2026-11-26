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

test("Publicidad keeps role-based pages and shows Cursos IA only after a course is shared", () => {
  const superadmin = { role: "SUPERADMIN" };
  assert.deepEqual(availableGeneratorModules(superadmin), ["projects", "library", "trash"]);
  assert.deepEqual(availableGeneratorModules({ ...superadmin, coursesShared: true }), ["projects", "library", "trash", "courses-ai"]);
  assert.deepEqual(availableGeneratorModules({ ...superadmin, aiAccessEnabled: false, coursesShared: true }), ["courses-ai"]);
  assert(!availableGeneratorModules({ role: "ADMIN", coursesShared: true }).includes("courses-ai"));
});
