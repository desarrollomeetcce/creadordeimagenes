import { categoryKey } from "./category-paste";
import { AppError } from "../errors";
export type InventoryNameKind = "PRIMARY" | "SECONDARY" | "INVENTORY";
export type InventoryNamed = { kind: InventoryNameKind; name: string };
export type InventoryNameDecision = InventoryNamed & { useName: string };
export type InventoryNameConflict = InventoryNamed & { similar: string[] };
export function inventoryNameConflicts(
  incoming: InventoryNamed[],
  existing: InventoryNamed[],
) {
  const pools = new Map<InventoryNameKind, string[]>();
  for (const v of existing)
    if (v.name)
      (pools.get(v.kind) ?? (pools.set(v.kind, []), pools.get(v.kind)!)).push(
        v.name,
      );
  const conflicts: InventoryNameConflict[] = [];
  for (const v of incoming) {
    const pool = pools.get(v.kind) ?? [];
    if (!v.name || pool.includes(v.name)) continue;
    const similar = [
      ...new Set(pool.filter((n) => categoryKey(n) === categoryKey(v.name))),
    ];
    if (similar.length) conflicts.push({ ...v, similar });
    pool.push(v.name);
    pools.set(v.kind, pool);
  }
  return conflicts;
}
export function resolveInventoryName(
  kind: InventoryNameKind,
  name: string,
  existing: string[],
  decisions: InventoryNameDecision[] = [],
) {
  if (existing.includes(name)) return name;
  const similar = existing.filter((n) => categoryKey(n) === categoryKey(name));
  if (!similar.length) return name;
  const choice = decisions.find((d) => d.kind === kind && d.name === name);
  if (!choice || !(choice.useName === name || similar.includes(choice.useName)))
    throw new AppError(
      `Ya existe un nombre similar a «${name}»: ${[...new Set(similar)].map((n) => "«" + n + "»").join(", ")}. Elige reutilizar uno o mantener ambos como distintos.`,
      409,
    );
  return choice.useName;
}
