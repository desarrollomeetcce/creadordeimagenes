import type { ProviderAdapter, ModelCapability, ImageInput } from "./index";
import { AppError, demand } from "../errors";
import { providerJSON, providerSignal, downloadProviderImage } from "./http";
import { imageCapability, imageArguments } from "./schema";
const api = "https://api.replicate.com/v1/";
const modelID = (owner: unknown, name: unknown) =>
  typeof owner === "string" &&
  typeof name === "string" &&
  /^[\w-]+$/.test(owner) &&
  /^[\w.-]+$/.test(name) &&
  ![".", ".."].includes(name) &&
  `${owner}/${name}`.length <= 100
    ? `${owner}/${name}`
    : null;
export class ReplicateAdapter implements ProviderAdapter {
  id = "replicate";
  name = "Replicate";
  async listModels(key: string, query = "") {
    const headers = { Authorization: `Bearer ${key}` },
      signal = AbortSignal.timeout(90000);
    const account = await providerJSON(this.name, api + "account", {
      headers,
      signal,
    });
    demand(
      typeof account.username === "string",
      "Replicate no confirmó la cuenta de API.",
      502,
    );
    let candidates: any[];
    if (query && /^[\w-]+\/[\w.-]+$/.test(query)) {
      demand(
        /flux|nano-banana|imagen|seedream|ideogram|stable-diffusion|sdxl|qwen-image/i.test(
          query,
        ),
        "Ese modelo no pertenece a las familias de imágenes compatibles con esta integración.",
      );
      const [owner, name] = query.split("/");
      const id = modelID(owner, name);
      demand(id, "El identificador del modelo no es válido.");
      candidates = [
        await providerJSON(this.name, api + "models/" + id, {
          headers,
          signal,
        }),
      ];
    } else if (query) {
      const result = await providerJSON(
        this.name,
        api + "search?" + new URLSearchParams({ query, limit: "50" }),
        { headers, signal },
      );
      demand(
        Array.isArray(result.models),
        "Replicate no devolvió una búsqueda compatible.",
        502,
      );
      candidates = result.models
        .map((item: any) => item.model ?? item)
        .filter((m: any) =>
          /flux|nano-banana|imagen|seedream|ideogram|stable-diffusion|sdxl|qwen-image/i.test(
            `${m.owner}/${m.name}`,
          ),
        );
    } else {
      const collection = await providerJSON(
        this.name,
        api + "collections/text-to-image",
        { headers, signal },
      );
      demand(
        Array.isArray(collection.models),
        "Replicate no devolvió una colección de imágenes compatible.",
        502,
      );
      candidates = collection.models;
    }
    demand(
      candidates.length <= 500,
      "La búsqueda devolvió demasiados modelos.",
      502,
    );
    const models: ModelCapability[] = [];
    for (let i = 0; i < candidates.length; i += 4) {
      const group = await Promise.all(
        candidates.slice(i, i + 4).map(async (m: any) => {
          const id = modelID(m.owner, m.name);
          if (!id) return null;
          const data = m.latest_version?.openapi_schema
            ? m
            : await providerJSON(this.name, api + "models/" + id, {
                headers,
                signal,
              });
          const version = data.latest_version?.id;
          if (typeof version !== "string" || !/^[a-f0-9]{64}$/.test(version))
            return null;
          return imageCapability(
            id,
            typeof data.name === "string" ? data.name : id,
            data.latest_version.openapi_schema,
            version,
          );
        }),
      );
      for (const item of group) if (item) models.push(item);
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
      version = args.capability?.binding?.version;
    demand(
      typeof version === "string" && /^[a-f0-9]{64}$/.test(version),
      "Consulta de nuevo el modelo de Replicate para confirmar su versión.",
      409,
    );
    const signal = providerSignal(args.signal),
      headers = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };
    let prediction = await providerJSON(this.name, api + "predictions", {
      method: "POST",
      headers: { ...headers, Prefer: "wait=60" },
      signal,
      body: JSON.stringify({ version, input }),
    });
    for (let poll = 0; poll < 180; poll++) {
      if (prediction.status === "succeeded") {
        const url = Array.isArray(prediction.output)
          ? prediction.output[0]
          : prediction.output;
        demand(
          typeof url === "string",
          "Replicate no devolvió una imagen. Revisa el resultado antes de otro intento.",
          502,
        );
        return {
          bytes: await downloadProviderImage(
            url,
            ["replicate.delivery"],
            signal,
          ),
          usage: {
            predictionId:
              typeof prediction.id === "string" ? prediction.id : null,
            metrics: prediction.metrics ?? null,
          },
        };
      }
      demand(
        ["starting", "processing"].includes(prediction.status),
        "Replicate no completó la imagen. Revisa su panel y el consumo antes de otro intento.",
        502,
      );
      demand(
        typeof prediction.id === "string" &&
          /^[a-zA-Z0-9_-]{1,100}$/.test(prediction.id),
        "Replicate no devolvió un identificador de seguimiento válido.",
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
              "Se interrumpió el seguimiento de Replicate. Revisa su panel antes de repetir la solicitud.",
              502,
            ),
          );
        }
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
      prediction = await providerJSON(
        this.name,
        api + "predictions/" + prediction.id,
        { headers, signal },
      );
    }
    throw new AppError(
      "Replicate sigue procesando la imagen. Revisa su panel antes de autorizar otro intento.",
      502,
    );
  }
  async direct(): Promise<{ text: string; usage: unknown }> {
    throw new AppError(
      "Selecciona Google u OpenAI para la dirección creativa. Replicate se utiliza aquí para generar imágenes.",
      409,
    );
  }
}
