import type { Prisma } from "@prisma/client";
import { demand } from "../errors";
/** Caller holds 884411. Legacy implicit writes must never enter a removed tab. */
export async function activeWorkbookSheetId(
  tx: Prisma.TransactionClient,
  kind: "ADVISORS" | "INVENTORY" | "TOTALS",
  requested?: string,
) {
  if (requested) {
    const row = await tx.metaEffectivenessSheet.findFirst({
      where: { id: requested, kind, archivedAt: null },
    });
    demand(row, "Pestaña no disponible.", 404);
    return row.id;
  }
  const existing = await tx.metaEffectivenessSheet.findFirst({
    where: { kind, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (existing) return existing.id;
  return (
    await tx.metaEffectivenessSheet.create({
      data: {
        kind,
        name:
          kind === "ADVISORS"
            ? "Asesores"
            : kind === "TOTALS"
              ? "Totales"
              : "Inventario",
      },
    })
  ).id;
}
