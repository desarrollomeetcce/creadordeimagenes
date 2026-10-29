import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import {ownerOnly} from "./financial-access";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import {
  manualBaseAllocationsSchema,
  manualBaseValue,
  replaceManualBaseAdvisor,
  type ManualBaseAllocation,
} from "./manual-base-policy";
import type { Actor } from "./service";
export type ManualBaseKind = "BM" | "BA";
export type ManualBaseScope = {
  tableId: string;
  country: string;
  day: string;
  sheetId?: string;
  currency?: string;
};
export type ManualBaseReview = Awaited<ReturnType<typeof readReview>>;
async function readReview(
  tx: Prisma.TransactionClient,
  scope: ManualBaseScope,
  includeAdvisors = true,
  kind: ManualBaseKind = "BM",
) {
  const { tableId, country, day } = scope;
  const table = await tx.metaAliasTable.findUnique({
    where: { id: tableId },
    select: { id: true, name: true },
  });
  demand(table, "Hoja no disponible.", 404);
  if (scope.sheetId)
    demand(
      await tx.metaEffectivenessSheet.findFirst({
        where: { id: scope.sheetId, kind: "TOTALS", archivedAt: null },
      }),
      "Pestaña de Totales no disponible.",
      404,
    );
  const [stored, previous, people] = await Promise.all([
    kind === "BA"
      ? tx.metaAdvisorBaseDay.findUnique({
          where: { tableId_country_day: { tableId, country, day } },
        })
      : tx.metaManualBaseDay.findUnique({
          where: { tableId_country_day: { tableId, country, day } },
        }),
    kind === "BA"
      ? Promise.resolve([])
      : tx.metaEffectivenessTotalDay.findMany({
          where: { tableId, country, day },
          include: { sheet: { select: { name: true } } },
          orderBy: [{ sheetId: "asc" }, { currency: "asc" }],
        }),
    includeAdvisors
      ? tx.metaAdvisor.findMany({
          select: {
            id: true,
            name: true,
            sheet: { select: { name: true, archivedAt: true } },
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const legacy = previous.flatMap((r) => {
    const value = (r.values as Record<string, unknown>).baseManual;
    return typeof value === "number" || value === "NA"
      ? [
          {
            sheetId: r.sheetId,
            sheetName: r.sheet.name,
            currency: r.currency,
            revision: r.revision,
            value,
          },
        ]
      : [];
  });
  const preferred =
    legacy.find(
      (r) =>
        r.sheetId === scope.sheetId && r.currency === (scope.currency ?? ""),
    ) ?? legacy[0];
  const allocations = stored
    ? manualBaseAllocationsSchema.parse(stored.allocations)
    : typeof preferred?.value === "number"
      ? [{ advisorId: null, quantity: preferred.value }]
      : [];
  const state =
    stored?.state ??
    (preferred?.value === "NA" ? "NA" : allocations.length ? "VALUE" : "EMPTY");
  const token = createHash("sha256")
    .update(
      JSON.stringify(
        kind === "BA"
          ? [kind, tableId, country, day, stored, legacy]
          : [tableId, country, day, stored, legacy],
      ),
    )
    .digest("hex");
  return {
    ...scope,
    tableName: table.name,
    exists: !!stored,
    revision: stored?.revision ?? 0,
    token,
    state,
    allocations,
    total: manualBaseValue(state, allocations),
    legacy,
    advisors: people.map((p) => ({
      id: p.id,
      name: p.name,
      label:
        p.name +
        " · " +
        p.sheet.name +
        (p.sheet.archivedAt ? " (pestaña eliminada)" : ""),
    })),
  };
}
export async function manualBaseReview(
  actor: Actor,
  scope: ManualBaseScope,
  kind: ManualBaseKind = "BM",
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      return readReview(tx, scope, true, kind);
    },
    { timeout: 60000 },
  );
}
async function persist(
  tx: Prisma.TransactionClient,
  actor: Actor,
  scope: ManualBaseScope,
  state: string,
  entries: ManualBaseAllocation[],
  token: string,
  includeAdvisors = true,
  kind: ManualBaseKind = "BM",
) {
  const old = await readReview(tx, scope, false, kind);
  demand(
    old.token === token,
    `La base ${kind} cambió. Actualiza el reparto antes de guardar.`,
    409,
  );
  const allocations = manualBaseAllocationsSchema.parse(entries);
  demand(
    state !== "VALUE" || allocations.length > 0,
    "Añade un asesor o usa Sin dato.",
  );
  demand(
    state === "VALUE" || !allocations.length,
    "N.A. y Sin dato no admiten cantidades.",
  );
  const ids = allocations.flatMap((r) => (r.advisorId ? [r.advisorId] : []));
  demand(
    (await tx.metaAdvisor.count({ where: { id: { in: ids } } })) === ids.length,
    "Uno de los asesores ya no está disponible.",
    404,
  );
  const data = {
    where: {
      tableId_country_day: {
        tableId: scope.tableId,
        country: scope.country,
        day: scope.day,
      },
    },
    create: {
      tableId: scope.tableId,
      country: scope.country,
      day: scope.day,
      state,
      allocations: allocations as Prisma.InputJsonValue,
    },
    update: {
      state,
      allocations: allocations as Prisma.InputJsonValue,
      revision: { increment: 1 },
    },
  };
  if (kind === "BA") await tx.metaAdvisorBaseDay.upsert(data);
  else await tx.metaManualBaseDay.upsert(data);
  await recordActivity(tx, {
    data: {
      actorId: actor.id,
      action:
        kind === "BA"
          ? "META_BASE_APROXIMADA_REPARTIDA"
          : "META_BASE_MANUAL_REPARTIDA",
      resourceId: scope.tableId,
      detail: {
        day: scope.day,
        country: scope.country,
        previous: { state: old.state, allocations: old.allocations },
        state,
        allocations,
      },
    },
  });
  return readReview(tx, scope, includeAdvisors, kind);
}
export async function saveManualBase(
  actor: Actor,
  b: ManualBaseScope & {
    token: string;
    state: "VALUE" | "EMPTY" | "NA";
    allocations: ManualBaseAllocation[];
  },
  kind: ManualBaseKind = "BM",
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      return persist(tx, actor, b, b.state, b.allocations, b.token, true, kind);
    },
    { timeout: 60000 },
  );
}
export async function advisorManualBaseReview(
  actor: Actor,
  b: { advisorId: string; day: string; tableId: string; country?: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const advisor = await tx.metaAdvisor.findUnique({
        where: { id: b.advisorId },
        select: { id: true, name: true },
      });
      demand(advisor, "Asesor no disponible.", 404);
      if (b.tableId !== "all")
        demand(
          await tx.metaAliasTable.findUnique({
            where: { id: b.tableId },
            select: { id: true },
          }),
          "Hoja no disponible.",
          404,
        );
      const rows = await tx.metaManualBaseDay.findMany({
        where: {
          day: b.day,
          ...(b.tableId === "all" ? {} : { tableId: b.tableId }),
          ...(b.country ? { country: b.country } : {}),
        },
        orderBy: [{ tableId: "asc" }, { country: "asc" }],
      });
      const selected = rows.filter((r) =>
        manualBaseAllocationsSchema
          .parse(r.allocations)
          .some((e) => e.advisorId === b.advisorId),
      );
      demand(
        selected.length <= 100,
        "Elige una hoja o un país para editar hasta 100 repartos por vez.",
      );
      const buckets = [];
      for (const row of selected)
        buckets.push(await readReview(tx, row, false));
      return { advisor, buckets };
    },
    { timeout: 60000 },
  );
}
export async function saveAdvisorManualBase(
  actor: Actor,
  b: {
    advisorId: string;
    day: string;
    changes: {
      tableId: string;
      country: string;
      token: string;
      quantity: number | null;
      initialUnassigned?: number;
    }[];
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      demand(
        await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
        "Asesor no disponible.",
        404,
      );
      demand(
        new Set(b.changes.map((r) => JSON.stringify([r.tableId, r.country])))
          .size === b.changes.length,
        "Cada hoja y país solo debe aparecer una vez.",
      );
      // Validate every snapshot before the first mutation; one conflict leaves all countries intact.
      const reviews = [];
      for (const change of b.changes) {
        const review = await readReview(tx, { ...change, day: b.day }, false);
        demand(
          review.token === change.token,
          "La base manual cambió. Actualiza el reparto antes de guardar.",
          409,
        );
        reviews.push(review);
      }
      const saved = [];
      for (let i = 0; i < b.changes.length; i++) {
        const change = b.changes[i],
          old = reviews[i];
        const initial = old.exists
          ? old.allocations
          : change.initialUnassigned !== undefined
            ? [{ advisorId: null, quantity: change.initialUnassigned }]
            : [];
        demand(
          old.exists ||
            !old.legacy.length ||
            change.initialUnassigned !== undefined,
          "Revisa el importe anterior sin asesor antes de guardar.",
          409,
        );
        const allocations = replaceManualBaseAdvisor(
          initial,
          b.advisorId,
          change.quantity,
        );
        saved.push(
          await persist(
            tx,
            actor,
            { ...change, day: b.day },
            allocations.length ? "VALUE" : "EMPTY",
            allocations,
            change.token,
            false,
          ),
        );
      }
      return { buckets: saved };
    },
    { timeout: 60000 },
  );
}
