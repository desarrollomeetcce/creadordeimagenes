import test from "node:test";
import assert from "node:assert/strict";
import { groupAvailabilityLabels } from "../lib/meta-ads/inventory-group-availability";
import type { TrialDirectory } from "../lib/meta-ads/inventory-trials";
const key = (n: string, c: string) => JSON.stringify([n.toLowerCase(), c]);
const d = {
  catalog: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
  groups: [
    {
      id: "1",
      name: "Grupo 1",
      members: [{ name: "A" }, { name: "B" }, { name: "B" }],
    },
    { id: "2", name: "Grupo 2", members: [{ name: "C" }] },
  ],
  usageReady: true,
  usage: {
    [key("A", "CO")]: { mode: "USED", automatic: "NEVER" },
    [key("B", "CO")]: { mode: "UNUSED", automatic: "USED" },
    [key("A", "BO")]: { mode: "UNUSED", automatic: "USED" },
    [key("B", "BO")]: { mode: "UNUSED", automatic: "USED" },
    [key("C", "CO")]: { mode: "USED", automatic: "USED" },
  },
} as unknown as TrialDirectory;
test("Group labels use country-specific overrides and deduplicate the same item", () => {
  assert.equal(
    groupAvailabilityLabels(d, "CO").get("1"),
    "Grupo 1 · 2 — 1 sin usar",
  );
  assert.equal(
    groupAvailabilityLabels(d, "BO").get("1"),
    "Grupo 1 · 2 — 2 sin usar",
  );
  assert.equal(
    groupAvailabilityLabels(d, "CO").get("2"),
    "Grupo 2 · 1 — 0 sin usar",
  );
});
test("Unloaded usage never masquerades as zero unused, and country is required for usage counts", () => {
  assert.equal(
    groupAvailabilityLabels({ ...d, usageReady: false }, "CO").get("1"),
    "Grupo 1 · 2 — uso pendiente",
  );
  assert.equal(groupAvailabilityLabels(d, "").get("1"), "Grupo 1 · 2");
});
test("Removed inventory entries do not inflate selectable group totals", () => {
  const v = {
    ...d,
    groups: [
      {
        ...d.groups[0],
        members: [...d.groups[0].members, { name: "Removed" }],
      },
    ],
  } as TrialDirectory;
  assert.equal(
    groupAvailabilityLabels(v, "CO").get("1"),
    "Grupo 1 · 2 — 1 sin usar",
  );
});
