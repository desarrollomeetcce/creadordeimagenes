import type { Prisma } from "@prisma/client";
export function hasRecordedActivity(d: {
  sales: number | null;
  annotations: unknown;
}) {
  const a = (d.annotations ?? {}) as Record<string, { value?: unknown }>;
  return (
    typeof a.budget?.value === "number" ||
    typeof a.sales?.value === "number" ||
    (typeof d.sales === "number" && a.sales?.value !== "NA")
  );
}
/** Saved manual cells only: importing old Meta B/G never starts the reporting clock. */
export async function recordedStarts(
  tx: Prisma.TransactionClient,
  aliasIds: string[],
  today: string,
) {
  const saved = await tx.metaEffectivenessDay.findMany({
    where: { row: { aliasId: { in: aliasIds } }, day: { lte: today } },
    select: {
      day: true,
      sales: true,
      annotations: true,
      row: { select: { aliasId: true, country: true } },
    },
    orderBy: { day: "asc" },
  });
  const starts = new Map<string, string>();
  for (const d of saved)
    if (hasRecordedActivity(d)) {
      const key = JSON.stringify([d.row.aliasId, d.row.country]);
      if (!starts.has(key)) starts.set(key, d.day);
    }
  return starts;
}
/** A linked sheet can be backfilled before any local cell. It supplies only a read boundary; canonical projection still decides each value. */
export async function recordedTableFloor(
  tx: Prisma.TransactionClient,
  tableId: string,
  today: string,
) {
  const tables = new Set<string>();
  let current: string | null = tableId;
  for (let depth = 0; current && !tables.has(current) && depth < 9; depth++) {
    tables.add(current);
    const link: {sourceTableId:string;columns:Prisma.JsonValue}|null = await tx.metaEffectivenessLink.findUnique({
      where: { tableId: current },
      select: { sourceTableId: true, columns: true },
    });
    current =
      link &&
      Array.isArray(link.columns) &&
      link.columns.some((m) => m === "sales" || m === "budget")
        ? link.sourceTableId
        : null;
  }
  const first = await tx.metaEffectivenessDay.aggregate({
    where: {
      row: { alias: { tableId: { in: [...tables] } } },
      day: { lte: today },
    },
    _min: { day: true },
  });
  return first._min.day;
}
