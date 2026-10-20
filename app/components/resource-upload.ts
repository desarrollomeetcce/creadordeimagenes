"use client";
import {
  maxResourceFileBytes,
  smallResourceFileBytes,
  uploadChunkBytes,
} from "../../lib/large-upload-limits";
export class UploadPaused extends Error {
  constructor() {
    super(
      "Subida pausada. Selecciona el mismo archivo en esta carpeta para continuar.",
    );
  }
}
const request = async (path: string, init?: RequestInit) => {
  const r = await fetch("/api/" + path, { ...init, cache: "no-store" });
  const value = await r.json();
  if (!r.ok) throw Error(value.error ?? "No se pudo subir el archivo.");
  return value;
};
async function preview(file: File) {
  if (!file.type.startsWith("image/")) return null;
  try {
    const header = new Uint8Array(await file.slice(0, 1048576).arrayBuffer());
    let w = 0,
      h = 0;
    if (header[0] === 137 && header[1] === 80) {
      const view = new DataView(header.buffer);
      w = view.getUint32(16);
      h = view.getUint32(20);
    } else if (header[0] === 255 && header[1] === 216) {
      let i = 2;
      while (i + 9 < header.length) {
        if (header[i] !== 255) {
          i++;
          continue;
        }
        const marker = header[i + 1],
          length = (header[i + 2] << 8) + header[i + 3];
        if (
          [
            192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
          ].includes(marker)
        ) {
          h = (header[i + 5] << 8) + header[i + 6];
          w = (header[i + 7] << 8) + header[i + 8];
          break;
        }
        if (length < 2) break;
        i += 2 + length;
      }
    }
    // Unsupported/oversized image metadata is stored as an original without decoding unbounded pixels.
    if ((!w || !h) && file.size > 32000000) return null;
    if (w * h > 20000000) return null;
    const image = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    try {
      if (image.width * image.height > 20000000) return null;
      const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      canvas
        .getContext("2d")!
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9),
      );
      return blob && blob.size <= 3000000
        ? new File([blob], "preview.webp", { type: "image/webp" })
        : null;
    } finally {
      image.close();
    }
  } catch {
    return null;
  }
}
export async function uploadResource(
  file: File,
  options: {
    folderId: string;
    purpose: string;
    userId: string;
    paused: () => boolean;
    onProgress: (bytes: number, total: number) => void;
  },
) {
  if (!file.size || file.size > maxResourceFileBytes)
    throw Error("El archivo debe tener contenido y no superar 1 GB (1024 MB).");
  if (file.size <= smallResourceFileBytes) {
    const form = new FormData();
    form.set("file", file);
    form.set("folderId", options.folderId);
    form.set("purpose", options.purpose);
    const saved = await request("storage/files", {
      method: "POST",
      body: form,
    });
    options.onProgress(file.size, file.size);
    return saved;
  }
  const storageKey = `resource-upload:${options.userId}:${options.folderId}:${file.name}:${file.size}:${file.lastModified}`;
  let clientKey = "";
  try {
    clientKey = sessionStorage.getItem(storageKey) ?? "";
  } catch {}
  if (!clientKey) {
    clientKey = crypto.randomUUID();
    try {
      sessionStorage.setItem(storageKey, clientKey);
    } catch {}
  }
  const started = await request("storage/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey,
        name: file.name,
        size: file.size,
        folderId: options.folderId || null,
        purpose: options.purpose,
      }),
    }),
    status = await request("storage/uploads/" + started.id),
    known = new Set<number>(status.indices);
  let sent = status.receivedBytes;
  options.onProgress(sent, file.size);
  try {
    for (
      let index = 0;
      index < Math.ceil(file.size / uploadChunkBytes);
      index++
    ) {
      if (options.paused()) throw new UploadPaused();
      if (known.has(index)) continue;
      const part = file.slice(
        index * uploadChunkBytes,
        Math.min(file.size, (index + 1) * uploadChunkBytes),
      );
      const saved = await request(
        `storage/uploads/${started.id}/chunks/${index}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: part,
        },
      );
      sent = saved.receivedBytes;
      options.onProgress(sent, file.size);
    }
    if (options.paused()) throw new UploadPaused();
    const form = new FormData(),
      image = await preview(file);
    if (image) form.set("preview", image);
    if (/\.(txt|csv)$/i.test(file.name))
      form.set("excerpt", await file.slice(0, 65000).text());
    const saved = await request(`storage/uploads/${started.id}/complete`, {
      method: "POST",
      body: form,
    });
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
    return saved;
  } catch (error) {
    throw error;
  }
}
