import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { demand } from "./errors";
const root = () => resolve(process.env.STORAGE_PATH ?? "./data/assets");
export async function store(bytes: Buffer) {
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const name = randomUUID();
  await writeFile(join(root(), name), bytes, { mode: 0o600 });
  return name;
}
function path(name: string) {
  demand(/^[a-f0-9-]{36}$/.test(name), "Archivo no válido.");
  return join(root(), name);
}
export const load = (name: string) => readFile(path(name));
export const remove = (name: string) => unlink(path(name));
