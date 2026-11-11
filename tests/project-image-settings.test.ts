import test from "node:test";
import assert from "node:assert/strict";
import {
  compatibleImageOverrides,
  effectiveImageOptions,
} from "../lib/project-image-settings";
const models = [
  {
    name: "OpenAI",
    qualities: ["low", "medium", "high"],
    resolutions: ["1024x1024", "1536x1024"],
    defaults: { quality: "medium", resolution: "1536x1024" },
  },
  {
    name: "Gemini images",
    qualities: ["default"],
    resolutions: ["1K", "2K", "4K"],
    defaults: { quality: "default", resolution: "2K" },
  },
  {
    name: "Gemini 2.5 images",
    qualities: ["default"],
    resolutions: ["default"],
    defaults: { quality: "default", resolution: "default" },
  },
  {
    name: "Google Imagen",
    qualities: ["default"],
    resolutions: ["1:1", "16:9"],
    defaults: { quality: "default", resolution: "16:9" },
  },
  {
    name: "Fal discovered schema",
    qualities: ["standard", "premium"],
    resolutions: ["square", "portrait"],
    defaults: { quality: "standard", resolution: "portrait" },
  },
  {
    name: "Replicate discovered schema",
    qualities: ["default"],
    resolutions: ["768x768", "1024x1024"],
    defaults: { quality: "default", resolution: "768x768" },
  },
];
for (const model of models)
  test(`project overrides follow the actual ${model.name} catalog`, () => {
    const saved = {
      quality: "old-provider-quality",
      resolution: "old-provider-size",
      format: "4:5",
      count: 2,
      prompt: "Preserve",
    };
    const clean = compatibleImageOverrides(saved, model);
    assert.deepEqual(clean, { format: "4:5", count: 2, prompt: "Preserve" });
    assert.equal(saved.quality, "old-provider-quality");
    assert.deepEqual(
      effectiveImageOptions(saved, model, model.defaults),
      model.defaults,
    );
    const valid = {
      quality: model.qualities[0],
      resolution: model.resolutions[0],
    };
    assert.deepEqual(compatibleImageOverrides(valid, model), valid);
    assert.deepEqual(
      effectiveImageOptions(valid, model, model.defaults),
      valid,
    );
  });
test("OpenAI medium and pixel sizes never reach a Gemini request after a switch", () => {
  assert.deepEqual(
    effectiveImageOptions(
      { quality: "medium", resolution: "1024x1024" },
      models[1],
      models[1].defaults,
    ),
    { quality: "default", resolution: "2K" },
  );
});
test("missing catalogs preserve historical preferences and invalid global defaults do not invent a choice", () => {
  const saved = { quality: "medium", resolution: "1024x1024" };
  assert.deepEqual(compatibleImageOverrides(saved), saved);
  assert.deepEqual(effectiveImageOptions({}, models[1], saved), {
    quality: undefined,
    resolution: undefined,
  });
});
