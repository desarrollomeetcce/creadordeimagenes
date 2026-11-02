import type { CatalogItem } from "./providers";
import { providerJSON } from "../providers/http";
export const googleVideoModels: Record<string, CatalogItem["options"]> = {
  "gemini-omni-1.1-flash": {
    resolutions: ["360p", "720p", "1080p", "4k"],
    durations: [3, 4, 5, 6, 7, 8, 9, 10],
    aspects: ["16:9", "9:16"],
  },
  "veo-3.0-generate-001": {
    resolutions: ["720p", "1080p"],
    durations: [8],
    aspects: ["16:9", "9:16"],
  },
  "veo-3.0-fast-generate-001": {
    resolutions: ["720p", "1080p"],
    durations: [8],
    aspects: ["16:9", "9:16"],
  },
};
// Only documented current model IDs intersected with the account's own response.
export const googleSpeechModels = new Set([
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
]);
export function falVideoCapability(model: any): CatalogItem | null {
  if (
    typeof model.endpoint_id !== "string" ||
    !/^fal-ai\/[a-zA-Z0-9._/-]+$/.test(model.endpoint_id) ||
    model.endpoint_id.includes("..") ||
    model.endpoint_id.length > 150
  )
    return null;
  const root = model.openapi ?? {},
    schemas = root.components?.schemas ?? {};
  const resolve = (v: any): any =>
    v?.$ref?.startsWith("#/components/schemas/")
      ? schemas[v.$ref.split("/").pop()]
      : v;
  let input = schemas.Input;
  for (const p of Object.values(root.paths ?? {}) as any[])
    input ??= resolve(
      p.post?.requestBody?.content?.["application/json"]?.schema,
    );
  input = resolve(input);
  let output = resolve(schemas.Output);
  for (const p of Object.values(root.paths ?? {}) as any[])
    output ??= resolve(
      p.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    );
  if (!output?.properties?.video && !output?.properties?.videos) return null;
  const props = input?.properties ?? {};
  if (props.prompt?.type !== "string") return null;
  const allowed = new Set([
    "prompt",
    "resolution",
    "duration",
    "duration_seconds",
    "aspect_ratio",
  ]);
  if ((input.required ?? []).some((k: string) => !allowed.has(k))) return null;
  const enums = (p: any): any[] =>
    resolve(p)?.enum ?? (p?.anyOf ?? []).flatMap((x: any) => x.enum ?? []);
  const binding: Record<string, string> = {},
    durations: number[] = [],
    resolutions: string[] = [],
    aspects: string[] = [];
  if (props.resolution) {
    resolutions.push(
      ...enums(props.resolution).filter((v: any) => typeof v === "string"),
    );
    binding.resolution = "resolution";
  }
  const field = props.duration
    ? "duration"
    : props.duration_seconds
      ? "duration_seconds"
      : null;
  if (field) {
    const p = props[field];
    durations.push(
      ...enums(p)
        .map(Number)
        .filter((n: number) => n >= 3 && n <= 20),
    );
    if (!durations.length)
      for (const n of [4, 5, 6, 8, 10])
        if (n >= (p.minimum ?? 3) && n <= (p.maximum ?? 20)) durations.push(n);
    binding.duration = field;
    binding.durationType = p.type === "string" ? "string" : "number";
  }
  if (props.aspect_ratio) {
    aspects.push(
      ...enums(props.aspect_ratio).filter((v: any) =>
        ["16:9", "9:16"].includes(v),
      ),
    );
    binding.aspect = "aspect_ratio";
  }
  return {
    id: model.endpoint_id,
    name: model.metadata?.display_name ?? model.endpoint_id,
    kind: "video",
    options: { resolutions, durations, aspects, binding },
  };
}
export async function falVideoModels(key: string, query = "") {
  const models: CatalogItem[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const p = new URLSearchParams({
      category: "text-to-video",
      status: "active",
      limit: "20",
      expand: "openapi-3.0",
    });
    if (query) p.set("q", query);
    if (cursor) p.set("cursor", cursor);
    const r = await providerJSON(
      "fal.ai",
      "https://api.fal.ai/v1/models?" + p,
      { headers: { Authorization: "Key " + key } },
      6000000,
    );
    if (!Array.isArray(r.models)) throw Error("Catálogo fal.ai inválido");
    for (const m of r.models) {
      const cap = falVideoCapability(m);
      if (cap) models.push(cap);
    }
    if (!r.has_more && !r.next_cursor) break;
    if (typeof r.next_cursor !== "string" || r.next_cursor === cursor) break;
    cursor = r.next_cursor;
  }
  return models;
}

export const googleImageNames: Record<string, string> = {
  "gemini-nano-banana-2.1": "Nano Banana 2.1 · Gemini",
  "gemini-3.1-flash-lite-image": "Nano Banana 2 Lite · Gemini",
  "gemini-3.1-flash-image": "Nano Banana 2 · Gemini",
  "gemini-3-pro-image": "Nano Banana Pro · Gemini",
  "gemini-2.5-flash-image": "Nano Banana · Gemini 2.5",
};
export async function falImageModels(key: string, query = "") {
  const { imageCapability } = await import("../providers/schema");
  const models: CatalogItem[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const p = new URLSearchParams({
      category: "text-to-image",
      status: "active",
      limit: "20",
      expand: "openapi-3.0",
    });
    if (query) p.set("q", query);
    if (cursor) p.set("cursor", cursor);
    const r = await providerJSON(
      "fal.ai",
      "https://api.fal.ai/v1/models?" + p,
      { headers: { Authorization: "Key " + key } },
      6000000,
    );
    if (!Array.isArray(r.models)) throw Error("Catálogo de imágenes inválido");
    for (const m of r.models) {
      if (
        typeof m.endpoint_id !== "string" ||
        !/^fal-ai\/[a-zA-Z0-9._/-]+$/.test(m.endpoint_id) ||
        m.endpoint_id.length > 100 ||
        m.endpoint_id.includes("..")
      )
        continue;
      const schemas = m.openapi?.components?.schemas ?? {};
      const output =
        schemas.Output ??
        Object.values(schemas).find(
          (v: any) => v?.properties?.images || v?.properties?.image,
        );
      if (
        !(output as any)?.properties?.images &&
        !(output as any)?.properties?.image
      )
        continue;
      const cap = imageCapability(
        m.endpoint_id,
        m.metadata?.display_name ?? m.endpoint_id,
        m.openapi,
      );
      if (cap && !cap.binding?.requiresReference)
        models.push({
          id: cap.id,
          name: cap.label ?? cap.id,
          kind: "image",
          image: cap,
        });
    }
    if (!r.has_more && !r.next_cursor) break;
    if (typeof r.next_cursor !== "string" || r.next_cursor === cursor) break;
    cursor = r.next_cursor;
  }
  return models;
}
