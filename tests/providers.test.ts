import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { adapter, providers, type ModelCapability } from "../lib/providers";
import { imageCapability, imageArguments } from "../lib/providers/schema";
import { downloadProviderImage } from "../lib/providers/http";
import { capabilityFingerprint } from "../lib/provider-connections";
const key = "synthetic-provider-secret-123456";
const schema = {
  components: {
    schemas: {
      Input: {
        type: "object",
        required: ["prompt"],
        properties: {
          prompt: { type: "string" },
          aspect_ratio: { type: "string", enum: ["1:1", "16:9"] },
          num_outputs: { type: "integer", minimum: 1, maximum: 4 },
          output_format: { type: "string", enum: ["png", "jpeg"] },
        },
      },
    },
  },
};
const png = () =>
  sharp({
    create: { width: 16, height: 12, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
async function transport(handler: typeof fetch, fn: () => Promise<void>) {
  const old = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await fn();
  } finally {
    globalThis.fetch = old;
  }
}
const json = (v: unknown) => Response.json(v);
test("proveedores registrados sin modelos de demostración; Google pagina y separa texto, Nano Banana e Imagen", async () => {
  assert.deepEqual(
    providers.map((p) => p.id),
    ["openai", "google", "fal", "replicate"],
  );
  let calls = 0;
  await transport(
    async (url, init) => {
      calls++;
      const target = new URL(String(url));
      assert.equal(target.hostname, "generativelanguage.googleapis.com");
      assert(!target.href.includes(key));
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key);
      assert.equal(init?.redirect, "error");
      return calls === 1
        ? json({
            models: [
              {
                name: "models/gemini-nano-banana-2.1",
                displayName: "Nano Banana 2.1",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/gemini-1.5-flash",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/imagen-3.0-generate-002",
                supportedGenerationMethods: ["predict"],
              },
            ],
            nextPageToken: "next",
          })
        : json({
            models: [
              {
                name: "models/gemini-2.5-flash",
                displayName: "Gemini Flash",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/imagen-4.0-generate-001",
                supportedGenerationMethods: ["predict"],
              },
              {
                name: "models/other-model",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
          });
    },
    async () => {
      const models = await adapter("google").listModels(key);
      assert.equal(calls, 2);
      assert.equal(models.length, 3);
      assert.equal(
        models.find((m) => m.id === "gemini-nano-banana-2.1")
          ?.supportsReferences,
        true,
      );
      assert.equal(
        models.find((m) => m.id === "gemini-2.5-flash")?.kind,
        "creative",
      );
      assert.equal(
        models.find((m) => m.id.startsWith("imagen-"))?.supportsReferences,
        false,
      );
      assert(
        !models.some(
          (m) => m.id.includes("1.5-flash") || m.id.includes("imagen-3"),
        ),
      );
    },
  );
});
test("Google genera imagen y dirección JSON con headers privados y parámetros nativos, sin reintento", async () => {
  const bytes = await png();
  let images = 0,
    creative = 0;
  await transport(
    async (url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key);
      assert(!String(url).includes(key));
      if (body.generationConfig?.responseMimeType) {
        creative++;
        assert.equal(
          body.generationConfig.responseMimeType,
          "application/json",
        );
        return json({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: "No exponer pensamiento" },
                  { text: '{"texts":[]}' },
                ],
              },
            },
          ],
          usageMetadata: { totalTokenCount: 42 },
        });
      }
      images++;
      assert.equal(body.generationConfig.imageConfig.imageSize, "2K");
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, "image/png");
      assert.equal(body.quality, undefined);
      return json({
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
        usageMetadata: { totalTokenCount: 100 },
      });
    },
    async () => {
      const result = await adapter("google").generate(key, {
        model: "gemini-nano-banana-2.1",
        prompt: "Afiche",
        quality: "default",
        size: "2K",
        images: [{ bytes, mime: "image/png" }],
      });
      assert.deepEqual(result.bytes.subarray(0, 8), bytes.subarray(0, 8));
      assert.deepEqual(result.usage, { totalTokenCount: 100 });
      const text = await adapter("google").direct(
        key,
        "gemini-2.5-flash",
        "Instrucciones",
        true,
      );
      assert.equal(text.text, '{"texts":[]}');
      assert.equal(images, 1);
      assert.equal(creative, 1);
    },
  );
});
test("Google no inventa imagen tras bloqueo ni envía referencias a Imagen", async () => {
  let calls = 0;
  await transport(
    async () => {
      calls++;
      return json({
        candidates: [
          {
            finishReason: "SAFETY",
            content: { parts: [{ text: "Sin imagen" }] },
          },
        ],
      });
    },
    async () => {
      await assert.rejects(
        adapter("google").generate(key, {
          model: "gemini-nano-banana-2.1",
          prompt: "x",
          quality: "default",
          size: "1K",
        }),
        /no devolvió una imagen/,
      );
      await assert.rejects(
        adapter("google").generate(key, {
          model: "imagen-4.0-generate-001",
          prompt: "x",
          quality: "default",
          size: "1:1",
          images: [{ bytes: await png(), mime: "image/png" }],
        }),
        /no admite referencias/,
      );
      assert.equal(calls, 1);
    },
  );
});
test("esquemas reales: parámetros compatibles, una imagen, referencias y entradas obligatorias", () => {
  const cap = imageCapability("owner/model", "Modelo", schema, "a".repeat(64))!;
  assert.deepEqual(cap.resolutions, ["1:1", "16:9"]);
  assert.deepEqual(cap.qualities, ["default"]);
  assert.deepEqual(
    imageArguments({
      capability: cap,
      prompt: "x",
      quality: "default",
      size: "1:1",
    }),
    { prompt: "x", aspect_ratio: "1:1", num_outputs: 1, output_format: "png" },
  );
  assert.throws(
    () =>
      imageArguments({
        capability: cap,
        prompt: "x",
        quality: "high",
        size: "1:1",
      }),
    /parámetros/,
  );
  assert.throws(
    () =>
      imageArguments({
        capability: cap,
        prompt: "x",
        quality: "default",
        size: "1:1",
        images: [{ bytes: Buffer.from("x"), mime: "image/png" }],
      }),
    /no admite referencias/,
  );
  const unsupported = structuredClone(schema) as any;
  unsupported.components.schemas.Input.required.push("required_custom_field");
  unsupported.components.schemas.Input.properties.required_custom_field = {
    type: "string",
  };
  assert.equal(
    imageCapability("owner/unsupported", "Unsupported", unsupported),
    null,
  );
  const ref = structuredClone(schema) as any;
  ref.components.schemas.Input.properties.image_url = { type: "string" };
  ref.components.schemas.Input.required.push("image_url");
  const reference = imageCapability("owner/edit", "Edit", ref)!;
  assert.throws(
    () =>
      imageArguments({
        capability: reference,
        prompt: "x",
        quality: "default",
        size: "1:1",
      }),
    /requiere una imagen/,
  );
  const input = imageArguments({
    capability: reference,
    prompt: "x",
    quality: "default",
    size: "1:1",
    images: [{ bytes: Buffer.from("abc"), mime: "image/png" }],
  });
  assert.equal(input.image_url, "data:image/png;base64,YWJj");
});
test("fal.ai descubre catálogo paginado y esquemas sin lista prefabricada", async () => {
  let calls = 0;
  await transport(
    async (url, init) => {
      calls++;
      const u = new URL(String(url));
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Key ${key}`,
      );
      assert.equal(u.searchParams.get("expand"), "openapi-3.0");
      assert.equal(u.searchParams.get("q"), "flux");
      if (u.searchParams.get("category") === "image-to-image")
        return json({ models: [], has_more: false, next_cursor: null });
      if (!u.searchParams.get("cursor"))
        return json({
          models: [
            {
              endpoint_id: "fal-ai/flux/dev",
              metadata: { display_name: "FLUX dev" },
              openapi: schema,
            },
          ],
          has_more: true,
          next_cursor: "next",
        });
      return json({
        models: [
          {
            endpoint_id: "fal-ai/flux-pro",
            metadata: { display_name: "FLUX pro" },
            openapi: schema,
          },
        ],
        has_more: false,
        next_cursor: null,
      });
    },
    async () => {
      const models = await adapter("fal").listModels(key, "flux");
      assert.deepEqual(
        models.map((m) => m.id),
        ["fal-ai/flux/dev", "fal-ai/flux-pro"],
      );
      assert.equal(calls, 3);
      assert(models.every((m) => m.kind === "image"));
    },
  );
});
test("fal.ai envía una sola solicitud, sigue cola y descarga sin reenviar clave a CDN", async () => {
  const bytes = await png(),
    cap = imageCapability("fal-ai/flux/dev", "Flux", schema)!;
  let posts = 0;
  await transport(
    async (url, init) => {
      const target = new URL(String(url));
      if (target.hostname.endsWith("fal.media")) {
        assert.equal(new Headers(init?.headers).get("Authorization"), null);
        return new Response(new Uint8Array(bytes));
      }
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Key ${key}`,
      );
      if (init?.method === "POST") {
        posts++;
        assert.equal(JSON.parse(String(init.body)).num_outputs, 1);
        return json({
          request_id: "synthetic",
          status_url:
            "https://queue.fal.run/fal-ai/flux/requests/synthetic/status",
          response_url: "https://queue.fal.run/fal-ai/flux/requests/synthetic",
        });
      }
      return target.pathname.endsWith("/status")
        ? json({ status: "COMPLETED" })
        : json({ images: [{ url: "https://v3.fal.media/test.png" }] });
    },
    async () => {
      const result = await adapter("fal").generate(key, {
        model: cap.id,
        prompt: "x",
        quality: "default",
        size: "1:1",
        capability: cap,
      });
      assert(result.bytes.length > 0);
      assert.equal(posts, 1);
      await assert.rejects(
        adapter("fal").direct(key, "none", "x"),
        /dirección creativa/,
      );
    },
  );
});
test("fal.ai rechaza seguimiento externo sin repetir POST ni filtrar mensajes privados", async () => {
  const cap = imageCapability("fal-ai/flux/dev", "Flux", schema)!;
  let calls = 0;
  await transport(
    async () => {
      calls++;
      return json({
        status_url: "https://evil.invalid/requests/secret",
        response_url: "https://evil.invalid/requests/secret",
      });
    },
    async () => {
      await assert.rejects(
        adapter("fal").generate(key, {
          model: cap.id,
          prompt: "x",
          quality: "default",
          size: "1:1",
          capability: cap,
        }),
        /no autorizada/,
      );
      assert.equal(calls, 1);
    },
  );
  await transport(
    async () =>
      new Response(JSON.stringify({ error: { message: key } }), {
        status: 403,
      }),
    async () => {
      await assert.rejects(
        adapter("fal").listModels(key),
        (error) =>
          error instanceof Error &&
          /no autorizó/.test(error.message) &&
          !error.message.includes(key),
      );
    },
  );
});
test("Replicate confirma cuenta y esquemas de la colección antes de ofrecer modelos", async () => {
  await transport(
    async (url, init) => {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Bearer ${key}`,
      );
      return String(url).endsWith("/account")
        ? json({ username: "synthetic" })
        : json({
            models: [
              {
                owner: "black-forest-labs",
                name: "flux-schnell",
                latest_version: { id: "a".repeat(64), openapi_schema: schema },
              },
            ],
          });
    },
    async () => {
      const models = await adapter("replicate").listModels(key);
      assert.equal(models.length, 1);
      assert.equal(models[0].binding?.version, "a".repeat(64));
      assert.equal(models[0].id, "black-forest-labs/flux-schnell");
    },
  );
});
test("Replicate busca familias o identificador exacto y usa su versión consultada", async () => {
  const bytes = await png();
  let posts = 0,
    queries = 0;
  const model = {
    owner: "black-forest-labs",
    name: "flux-schnell",
    latest_version: { id: "a".repeat(64), openapi_schema: schema },
  };
  await transport(
    async (url, init) => {
      const u = new URL(String(url));
      if (u.hostname === "replicate.delivery") {
        assert.equal(new Headers(init?.headers).get("Authorization"), null);
        return new Response(new Uint8Array(bytes));
      }
      if (u.pathname.endsWith("/account"))
        return json({ username: "synthetic" });
      if (u.pathname.endsWith("/search")) {
        queries++;
        assert.equal(u.searchParams.get("query"), "flux");
        return json({
          models: [{ model, metadata: { tags: ["text-to-image"] } }],
        });
      }
      if (u.pathname.includes("/models/")) return json(model);
      posts++;
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.version, "a".repeat(64));
      assert.equal(body.input.num_outputs, 1);
      return json({
        id: "prediction",
        status: "succeeded",
        output: ["https://replicate.delivery/test.png"],
        metrics: { predict_time: 2 },
      });
    },
    async () => {
      const result = await adapter("replicate").listModels(key, "flux");
      assert.equal(queries, 1);
      const exact = await adapter("replicate").listModels(
        key,
        "black-forest-labs/flux-schnell",
      );
      assert.equal(exact.length, 1);
      const image = await adapter("replicate").generate(key, {
        model: result[0].id,
        prompt: "x",
        quality: "default",
        size: "1:1",
        capability: result[0],
      });
      assert(image.bytes.length > 0);
      assert.equal(posts, 1);
      await assert.rejects(
        adapter("replicate").direct(key, "x", "x"),
        /dirección creativa/,
      );
    },
  );
});
test("descargas de proveedores rechazan SSRF, credenciales en URL y puertos externos antes de red", async () => {
  let calls = 0;
  await transport(
    async () => {
      calls++;
      throw Error("No contactar");
    },
    async () => {
      for (const url of [
        "http://replicate.delivery/a",
        "https://evil.invalid/a",
        "https://replicate.delivery.evil.invalid/a",
        "https://secret@replicate.delivery/a",
        "https://replicate.delivery:444/a",
        "file:///etc/passwd",
      ]) {
        await assert.rejects(
          downloadProviderImage(url, ["replicate.delivery"]),
          /no autorizada/,
        );
      }
      assert.equal(calls, 0);
    },
  );
});
test("huellas de capacidades no dependen de etiqueta/búsqueda, sí de versión y parámetros", () => {
  const cap = imageCapability("owner/model", "Label", schema, "a".repeat(64))!;
  assert.equal(
    capabilityFingerprint(cap),
    capabilityFingerprint({
      ...cap,
      label: "Otra etiqueta",
      discoveryQuery: "flux",
    }),
  );
  assert.notEqual(
    capabilityFingerprint(cap),
    capabilityFingerprint({
      ...cap,
      binding: { ...cap.binding, version: "b".repeat(64) },
    }),
  );
});

test("OpenAI: niveles compatibles, salida vacía/incompleta conserva uso sin reintentar y los rechazos siguen siendo errores",async()=>{
  let calls=0;
  await transport(async(_url,init)=>{
    calls++;
    const body=JSON.parse(String(init?.body));
    if(calls<=3){
      assert.equal(body.reasoning.effort,["low","medium","high"][calls-1]);
      assert.equal(body.max_output_tokens,[3072,6144,12288][calls-1]);
      return json({status:"incomplete",incomplete_details:{reason:"max_output_tokens"},output:[{type:"reasoning",summary:[]}],usage:{output_tokens:42}});
    }
    assert.equal(body.reasoning,undefined);
    if(calls===4)return json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Afiche profesional"}]}]});
    if(calls===5)return json({status:"completed",output:[{type:"message",content:[{type:"refusal",refusal:"No autorizado"}]}]});
    if(calls===6)return json({status:"incomplete",incomplete_details:{reason:"content_filter"},output:[]});
    if(calls===7)return new Response("",{status:429});
    return json({status:"failed",error:{code:"server_error"},output:[]});
  },async()=>{
    for(const level of ["low","medium","high"] as const){
      const plan=await adapter("openai").direct(key,"gpt-5-mini","Brief",false,undefined,level);
      assert.equal(plan.text,"");assert.equal(plan.incomplete,true);assert.deepEqual(plan.usage,{output_tokens:42});
    }
    assert.equal((await adapter("openai").direct(key,"gpt-4.1","Brief")).text,"Afiche profesional");
    await assert.rejects(adapter("openai").direct(key,"gpt-4.1","Brief"),/no pudo autorizar/);
    await assert.rejects(adapter("openai").direct(key,"gpt-4.1","Brief"),/no pudo autorizar/);
    await assert.rejects(adapter("openai").direct(key,"gpt-4.1","Brief"),/límite/);
    await assert.rejects(adapter("openai").direct(key,"gpt-4.1","Brief"),/no pudo autorizar/);
    assert.equal(calls,8);
  });
});

test("Google: pensamiento por familia, sin parámetros incompatibles y respuesta truncada recuperable sin eludir bloqueos",async()=>{
  let calls=0;
  await transport(async(_url,init)=>{
    calls++;const body=JSON.parse(String(init?.body));const config=body.generationConfig;
    if(calls===1){assert.equal(config.thinkingConfig.thinkingBudget,1536);assert(config.maxOutputTokens>config.thinkingConfig.thinkingBudget);}
    if(calls===2)assert.equal(config.thinkingConfig.thinkingLevel,"medium");
    if(calls===3)assert.equal(config.thinkingConfig.thinkingLevel,"low");
    if(calls===4)assert.equal(config.thinkingConfig,undefined);
    if(calls===5)return json({promptFeedback:{blockReason:"SAFETY"},candidates:[]});
    if(calls===6)return json({candidates:[{finishReason:"SAFETY",content:{parts:[]}}]});
    return json({candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{thought:true,text:"Privado"}]}}],usageMetadata:{totalTokenCount:21}});
  },async()=>{
    for(const model of ["gemini-2.5-flash","gemini-3.1-pro-preview","gemini-3-pro-preview","gemini-2.0-flash"]){
      const result=await adapter("google").direct(key,model,"Brief",false,undefined,"medium");assert.equal(result.text,"");assert.equal(result.incomplete,true);assert.deepEqual(result.usage,{totalTokenCount:21});
    }
    await assert.rejects(adapter("google").direct(key,"gemini-2.5-flash","Brief"),/no pudo autorizar/);
    await assert.rejects(adapter("google").direct(key,"gemini-2.5-flash","Brief"),/no pudo autorizar/);
    assert.equal(calls,6);
  });
});
