import assert from "node:assert/strict";
import { test } from "node:test";
import { canCreateUsers, canManageAccount, managesUsers } from "../lib/roles";

test("only the owner and superadministrator can create accounts", () => {
  for (const role of ["OWNER", "SUPERADMIN"]) assert.equal(canCreateUsers(role), true);
  for (const role of ["ADMIN", "SUPERVISOR", "ADVISOR", "USER", "OBSERVER"])
    assert.equal(canCreateUsers(role), false);
  assert.equal(managesUsers("ADMIN"), true);
});

test("a superadministrator may create ordinary accounts without elevating privileges", () => {
  for (const role of ["USER", "OBSERVER", "ADVISOR"])
    assert.equal(canManageAccount("SUPERADMIN", role), true);
  for (const role of ["OWNER", "SUPERADMIN", "ADMIN", "SUPERVISOR"])
    assert.equal(canManageAccount("SUPERADMIN", role), false);
});
