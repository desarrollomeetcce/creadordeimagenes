import test from "node:test";
import assert from "node:assert/strict";
import {
  readGenerationPreferences,
  generationPriceInstruction,
  generationPreferenceSchema,
  generationModes,
} from "../lib/creative-studio/generation-preferences";
test("Each diploma keeps its own count, type and literal price", () => {
  const a = readGenerationPreferences(
      { count: 2, mode: "Imagen + Texto", priceText: "40 USD" },
      { count: 3, mode: "Imagen" },
    ),
    b = readGenerationPreferences(
      { count: 10, mode: "Texto", priceText: "90 mil pesos" },
      { count: 3, mode: "Imagen" },
    );
  assert.equal(a.count, 2);
  assert.equal(b.count, 10);
  assert.equal(a.priceText, "40 USD");
  assert.equal(b.priceText, "90 mil pesos");
  assert.notEqual(a.mode, b.mode);
});
test("Literal prices are never normalized or converted; commercial conditions remain in the prompt", () => {
  for (const price of ["40 USD", "90 mil pesos", "30 soles"]) {
    const text = generationPriceInstruction(price);
    assert(text.includes(JSON.stringify(price)));
    assert(text.includes("pago único"));
    assert(text.includes("mensualidad gratis"));
  }
});
test("Blank price follows the prompt and does not invent an amount", () => {
  const text = generationPriceInstruction("");
  assert(text.includes("SIN PRECIO"));
  assert(text.includes("respeta las condiciones"));
  assert(!text.includes("USD"));
  assert.equal(
    readGenerationPreferences(undefined, { count: 3, mode: "Imagen + Texto" })
      .priceText,
    "",
  );
});
test("Generation preferences reject invalid counts and multiline prices", () => {
  assert(
    !generationPreferenceSchema.safeParse({
      count: 0,
      mode: "Texto",
      priceText: "",
    }).success,
  );
  assert(
    !generationPreferenceSchema.safeParse({
      count: 2,
      mode: "Texto",
      priceText: "30\nsoles",
    }).success,
  );
});

test("Random mode mixes all three formats without changing count or retry distribution", () => {
  const a = generationModes(10, "Aleatorio", "request:SIG");
  assert.equal(a.length, 10);
  assert.equal(new Set(a).size, 3);
  assert.deepEqual(a, generationModes(10, "Aleatorio", "request:SIG"));
  assert.notDeepEqual(a, generationModes(10, "Aleatorio", "request:Minería"));
  const sizes = ["Texto", "Imagen + Texto", "Imagen"].map(
    (m) => a.filter((v) => v === m).length,
  );
  assert(Math.max(...sizes) - Math.min(...sizes) <= 1);
  assert.equal(new Set(generationModes(2, "Aleatorio", "same")).size, 2);
  assert.deepEqual(generationModes(2, "Texto", "same"), ["Texto", "Texto"]);
});
