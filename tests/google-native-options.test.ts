import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { adapter } from "../lib/providers";
import {
  googleErrorDetail,
  googleImageResolutions,
} from "../lib/providers/google-options";
test("Google sizes are family-specific; Lite does not inherit Pro 2K/4K options", () => {
  assert.deepEqual(googleImageResolutions("gemini-3.1-flash-lite-image"), [
    "1K",
  ]);
  assert.deepEqual(
    googleImageResolutions("gemini-3.1-flash-lite-image-preview"),
    ["1K"],
  );
  assert.deepEqual(googleImageResolutions("gemini-3-pro-image-preview"), [
    "1K",
    "2K",
    "4K",
  ]);
  assert.deepEqual(googleImageResolutions("gemini-nano-banana-2.1"), [
    "1K",
    "2K",
    "4K",
  ]);
  assert.deepEqual(googleImageResolutions("gemini-2.5-flash-image"), [
    "default",
  ]);
  assert.deepEqual(
    googleImageResolutions("gemini-2.0-flash-exp-image-generation"),
    ["default"],
  );
});
test("bad image parameters are rejected before any API request", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("No calls expected");
  };
  try {
    for (const [model, quality, size] of [
      ["gemini-3.1-flash-lite-image", "default", "2K"],
      ["gemini-2.5-flash-image", "default", "2K"],
      ["gemini-nano-banana-2.1", "medium", "1K"],
    ])
      await assert.rejects(
        adapter("google").generate("synthetic", {
          model,
          quality,
          size,
          prompt: "QA",
        }),
        /calidad|resolución/,
      );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("Google diagnostics allowlist status, account reasons and field names without private values", () => {
  const detail = googleErrorDetail({
    error: {
      status: "INVALID_ARGUMENT",
      message: "PRIVATE_PROMPT",
      details: [
        { reason: "API_KEY_INVALID", metadata: { key: "PRIVATE_KEY" } },
        {
          fieldViolations: [
            {
              field: "generation_config.image_config.image_size",
              description: "PRIVATE",
            },
            { field: "contents[0].parts[1].inline_data.mime_type" },
            { field: "PRIVATE" },
          ],
        },
      ],
    },
  });
  assert.match(detail, /API_KEY_INVALID/);
  assert.match(detail, /resolución de imagen/);
  assert.match(detail, /tipo de imagen de referencia/);
  assert(!detail.includes("PRIVATE"));
  assert.equal(
    googleErrorDetail({
      error: {
        status: "PRIVATE",
        message: "PRIVATE",
        details: [{ reason: "PRIVATE" }],
      },
    }),
    "",
  );
});
test("creative and image rejections identify their phase and HTTP without automatic retries", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json(
      {
        error: {
          status: "INVALID_ARGUMENT",
          message: "PRIVATE_PROMPT",
          details: [
            {
              fieldViolations: [
                {
                  field: "generationConfig.imageConfig.imageSize",
                  description: "PRIVATE_KEY",
                },
              ],
            },
          ],
        },
      },
      { status: 400 },
    );
  };
  try {
    await assert.rejects(
      adapter("google").direct("synthetic", "gemini-2.5-flash", "QA"),
      (e) => {
        assert.match(String(e), /dirección creativa.*HTTP 400/);
        assert(!String(e).includes("PRIVATE"));
        return true;
      },
    );
    await assert.rejects(
      adapter("google").generate("synthetic", {
        model: "gemini-nano-banana-2.1",
        prompt: "QA",
        quality: "default",
        size: "2K",
      }),
      (e) => {
        assert.match(String(e), /generación de imagen.*HTTP 400/);
        assert.match(String(e), /resolución de imagen/);
        assert(!String(e).includes("PRIVATE"));
        return true;
      },
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("legacy image requests omit imageConfig and modern/Lite send only their permitted size", async () => {
  const original = globalThis.fetch;
  const image = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    if (calls === 1) assert.equal(body.generationConfig.imageConfig, undefined);
    else
      assert.equal(
        body.generationConfig.imageConfig.imageSize,
        calls === 2 ? "1K" : "2K",
      );
    assert.equal(body.quality, undefined);
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: image.toString("base64"),
                },
              },
            ],
          },
        },
      ],
    });
  };
  try {
    for (const [model, size] of [
      ["gemini-2.5-flash-image", "default"],
      ["gemini-3.1-flash-lite-image", "1K"],
      ["gemini-nano-banana-2.1", "2K"],
    ])
      await adapter("google").generate("synthetic", {
        model,
        size,
        quality: "default",
        prompt: "QA",
      });
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});
test("the exact 2.5 Flash creative + 2.5 Flash Image pair uses separate native requests", async () => {
  const original = globalThis.fetch;
  const image = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    if (calls === 1) {
      assert(String(url).endsWith("/models/gemini-2.5-flash:generateContent"));
      assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 1536);
      assert.equal(body.generationConfig.imageConfig, undefined);
      assert.equal(body.generationConfig.responseModalities, undefined);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "Dirección creativa QA" }] },
          },
        ],
      });
    }
    assert(
      String(url).endsWith("/models/gemini-2.5-flash-image:generateContent"),
    );
    assert.deepEqual(body.generationConfig.responseModalities, [
      "TEXT",
      "IMAGE",
    ]);
    assert.equal(body.generationConfig.imageConfig, undefined);
    assert.equal(body.generationConfig.thinkingConfig, undefined);
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: image.toString("base64"),
                },
              },
            ],
          },
        },
      ],
    });
  };
  try {
    const plan = await adapter("google").direct(
      "synthetic",
      "gemini-2.5-flash",
      "QA",
    );
    const result = await adapter("google").generate("synthetic", {
      model: "gemini-2.5-flash-image",
      quality: "default",
      size: "default",
      prompt: plan.text,
    });
    assert(result.bytes.length > 0);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
