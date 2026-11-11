import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { adapter } from "../lib/providers";
import { ProviderHTTPError } from "../lib/providers/http";
import { nativeImageDirection } from "../lib/native-image-direction";
import { completePosterPrompt } from "../lib/creative-recovery";
import { AppError } from "../lib/errors";

const options = {
  imageProvider: "google",
  imageModel: "gemini-3-pro-image-preview",
  creativeProvider: "google",
  editable: false,
};

test("Google Pro creative 404 allows exactly one first image request with the original brief", async () => {
  const original = globalThis.fetch;
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const urls: string[] = [];
  const brief =
    "AFICHE AUTORIZADO: Criminalística Internacional. No inventar precios.";
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(
      new Headers(init?.headers).get("x-goog-api-key"),
      "synthetic-key",
    );
    const body = JSON.parse(String(init?.body));
    if (urls.length === 1) {
      assert(String(url).endsWith("/models/gemini-2.5-pro:generateContent"));
      return Response.json(
        { error: { status: "NOT_FOUND", message: "PRIVATE_PROVIDER_BODY" } },
        { status: 404 },
      );
    }
    assert.equal(urls.length, 2);
    assert(
      String(url).endsWith(
        "/models/gemini-3-pro-image-preview:generateContent",
      ),
    );
    assert.equal(body.contents[0].parts[0].text, brief);
    assert.equal(body.generationConfig.imageConfig.imageSize, "1K");
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: bytes.toString("base64"),
                },
              },
            ],
          },
        },
      ],
    });
  };
  try {
    const plan = await nativeImageDirection(options, () =>
      adapter("google").direct("synthetic-key", "gemini-2.5-pro", brief),
    );
    assert.equal(plan.unavailable, true);
    assert.equal(plan.usage, null);
    const completed = completePosterPrompt(brief, plan.text, plan.incomplete);
    assert.equal(completed.prompt, brief);
    const image = await adapter("google").generate("synthetic-key", {
      model: options.imageModel,
      prompt: completed.prompt,
      quality: "default",
      size: "1K",
    });
    assert(image.bytes.length > 0);
    assert.equal(urls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("native recovery preserves a successful creative plan and usage without another call", async () => {
  const plan = {
    text: "Composición autorizada",
    usage: { totalTokenCount: 12 },
  };
  let calls = 0;
  const result = await nativeImageDirection(options, async () => {
    calls++;
    return plan;
  });
  assert.equal(result, plan);
  assert.equal(calls, 1);
});

test("native recovery never hides invalid parameters, permissions, quota, server failures or interrupted calls", async () => {
  for (const error of [
    new AppError("HTTP 404 NOT_FOUND", 502),
    new Error("timeout"),
    ...[400, 401, 403, 408, 422, 429, 500, 502, 503].map(
      (status) => new ProviderHTTPError("Safe rejection", status),
    ),
  ]) {
    let calls = 0;
    await assert.rejects(
      nativeImageDirection(options, async () => {
        calls++;
        throw error;
      }),
      (actual) => actual === error,
    );
    assert.equal(calls, 1);
  }
});

test("editable, Imagen and other provider pipelines keep rejecting unavailable creative models", async () => {
  const error = new ProviderHTTPError("Safe rejection", 404);
  for (const change of [
    { editable: true },
    { imageProvider: "openai" },
    { creativeProvider: "openai" },
    { imageModel: "imagen-4.0-generate-001" },
    { imageModel: "gemini-2.5-pro" },
  ]) {
    await assert.rejects(
      nativeImageDirection({ ...options, ...change }, async () => {
        throw error;
      }),
      (actual) => actual === error,
    );
  }
});

test("a rejected image remains an error after native creative recovery; no model is retried", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 });
  };
  try {
    const plan = await nativeImageDirection(options, () =>
      adapter("google").direct("synthetic", "gemini-2.5-pro", "QA"),
    );
    assert.equal(plan.unavailable, true);
    await assert.rejects(
      adapter("google").generate("synthetic", {
        model: options.imageModel,
        prompt: "QA",
        quality: "default",
        size: "1K",
      }),
      /generación de imagen.*HTTP 404/,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
