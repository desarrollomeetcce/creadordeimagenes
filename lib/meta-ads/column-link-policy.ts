import type { Prisma } from "@prisma/client";
import { demand } from "../errors";
import { sheetMetrics, type SheetMetric } from "./period-summary";
export type ColumnLink = {
  tableId: string;
  sourceTableId: string;
  columns: unknown;
  since: string | null;
  until: string | null;
  revision: number;
  createdAt: Date;
};
export const linkMetrics = (link: Pick<ColumnLink, "columns">) =>
  sheetMetrics
    .filter((m) => Array.isArray(link.columns) && link.columns.includes(m.key))
    .map((m) => m.key);
export const linkCoversDay = (
  link: Pick<ColumnLink, "since" | "until">,
  day: string,
) => (!link.since || day >= link.since) && (!link.until || day <= link.until);
export function checkColumnLinkPath(
  tableId: string,
  sourceTableId: string,
  links: { tableId: string; sourceTableId: string }[],
) {
  const seen = new Set([tableId]);
  let at = sourceTableId;
  for (let depth = 0; ; depth++) {
    demand(
      !seen.has(at),
      "Esta vinculación crearía un ciclo entre hojas.",
      409,
    );
    demand(depth < 8, "Vincula hasta ocho hojas consecutivas.", 409);
    seen.add(at);
    const next = links.find((l) => l.tableId === at);
    if (!next) return;
    at = next.sourceTableId;
  }
}
export async function assertUnlinkedColumns(
  tx: Prisma.TransactionClient,
  tableId: string,
  metrics: SheetMetric[],
  dates: string[],
) {
  if (!metrics.length || !dates.length) return;
  const link = await tx.metaEffectivenessLink.findUnique({
    where: { tableId },
  });
  demand(
    !link ||
      !linkMetrics(link).some((m) => metrics.includes(m)) ||
      !dates.some((day) => linkCoversDay(link, day)),
    "Estas columnas están vinculadas. Edita la hoja de origen o desvincúlalas antes de cambiar sus valores.",
    409,
  );
}
