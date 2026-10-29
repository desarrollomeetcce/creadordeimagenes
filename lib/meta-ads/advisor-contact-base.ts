import { z } from "zod";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import {
  ownerOnly,
  financialContext,
  financialAccess,
  scopePermission,
} from "./financial-access";
import { effectivenessLock } from "./effectiveness";
import {
  manualBaseAllocationsSchema,
  replaceManualBaseAdvisor,
} from "./manual-base-policy";
import { isCountryCode } from "./countries";
import type { Actor } from "./service";
const id = z.string().min(1).max(100),
  country = z.string().refine(isCountryCode, "Elige un país válido.");
export const contactBaseScope = z
  .object({ advisorListId: id, advisorId: id, day: z.string().date() })
  .strict();
export const contactBaseBucketScope = contactBaseScope
  .extend({ tableId: id, country })
  .strict();
export const contactBaseChanges = contactBaseScope
  .extend({
    changes: z
      .array(
        z
          .object({
            tableId: id,
            country,
            token: z.string().length(64),
            quantity: z.number().int().min(0).max(100000000).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();
type Scope = z.infer<typeof contactBaseScope>;
type BaseRow = Awaited<ReturnType<typeof db.metaAdvisorBaseDay.findUnique>>;
function snapshot(
  scope: Scope,
  table: { id: string; name: string },
  country: string,
  row: BaseRow,
) {
  const own =
    row && row.state === "VALUE"
      ? manualBaseAllocationsSchema
          .parse(row.allocations)
          .find((e) => e.advisorId === scope.advisorId)
      : null;
  return {
    tableId: table.id,
    tableName: table.name,
    country,
    day: scope.day,
    quantity: own?.quantity ?? null,
    state: row?.state ?? "EMPTY",
    token: createHash("sha256")
      .update(
        JSON.stringify([
          "ADVISOR_BC_V1",
          scope.advisorId,
          table.id,
          country,
          scope.day,
          row,
        ]),
      )
      .digest("hex"),
  };
}
async function context(
  tx: Prisma.TransactionClient,
  actor: Actor,
  scope: Scope,
  write = false,
) {
  ownerOnly(actor);
  await effectivenessLock(tx, actor);
  const person = await tx.metaAdvisor.findFirst({
    where: {
      id: scope.advisorId,
      sheetId: scope.advisorListId,
      sheet: { kind: "ADVISORS", archivedAt: null },
    },
    select: { id: true, name: true, sheet: { select: { config: true } } },
  });
  demand(person, "Asesor no disponible en esta pestaña.", 404);
  const cap = financialContext(actor),
    access = await financialAccess(actor, tx);
  const currentPermission = access.isOwner
    ? "EDIT"
    : scopePermission(access, cap?.scope ?? "ALL");
  demand(
    currentPermission && (!write || currentPermission === "EDIT"),
    "No tienes permiso para editar la BC de esta pestaña.",
    403,
  );
  demand(
    access.isOwner ||
      scopePermission(access, "ALL") ||
      cap?.scope === "TAB:" + scope.advisorListId,
    "Comparte esta pestaña de Asesores para consultar su BC.",
    403,
  );
  // Only a scoped advisor document is limited by its configured source sheets.
  const restricted = !access.isOwner && !scopePermission(access, "ALL"),
    config = person.sheet.config as { selected?: string[]; tableId?: string };
  const allowed = restricted
    ? Array.isArray(config.selected)
      ? config.selected
      : config.tableId && config.tableId !== "all"
        ? [config.tableId]
        : null
    : null;
  const tables = await tx.metaAliasTable.findMany({
    where: allowed ? { id: { in: allowed } } : {},
    select: { id: true, name: true, defaultCountry: true },
    orderBy: { name: "asc" },
  });
  return { person: { id: person.id, name: person.name }, tables };
}
export async function advisorContactBase(actor: Actor, input: unknown) {
  const scope = contactBaseScope.parse(input);
  return db.$transaction(
    async (tx) => {
      const ctx = await context(tx, actor, scope),
        rows = await tx.metaAdvisorBaseDay.findMany({
          where: {
            day: scope.day,
            tableId: { in: ctx.tables.map((t) => t.id) },
          },
        });
      return {
        ...ctx,
        day: scope.day,
        buckets: rows
          .filter(
            (row) =>
              row.state === "VALUE" &&
              manualBaseAllocationsSchema
                .parse(row.allocations)
                .some((e) => e.advisorId === scope.advisorId),
          )
          .map((row) =>
            snapshot(
              scope,
              ctx.tables.find((t) => t.id === row.tableId)!,
              row.country,
              row,
            ),
          ),
      };
    },
    { timeout: 60000 },
  );
}
export async function advisorContactBaseBucket(actor: Actor, input: unknown) {
  const b = contactBaseBucketScope.parse(input);
  return db.$transaction(
    async (tx) => {
      const ctx = await context(tx, actor, b),
        table = ctx.tables.find((t) => t.id === b.tableId);
      demand(table, "Hoja no disponible para esta pestaña.", 403);
      const row = await tx.metaAdvisorBaseDay.findUnique({
        where: {
          tableId_country_day: {
            tableId: b.tableId,
            country: b.country,
            day: b.day,
          },
        },
      });
      return snapshot(b, table, b.country, row);
    },
    { timeout: 60000 },
  );
}
export async function saveAdvisorContactBase(actor: Actor, input: unknown) {
  const b = contactBaseChanges.parse(input);
  demand(
    new Set(b.changes.map((c) => JSON.stringify([c.tableId, c.country])))
      .size === b.changes.length,
    "Cada hoja y país solo puede aparecer una vez.",
  );
  return db.$transaction(
    async (tx) => {
      const ctx = await context(tx, actor, b, true),
        before = [];
      for (const change of b.changes) {
        const table = ctx.tables.find((t) => t.id === change.tableId);
        demand(table, "Una hoja no está disponible para esta pestaña.", 403);
        const old = await tx.metaAdvisorBaseDay.findUnique({
          where: {
            tableId_country_day: {
              tableId: change.tableId,
              country: change.country,
              day: b.day,
            },
          },
        });
        demand(
          snapshot(b, table, change.country, old).token === change.token,
          "BC cambió en otra ventana. Actualiza el reparto antes de guardar.",
          409,
        );
        before.push(old);
      }
      let changed = 0;
      for (let i = 0; i < b.changes.length; i++) {
        const change = b.changes[i],
          old = before[i],
          allocations = old
            ? manualBaseAllocationsSchema.parse(old.allocations)
            : [],
          own = allocations.find((a) => a.advisorId === b.advisorId);
        if ((own?.quantity ?? null) === change.quantity) continue;
        const next = replaceManualBaseAdvisor(
            allocations,
            b.advisorId,
            change.quantity,
          ),
          state = next.length ? "VALUE" : old?.state === "NA" ? "NA" : "EMPTY";
        await tx.metaAdvisorBaseDay.upsert({
          where: {
            tableId_country_day: {
              tableId: change.tableId,
              country: change.country,
              day: b.day,
            },
          },
          create: {
            tableId: change.tableId,
            country: change.country,
            day: b.day,
            state,
            allocations: next,
          },
          update: { state, allocations: next, revision: { increment: 1 } },
        });
        changed++;
      }
      if (changed)
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "ASESOR_BC_POR_HOJA_GUARDADA",
            resourceId: b.advisorId,
            detail: { day: b.day, buckets: changed },
          },
        });
      return { ok: true, changed };
    },
    { timeout: 60000 },
  );
}
export type AdvisorContactBaseReview = Awaited<
  ReturnType<typeof advisorContactBase>
>;
export type AdvisorContactBucket = Awaited<
  ReturnType<typeof advisorContactBaseBucket>
>;
