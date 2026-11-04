import { categoryKey } from "./category-paste";
export function usageBatchRevisionPayload(
  items: { name: string }[],
  countries: string[],
  usage: Record<string, { revision: string | null } | undefined>,
) {
  const names = [...new Set(items.map((item) => categoryKey(item.name)))],
    codes = [...new Set(countries)];
  const keys = names
    .flatMap((name) => codes.map((country) => JSON.stringify([name, country])))
    .sort();
  return JSON.stringify(keys.map((key) => [key, usage[key]?.revision ?? null]));
}
export async function usageBatchRevision(
  items: { name: string }[],
  countries: string[],
  usage: Record<string, { revision: string | null } | undefined>,
) {
  const bytes = new TextEncoder().encode(
    usageBatchRevisionPayload(items, countries, usage),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
