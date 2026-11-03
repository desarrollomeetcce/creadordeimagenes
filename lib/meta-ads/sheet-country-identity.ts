import type { Prisma } from "@prisma/client";
import { isCountryCode } from "./countries";
export function renamedTableCountries(config: unknown): Record<string, string> {
  const raw = (
    config as {
      inventoryActivation?: { renamedTableCountries?: unknown };
    } | null
  )?.inventoryActivation?.renamedTableCountries;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.fromEntries(
        Object.entries(raw).filter(
          ([, v]) => typeof v === "string" && (v === "" || isCountryCode(v)),
        ),
      )
    : {};
}
/** Only read identity metadata, never another inventory's sales, people or full settings. */
export async function sheetCountryIdentities(
  tx: Prisma.TransactionClient,
  ids: string[],
) {
  const wanted = new Set(ids);
  if (!wanted.size) return new Map<string, string>();
  const rows = await tx.$queryRaw<
    { identities: unknown }[]
  >`SELECT config->'inventoryActivation'->'renamedTableCountries' AS identities FROM "MetaEffectivenessSheet" WHERE kind='INVENTORY' AND jsonb_typeof(config->'inventoryActivation'->'renamedTableCountries')='object' ORDER BY "createdAt",id`;
  const result = new Map<string, string>();
  for (const row of rows)
    if (
      row.identities &&
      typeof row.identities === "object" &&
      !Array.isArray(row.identities)
    )
      for (const [id, value] of Object.entries(row.identities))
        if (
          wanted.has(id) &&
          !result.has(id) &&
          typeof value === "string" &&
          (value === "" || isCountryCode(value))
        )
          result.set(id, value);
  return result;
}
