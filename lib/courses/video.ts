import { requireModel, type CatalogItem } from "./providers";
import {
  providerJSON,
  boundedBytes,
  safeProviderError,
} from "../providers/http";
import { demand } from "../errors";
import type { CourseSettings } from "./schema";
export type VideoRemote = {
  provider: "gemini" | "fal";
  kind: "file" | "operation" | "fal";
  name?: string;
  statusURL?: string;
  resultURL?: string;
  requestId?: string;
  pollAfter?: number;
};
const google = "https://generativelanguage.googleapis.com/v1beta/";
export function safeVideoURL(raw: unknown, provider: string, queue = false) {
  demand(
    typeof raw === "string" && raw.length < 4000,
    "El proveedor no devolvió una dirección de video válida.",
    502,
  );
  const u = new URL(raw);
  demand(
    u.protocol === "https:" && !u.username && !u.password && !u.port,
    "Dirección de video no autorizada.",
    502,
  );
  if (queue)
    demand(
      u.hostname === "queue.fal.run" &&
        /\/requests\/[a-zA-Z0-9_-]+(?:\/status)?$/.test(u.pathname),
      "Seguimiento fal.ai inválido.",
      502,
    );
  else
    demand(
      provider === "gemini"
        ? [
            "generativelanguage.googleapis.com",
            "storage.googleapis.com",
          ].includes(u.hostname) ||
            u.hostname.endsWith(".googleusercontent.com")
        : u.hostname === "fal.media" || u.hostname.endsWith(".fal.media"),
      "Descarga de video fuera del proveedor.",
      502,
    );
  u.searchParams.delete("key");
  u.searchParams.delete("access_token");
  return u.href;
}
export function videoParameters(model: CatalogItem, s: CourseSettings) {
  const o = model.options;
  demand(o, "El modelo no tiene parámetros de video compatibles.", 409);
  if (o.resolutions.length)
    demand(
      o.resolutions.includes(s.videoResolution),
      "Elige una resolución admitida por el modelo.",
      409,
    );
  if (o.durations.length)
    demand(
      o.durations.includes(s.videoDuration),
      "Elige una duración admitida por el modelo.",
      409,
    );
  if (o.aspects.length)
    demand(
      o.aspects.includes(s.videoAspect),
      "Elige un formato admitido por el modelo.",
      409,
    );
  return o;
}
async function api(provider: string, key: string, url: string, body?: unknown) {
  return providerJSON(
    provider,
    url,
    {
      headers: {
        ...(provider === "gemini"
          ? { "x-goog-api-key": key }
          : { Authorization: "Key " + key }),
        "Content-Type": "application/json",
      },
      method: body ? "POST" : "GET",
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(body ? 180000 : 20000),
    },
    3000000,
  );
}
export async function submitVideo(
  s: CourseSettings,
  prompt: string,
  revision: number,
): Promise<VideoRemote> {
  const c = await requireModel(
      s.videoProvider,
      s.videoModel,
      "video",
      revision,
    ),
    model = (c.models as unknown as CatalogItem[]).find(
      (m) => m.id === s.videoModel,
    )!;
  const options = videoParameters(model, s);
  if (s.videoProvider === "fal") {
    const input: Record<string, unknown> = { prompt };
    const b = options.binding ?? {};
    if (b.duration)
      input[b.duration] =
        b.durationType === "string" ? String(s.videoDuration) : s.videoDuration;
    if (b.resolution && options.resolutions.length)
      input[b.resolution] = s.videoResolution;
    if (b.aspect && options.aspects.length) input[b.aspect] = s.videoAspect;
    const r = await api(
      "fal",
      c.key,
      "https://queue.fal.run/" + s.videoModel,
      input,
    );
    demand(
      typeof r.request_id === "string" && /^[a-zA-Z0-9_-]+$/.test(r.request_id),
      "No se confirmó la solicitud de video. Revisa fal.ai antes de repetir.",
      502,
    );
    const statusURL = safeVideoURL(r.status_url, "fal", true),
      resultURL = safeVideoURL(r.response_url, "fal", true);
    demand(
      new URL(statusURL).pathname.includes("/requests/" + r.request_id) &&
        new URL(resultURL).pathname.endsWith("/requests/" + r.request_id),
      "Identificador de seguimiento inconsistente.",
      502,
    );
    return {
      provider: "fal",
      kind: "fal",
      statusURL,
      resultURL,
      requestId: r.request_id,
    };
  }
  if (s.videoModel.startsWith("veo-")) {
    const r = await api(
      "gemini",
      c.key,
      google +
        "models/" +
        encodeURIComponent(s.videoModel) +
        ":predictLongRunning",
      {
        instances: [{ prompt }],
        parameters: {
          aspectRatio: s.videoAspect,
          resolution: s.videoResolution,
          durationSeconds: s.videoDuration,
          sampleCount: 1,
        },
      },
    );
    demand(
      typeof r.name === "string" &&
        /^(?:models\/[a-zA-Z0-9._-]+\/)?operations\/[a-zA-Z0-9._-]+$/.test(
          r.name,
        ),
      "Google no confirmó el seguimiento del video. Revisa su panel antes de repetir.",
      502,
    );
    return { provider: "gemini", kind: "operation", name: r.name };
  }
  const r = await api("gemini", c.key, google + "interactions", {
    model: s.videoModel,
    input: prompt + "\nDuración objetivo: " + s.videoDuration + " segundos.",
    response_format: {
      type: "video",
      delivery: "uri",
      aspect_ratio: s.videoAspect,
      resolution: s.videoResolution,
    },
  });
  const video =
    (r.steps ?? [])
      .filter((p: any) => p.type === "model_output")
      .flatMap((p: any) => p.content ?? [])
      .find((p: any) => p.type === "video") ?? r.output_video;
  demand(
    typeof video?.uri === "string",
    "Google no devolvió el archivo de video; revisa su panel antes de repetir.",
    502,
  );
  const url = video.uri.startsWith("files/") ? google + video.uri : video.uri;
  const safe = safeVideoURL(url, "gemini"),
    name = new URL(safe).pathname.match(/\/files\/([a-zA-Z0-9_-]+)/)?.[1];
  demand(
    name,
    "Google no devolvió un identificador de archivo compatible.",
    502,
  );
  return { provider: "gemini", kind: "file", name: "files/" + name };
}
async function download(raw: string, provider: string, key: string) {
  let url = safeVideoURL(raw, provider);
  for (let i = 0; i < 5; i++) {
    const host = new URL(url).hostname;
    const r = await fetch(url, {
      headers:
        host === "generativelanguage.googleapis.com"
          ? { "x-goog-api-key": key }
          : {},
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    });
    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get("location");
      demand(location, "Redirección de video incompleta.", 502);
      url = safeVideoURL(new URL(location, url).href, provider);
      continue;
    }
    demand(r.ok, safeProviderError(provider, r.status), 502);
    const bytes = await boundedBytes(r, 64 * 1024 * 1024);
    demand(
      bytes.length > 12 && bytes.subarray(4, 8).toString() === "ftyp",
      "El proveedor no entregó un MP4 válido.",
      502,
    );
    return bytes;
  }
  throw Error("Demasiadas redirecciones de video");
}
export async function pollVideo(
  s: CourseSettings,
  remote: VideoRemote,
  revision: number,
) {
  const c = await requireModel(
    s.videoProvider,
    s.videoModel,
    "video",
    revision,
  );
  demand(
    remote.provider === s.videoProvider,
    "El seguimiento pertenece a otro proveedor.",
    409,
  );
  if (remote.kind === "fal") {
    const status = await api(
      "fal",
      c.key,
      safeVideoURL(remote.statusURL, "fal", true),
    );
    if (["IN_QUEUE", "IN_PROGRESS"].includes(status.status)) return null;
    demand(
      status.status === "COMPLETED",
      "fal.ai no completó el video. Revisa la solicitud guardada antes de generar otro.",
      502,
    );
    const result = await api(
      "fal",
      c.key,
      safeVideoURL(remote.resultURL, "fal", true),
    );
    return download(result.video?.url??result.videos?.[0]?.url, "fal", c.key);
  }
  if (remote.kind === "file") {
    demand(
      /^files\/[a-zA-Z0-9_-]+$/.test(remote.name ?? ""),
      "Archivo Google no válido.",
      409,
    );
    const r = await api("gemini", c.key, google + remote.name);
    if (r.state === "PROCESSING") return null;
    demand(
      r.state === "ACTIVE",
      "Google no pudo preparar el archivo de video.",
      502,
    );
    return download(
      google + remote.name + ":download?alt=media",
      "gemini",
      c.key,
    );
  }
  demand(
    /^(?:models\/[a-zA-Z0-9._-]+\/)?operations\/[a-zA-Z0-9._-]+$/.test(
      remote.name ?? "",
    ),
    "Operación Google no válida.",
    409,
  );
  const r = await api("gemini", c.key, google + remote.name);
  if (!r.done) return null;
  demand(
    !r.error,
    "Google no completó el video. Revisa su panel antes de repetir.",
    502,
  );
  return download(
    r.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
    "gemini",
    c.key,
  );
}
