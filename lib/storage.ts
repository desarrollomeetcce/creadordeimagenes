import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { demand } from "./errors";
import { db } from "./db";
const root = () => resolve(process.env.STORAGE_PATH ?? "./data/assets");
const maxAssetBytes = 16 * 1024 * 1024;
export function storageBackend() {
  const value =
    process.env.STORAGE_BACKEND || (process.env.VERCEL ? "postgres" : "local");
  demand(
    value === "postgres" || value === "local",
    "La configuración del almacenamiento no es válida.",
    503,
  );
  demand(
    !(process.env.VERCEL && value === "local"),
    "Configura almacenamiento persistente antes de guardar archivos.",
    503,
  );
  return value;
}
export function storageByteLimit() {
  const value = Number(process.env.STORAGE_LIMIT_MB ?? 128);
  demand(
    Number.isInteger(value) && value >= 16 && value <= 1024,
    "El límite de almacenamiento no es válido.",
    503,
  );
  return value * 1024 * 1024;
}
export const maxUploadBytes = () => (process.env.VERCEL ? 3000000 : 10000000);
export async function storageStatus() {
  const backend = storageBackend();
  if (backend === "local")
    return {
      backend,
      usedBytes: null,
      limitBytes: null,
      maxUploadBytes: maxUploadBytes(),
    };
  const sum = await db.storedAsset.aggregate({ _sum: { size: true } });
  const audit = await db.auditThumbnail.aggregate({ _sum: { size: true } });
  return {
    backend,
    usedBytes: (sum._sum.size ?? 0) + (audit._sum.size ?? 0),
    limitBytes: storageByteLimit(),
    maxUploadBytes: maxUploadBytes(),
  };
}
export async function requireStorageSpace(bytes = maxAssetBytes) {
  const status = await storageStatus();
  if (status.limitBytes !== null)
    demand(
      status.usedBytes! + bytes <= status.limitBytes,
      "No hay espacio suficiente para guardar otro afiche. Libera archivos temporales o amplía la capacidad antes de generar.",
      413,
    );
}
export async function store(bytes: Buffer) {
  demand(
    bytes.length > 0 && bytes.length <= maxAssetBytes,
    "El archivo procesado supera el máximo de 16 MB o está vacío.",
    413,
  );
  if (storageBackend() === "postgres") {
    const id = randomUUID();
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(440819)`;
      const sum = await tx.storedAsset.aggregate({ _sum: { size: true } });
      const audit = await tx.auditThumbnail.aggregate({ _sum: { size: true } });
      demand(
        (sum._sum.size ?? 0) + (audit._sum.size ?? 0) + bytes.length <=
          storageByteLimit(),
        "El almacenamiento está lleno. Libera archivos temporales o amplía la capacidad.",
        413,
      );
      await tx.storedAsset.create({
        data: { id, data: new Uint8Array(bytes), size: bytes.length },
      });
    });
    return `pg:${id}`;
  }
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const name = randomUUID();
  await writeFile(join(root(), name), bytes, { mode: 0o600 });
  return name;
}
function path(name: string) {
  demand(/^[a-f0-9-]{36}$/.test(name), "Archivo no válido.");
  return join(root(), name);
}
function databaseId(name: string) {
  const id = name.slice(3);
  demand(/^pg:[a-f0-9-]{36}$/.test(name), "Archivo no válido.");
  return id;
}
export async function load(name: string) {
  if (!name.startsWith("pg:")) return readFile(path(name));
  const asset = await db.storedAsset.findUnique({
    where: { id: databaseId(name) },
  });
  demand(asset, "El archivo no está disponible.", 404);
  return Buffer.from(asset.data);
}
export async function remove(name: string) {
  if (!name.startsWith("pg:")) return unlink(path(name));
  await db.storedAsset.deleteMany({ where: { id: databaseId(name) } });
}

// Chunked responses let serverless hosts stream private files without one oversized body.
export function fileStream(bytes: Buffer) {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + 65536, bytes.length);
      controller.enqueue(new Uint8Array(bytes.subarray(offset, end)));
      offset = end;
    },
  });
}
