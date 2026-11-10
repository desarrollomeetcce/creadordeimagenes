import test from "node:test";
import assert from "node:assert/strict";
import { diplomaQuery, newDiplomaToken } from "../lib/diploma-api";
test("API de diplomados: claves aleatorias fuertes y consultas acotadas", () => {
  const tokens = new Set(Array.from({ length: 32 }, () => newDiplomaToken()));
  assert.equal(tokens.size, 32);
  for (const token of tokens) assert.match(token, /^dip_[A-Za-z0-9_-]{43}$/);
  assert.equal(diplomaQuery.parse({}).limit, 50);
  assert.equal(diplomaQuery.parse({ page: "2", limit: "100" }).page, 2);
  for (const q of [
    { limit: 101 },
    { page: 0 },
    { q: "x".repeat(101) },
    { token: "never-in-query" },
    { listId: "" },
  ])
    assert.throws(() => diplomaQuery.parse(q));
});
