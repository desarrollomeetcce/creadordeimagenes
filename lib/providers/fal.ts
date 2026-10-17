import type { ProviderAdapter, ModelCapability, ImageInput } from "./index";
import { AppError, demand } from "../errors";
import { providerJSON, providerSignal, downloadProviderImage } from "./http";
import { imageCapability, imageArguments } from "./schema";
const api = "https://api.fal.ai/v1/";
const modelPath = (id: string) => {
  demand(
    /^[\w-]+(?:\/[\w.-]+){1,8}$/.test(id) &&
      id.length <= 100 &&
      !id.split("/").some((x) => x === "." || x === ".."),
    "El identificador del modelo de fal.ai no es válido.",
  );
  return id;
};
function queueURL(value: unknown) {
  demand(
    typeof value === "string" && value.length <= 2500,
    "fal.ai no devolvió una dirección de seguimiento válida.",
    502,
  );
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new AppError("fal.ai devolvió un seguimiento ilegible.", 502);
  }
  demand(
    u.origin === "https://queue.fal.run" &&
      !u.username &&
      !u.password &&
      u.pathname.includes("/requests/"),
    "fal.ai devolvió una dirección de seguimiento no autorizada.",
    502,
  );
  return u.href;
}
export class FalAdapter implements ProviderAdapter {
  id = "fal";
  name = "fal.ai";
  async listModels(key: string, query = "") {
    const models: ModelCapability[] = [],
      seen = new Set<string>(),
      signal = AbortSignal.timeout(90000);
    for (const category of ["text-to-image", "image-to-image"]) {
      let cursor = "";
      let complete = false;
      for (let page = 0; page < 100; page++) {
        const params = new URLSearchParams({
          category,
          status: "active",
          limit: "20",
          expand: "openapi-3.0",
        });
        if (query) params.set("q", query);
        if (cursor) params.set("cursor", cursor);
        const data = await providerJSON(this.name, api + "models?" + params, {
          headers: { Authorization: `Key ${key}` },
          signal,
        });
        demand(
          Array.isArray(data.models),
          "fal.ai no devolvió un catálogo válido.",
          502,
        );
        for (const m of data.models) {
          if (typeof m.endpoint_id !== "string" || seen.has(m.endpoint_id))
            continue;
          try {
            modelPath(m.endpoint_id);
          } catch {
            continue;
          }
          seen.add(m.endpoint_id);
          const capability = imageCapability(
            m.endpoint_id,
            typeof m.metadata?.display_name === "string"
              ? m.metadata.display_name
              : m.endpoint_id,
            m.openapi,
          );
          if (capability) models.push(capability);
        }
        if (!data.has_more && !data.next_cursor) {
          complete = true;
          break;
        }
        demand(
          typeof data.next_cursor === "string" &&
            data.next_cursor.length <= 2000 &&
            data.next_cursor !== cursor,
          "fal.ai devolvió una paginación no válida.",
          502,
        );
        cursor = data.next_cursor;
      }
      demand(
        complete,
        "El catálogo de fal.ai supera el límite de consulta; no se presentó como completo.",
        502,
      );
    }
    return models;
  }
  async generate(
    key: string,
    args: {
      model: string;
      prompt: string;
      quality: string;
      size: string;
      images?: ImageInput[];
      signal?: AbortSignal;
      capability?: ModelCapability;
    },
  ) {
    const input = imageArguments(args),
      signal = providerSignal(args.signal),
      headers = {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      };
    const submitted = await providerJSON(
      this.name,
      "https://queue.fal.run/" + modelPath(args.model),
      { method: "POST", headers, signal, body: JSON.stringify(input) },
    );
    const statusURL = queueURL(submitted.status_url),
      resultURL = queueURL(submitted.response_url);
    for (let poll = 0; poll < 180; poll++) {
      const status = await providerJSON(this.name, statusURL, {
        headers,
        signal,
      });
      if (status.status === "COMPLETED") {
        const result = await providerJSON(this.name, resultURL, {
          headers,
          signal,
        });
        const url = result.images?.[0]?.url ?? result.image?.url;
        demand(
          typeof url === "string",
          "fal.ai no devolvió una imagen. Revisa la solicitud en su panel antes de otro intento.",
          502,
        );
        return {
          bytes: await downloadProviderImage(url, ["fal.media"], signal),
          usage: {
            requestId:
              typeof submitted.request_id === "string"
                ? submitted.request_id
                : null,
          },
        };
      }
      demand(
        ["IN_QUEUE", "IN_PROGRESS"].includes(status.status),
        "fal.ai no pudo completar la imagen. Revisa su panel antes de autorizar otro intento.",
        502,
      );
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(done, 1000);
        function done() {
          signal.removeEventListener("abort", abort);
          resolve();
        }
        function abort() {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(
            new AppError(
              "Se interrumpió el seguimiento de fal.ai. La solicitud puede seguir activa; revisa su panel antes de repetirla.",
              502,
            ),
          );
        }
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    throw new AppError(
      "fal.ai sigue procesando la solicitud. Revisa su panel antes de autorizar otro intento.",
      502,
    );
  }
  async direct(): Promise<{ text: string; usage: unknown }> {
    throw new AppError(
      "Selecciona Google u OpenAI para la dirección creativa. fal.ai se utiliza aquí para generar imágenes.",
      409,
    );
  }
}
