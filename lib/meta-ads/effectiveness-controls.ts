import { randomUUID } from "node:crypto";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import type { Actor } from "./service";
import { effectiveness, effectivenessLock } from "./effectiveness";
import {
  sheetMetrics,
  summarizePeriod,
  type SheetMetric,
} from "./period-summary";
export async function fillEffectiveness(
  actor: Actor,
  b: {
    tableId: string;
    since: string;
    until: string;
    days?: string[];
    allActive?: boolean;
    metrics: SheetMetric[];
    value: number | "NA" | null;
    targets: { aliasId: string; country: string; token: string }[];
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const view = await effectiveness(actor, b.tableId, b.since, b.until, tx),
        byKey = new Map(
          view.rows.map((r) => [JSON.stringify([r.aliasId, r.country]), r]),
        );
      if (b.allActive) {
        demand(
          b.days?.length === 1 && b.metrics.length === 1 && b.value !== null,
          "El llenado de activos requiere una sola fecha y un parámetro.",
        );
        const expected = view.rows
          .filter((r) => r.active)
          .map((r) => JSON.stringify([r.aliasId, r.country]));
        const submitted = new Set(
          b.targets.map((t) => JSON.stringify([t.aliasId, t.country])),
        );
        demand(
          expected.length === b.targets.length &&
            submitted.size === expected.length &&
            expected.every((k) => submitted.has(k)),
          "Los alias activos cambiaron. Recarga antes de completar la columna.",
          409,
        );
      }
      const seen = new Set<string>(),
        dates: string[] = [];
      for (let d = Date.parse(b.since); d <= Date.parse(b.until); d += 86400000)
        dates.push(new Date(d).toISOString().slice(0, 10));
      if (b.days) {
        demand(
          new Set(b.days).size === b.days.length &&
            b.days.every((d) => dates.includes(d)),
          "Días fuera del período o repetidos.",
        );
        dates.splice(0, dates.length, ...b.days);
      }
      const targets = b.targets.map((t) => {
        const k = JSON.stringify([t.aliasId, t.country]),
          r = byKey.get(k);
        demand(!seen.has(k), "Fila repetida.");
        seen.add(k);
        demand(r, "Fila no disponible.", 404);
        demand(
          r.token === t.token,
          "Las celdas cambiaron. Recarga antes de completar valores.",
          409,
        );
        if (
          typeof b.value === "number" &&
          b.value > 0 &&
          b.metrics.some(
            (m) => m === "budget" || m === "spend" || m === "fixedCost",
          )
        )
          demand(r.currency, "Elige la moneda antes de escribir importes.");
        return r;
      });
      await tx.metaEffectivenessRow.createMany({
        data: targets.map((r) => ({
          aliasId: r.aliasId,
          country: r.country,
          currency: "",
          displayCurrency: r.currency,
        })),
        skipDuplicates: true,
      });
      const rows = await tx.metaEffectivenessRow.findMany({
          where: { legacy: false, currency: "", alias: { tableId: b.tableId } },
          select: { id: true, aliasId: true, country: true },
        }),
        ids = new Map(
          rows.map((r) => [JSON.stringify([r.aliasId, r.country]), r.id]),
        );
      const values = targets.flatMap((r) =>
        dates.map((day) => ({
          rowId: ids.get(JSON.stringify([r.aliasId, r.country]))!,
          day,
          patch: Object.fromEntries(
            b.metrics.map((m) => [
              m,
              b.value === null
                ? null
                : {
                    value: b.value,
                    ...(m === "budget" || m === "spend" || m === "fixedCost"
                      ? { currency: r.currency }
                      : {}),
                  },
            ]),
          ),
        })),
      );
      // One bounded bulk upsert, preserving imported/manual originals and unrelated metric overrides.
      await tx.$executeRaw`INSERT INTO "MetaEffectivenessDay" ("rowId",day,annotations,revision) SELECT x."rowId",x.day,x.patch,1 FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS x("rowId" text,day text,patch jsonb)
   ON CONFLICT ("rowId",day) DO UPDATE SET annotations=jsonb_strip_nulls("MetaEffectivenessDay".annotations || EXCLUDED.annotations),revision="MetaEffectivenessDay".revision+1`;
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_VALORES",
          resourceId: b.tableId,
          detail: {
            rows: targets.length,
            days: dates.length,
            metrics: b.metrics,
            value: b.value,
          },
        },
      });
      return { ok: true, cells: values.length * b.metrics.length };
    },
    { timeout: 60000 },
  );
}
function stateSnapshot(
  r: Awaited<ReturnType<typeof effectiveness>>["rows"][number],
  b: { since: string; until: string; metrics: SheetMetric[] },
) {
  const dates: string[] = [];
  for (let d = Date.parse(b.since); d <= Date.parse(b.until); d += 86400000)
    dates.push(new Date(d).toISOString().slice(0, 10));
  return {
    since: b.since,
    until: b.until,
    currency: r.currency,
    metrics: b.metrics,
    parameterCount: b.metrics.length,
    values: Object.fromEntries(
      sheetMetrics.map((m) => [
        m.key,
        {
          ...summarizePeriod(r.days, dates, m.key, r.campaigns),
          notApplicableDays: dates.filter((d) => r.days[d]?.na.includes(m.key))
            .length,
        },
      ]),
    ),
  };
}
export async function setEffectivenessState(
  actor: Actor,
  b: {
    tableId: string;
    aliasId: string;
    country: string;
    active: boolean;
    revision: number;
    since: string;
    until: string;
    metrics: SheetMetric[];
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const view = await effectiveness(actor, b.tableId, b.since, b.until, tx),
        r = view.rows.find(
          (r) => r.aliasId === b.aliasId && r.country === b.country,
        );
      demand(r, "Fila no disponible.", 404);
      demand(
        r.stateRevision === b.revision && r.active !== b.active,
        "El estado cambió. Recarga antes de continuar.",
        409,
      );
      const snapshot = stateSnapshot(r, b);
      const state = await tx.metaEffectivenessState.upsert({
        where: { aliasId_country: { aliasId: b.aliasId, country: b.country } },
        create: {
          aliasId: b.aliasId,
          country: b.country,
          active: b.active,
          revision: 1,
        },
        update: { active: b.active, revision: { increment: 1 } },
      });
      await tx.metaEffectivenessEvent.create({
        data: {
          stateId: state.id,
          active: b.active,
          actorId: actor.id,
          snapshot,
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_ESTADO",
          resourceId: state.id,
          detail: {
            country: b.country,
            active: b.active,
            since: b.since,
            until: b.until,
          },
        },
      });
      return { ok: true };
    },
    { timeout: 60000 },
  );
}
export async function effectivenessHistory(
  actor: Actor,
  aliasId: string,
  country: string,
  cursor?: string,
) {
  ownerOnly(actor);
  demand(
    await db.metaAlias.findUnique({ where: { id: aliasId } }),
    "Alias no disponible.",
    404,
  );
  const state = await db.metaEffectivenessState.findUnique({
    where: { aliasId_country: { aliasId, country } },
  });
  if (!state) return { active: true, events: [], next: null };
  if (cursor)
    demand(
      await db.metaEffectivenessEvent.findFirst({
        where: { id: cursor, stateId: state.id },
      }),
      "Página no disponible.",
      404,
    );
  const events = await db.metaEffectivenessEvent.findMany({
    where: { stateId: state.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, active: true, createdAt: true, snapshot: true },
  });
  return {
    active: state.active,
    events: events.slice(0, 50),
    next: events.length > 50 ? events[49].id : null,
  };
}

export async function setEffectivenessStates(
  actor: Actor,
  b: {
    tableId: string;
    since: string;
    until: string;
    metrics: SheetMetric[];
    active: boolean;
    targets: { aliasId: string; country: string; revision: number }[];
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const view = await effectiveness(actor, b.tableId, b.since, b.until, tx),
        key = (r: { aliasId: string; country: string }) =>
          JSON.stringify([r.aliasId, r.country]);
      const rows = new Map(view.rows.map((r) => [key(r), r])),
        seen = new Set<string>();
      const targets = b.targets.map((t) => {
        const k = key(t),
          r = rows.get(k);
        demand(!seen.has(k), "Fila repetida.");
        seen.add(k);
        demand(r, "Fila no disponible en esta tabla.", 404);
        demand(
          r.stateRevision === t.revision,
          "Un estado cambió. Recarga antes de continuar.",
          409,
        );
        return r;
      });
      const changed = targets.filter((r) => r.active !== b.active);
      if (!changed.length)
        return { ok: true, changed: 0, unchanged: targets.length };
      const values = changed.map((r) => ({
        id: randomUUID(),
        aliasId: r.aliasId,
        country: r.country,
        active: b.active,
      }));
      const states = await tx.$queryRaw<
        { id: string; aliasId: string; country: string }[]
      >`INSERT INTO "MetaEffectivenessState" (id,"aliasId",country,active,revision) SELECT x.id,x."aliasId",x.country,x.active,1 FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS x(id text,"aliasId" text,country text,active boolean) ON CONFLICT ("aliasId",country) DO UPDATE SET active=EXCLUDED.active,revision="MetaEffectivenessState".revision+1 RETURNING id,"aliasId",country`;
      const stateIds = new Map(states.map((s) => [key(s), s.id]));
      await tx.metaEffectivenessEvent.createMany({
        data: changed.map((r) => ({
          stateId: stateIds.get(key(r))!,
          active: b.active,
          actorId: actor.id,
          snapshot: stateSnapshot(r, b),
        })),
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_EFECTIVIDAD_ESTADOS_LOTE",
          resourceId: b.tableId,
          detail: {
            active: b.active,
            changed: changed.length,
            unchanged: targets.length - changed.length,
            since: b.since,
            until: b.until,
          },
        },
      });
      return {
        ok: true,
        changed: changed.length,
        unchanged: targets.length - changed.length,
      };
    },
    { timeout: 60000 },
  );
}
