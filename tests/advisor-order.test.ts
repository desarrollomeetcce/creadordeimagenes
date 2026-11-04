import test from "node:test";
import assert from "node:assert/strict";
import {
  orderedAdvisors,
  moveAdvisorInOrder,
} from "../lib/meta-ads/advisor-order-policy";
test("advisor ordering normalizes saved identities and preserves unselected/new members", () => {
  const members = ["ana", "cesar", "donasys", "fran"].map((id) => ({ id }));
  assert.deepEqual(
    orderedAdvisors(members, {
      advisorOrder: ["donasys", "missing", "donasys", null, "ana"],
    }).map((p) => p.id),
    ["donasys", "ana", "cesar", "fran"],
  );
  const ids = members.map((p) => p.id);
  assert.deepEqual(moveAdvisorInOrder(ids, "donasys", "ana"), [
    "donasys",
    "ana",
    "cesar",
    "fran",
  ]);
  assert.deepEqual(ids, ["ana", "cesar", "donasys", "fran"]);
  assert.deepEqual(moveAdvisorInOrder(ids, "ana", "fran"), [
    "cesar",
    "donasys",
    "fran",
    "ana",
  ]);
  assert.equal(moveAdvisorInOrder(ids, "missing", "ana"), ids);
  assert.deepEqual(orderedAdvisors(members, null), members);
});
