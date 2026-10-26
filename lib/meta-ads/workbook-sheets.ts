import { z } from "zod";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import { isCountryCode } from "./countries";
import { isCurrency } from "./exchange-rates";
import type { Actor } from "./service";
export const workbookKindSchema = z.enum(["TOTALS", "ADVISORS", "INVENTORY"]);
const id = z.string().min(1).max(100),
  blankId = z.string().max(100),
  day = z.string().date();
const country = z
  .string()
  .refine((v) => v === "" || v === "__none" || isCountryCode(v));
const currency = z.string().refine((v) => v === "" || isCurrency(v));
export const workbookConfigs = {
  TOTALS: z
    .object({
      since: day.optional(),
      until: day.optional(),
      mode: z.enum(["manual", "automatic"]).optional(),
      selected: z.array(id).max(100).nullable().optional(),
      country: country.optional(),
      currency: currency.optional(),
    })
    .strict(),
  ADVISORS: z
    .object({
      since: day.optional(),
      until: day.optional(),
      tableId: id.optional(),
      aliasId: blankId.optional(),
      country: country.optional(),
      query: z.string().max(200).optional(),
    })
    .strict(),
  INVENTORY: z
    .object({
      sheet: blankId.optional(),
      item: blankId.optional(),
      query: z.string().max(200).optional(),
      target: blankId.optional(),
    })
    .strict(),
};
export function parseWorkbookConfig(
  kind: z.infer<typeof workbookKindSchema>,
  value: unknown,
) {
  const c = workbookConfigs[kind].parse(value);
  if ("since" in c && c.since && c.until)
    demand(
      c.since <= c.until &&
        (Date.parse(c.until) - Date.parse(c.since)) / 86400000 < 31,
      "Elige un período de hasta31 días.",
    );
  return c;
}
export async function workbookSheets(actor: Actor) {
  ownerOnly(actor);
  return db.metaEffectivenessSheet.findMany({
    where: { archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export async function createWorkbookSheet(
  actor: Actor,
  b: {
    kind: z.infer<typeof workbookKindSchema>;
    name?: string;
    config?: unknown;
  },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    const existing = await tx.metaEffectivenessSheet.findMany({
      where: { kind: b.kind, archivedAt: null },
      select: { name: true },
    });
    demand(existing.length < 30, "Máximo30 pestañas de cada tipo.");
    const label =
      b.kind === "TOTALS"
        ? "Totales"
        : b.kind === "ADVISORS"
          ? "Asesores"
          : "Inventario";
    let name = b.name?.trim();
    if (!name && !existing.length) name = label;
    if (!name) {
      let number = 2;
      while (
        existing.some(
          (e) =>
            e.name.toLocaleLowerCase("es") ===
            (label + " " + number).toLocaleLowerCase("es"),
        )
      )
        number++;
      name = label + " " + number;
    }
    demand(
      !existing.some(
        (e) => e.name.toLocaleLowerCase("es") === name!.toLocaleLowerCase("es"),
      ),
      "Ya existe una pestaña de este tipo con ese nombre.",
      409,
    );
    const config = parseWorkbookConfig(b.kind, b.config ?? {});
    const sheet = await tx.metaEffectivenessSheet.create({
      data: { kind: b.kind, name, config },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_PESTANA_CREADA",
        resourceId: sheet.id,
        detail: { kind: b.kind, name },
      },
    });
    return sheet;
  });
}
export async function updateWorkbookSheet(
  actor: Actor,
  id: string,
  b: { revision: number; name?: string; config?: unknown },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    const old = await tx.metaEffectivenessSheet.findUnique({ where: { id } });
    demand(old && !old.archivedAt, "Pestaña no disponible.", 404);
    demand(
      old.revision === b.revision,
      "Esta pestaña cambió en otra ventana. Recarga antes de guardar.",
      409,
    );
    const name = b.name?.trim() ?? old.name;
    demand(
      !(await tx.metaEffectivenessSheet.findFirst({
        where: {
          archivedAt: null,
          kind: old.kind,
          id: { not: id },
          name: { equals: name, mode: "insensitive" },
        },
      })),
      "Ya existe una pestaña de este tipo con ese nombre.",
      409,
    );
    const config =
      b.config === undefined
        ? undefined
        : parseWorkbookConfig(workbookKindSchema.parse(old.kind), b.config);
    const sheet = await tx.metaEffectivenessSheet.update({
      where: { id },
      data: { name, ...(config ? { config } : {}), revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_PESTANA_GUARDADA",
        resourceId: id,
        detail: { kind: old.kind, name, configChanged: config !== undefined },
      },
    });
    return sheet;
  });
}
