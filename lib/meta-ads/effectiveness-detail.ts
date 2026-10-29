import { activePeriods } from "./active-periods";
import { db } from "../db";
import {ownerOnly} from "./financial-access";
import { demand } from "../errors";
import { effectiveness } from "./effectiveness";
import { aliasStateTimeline } from "./alias-state-timeline";
import type { Actor } from "./service";
export async function effectivenessDetail(
  actor: Actor,
  b: { aliasId: string; country: string; since: string; until: string },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      const alias = await tx.metaAlias.findUnique({
        where: { id: b.aliasId },
        include: { table: { select: { id: true, name: true } } },
      });
      demand(alias, "Inventario no disponible.", 404);
      const since = new Date(b.since + "T00:00:00-05:00"),
        until = new Date(
          Math.min(
            Date.parse(b.until + "T00:00:00-05:00") + 86400000,
            Date.now(),
          ),
        ),
        asOf = new Date().toISOString();
      const state = await tx.metaEffectivenessState.findUnique({
        where: { aliasId_country: { aliasId: b.aliasId, country: b.country } },
      });
      const [sheet, prior, events, fullEvents] = await Promise.all([
        effectiveness(actor, alias.tableId, b.since, b.until, tx),
        state
          ? tx.metaEffectivenessEvent.findFirst({
              where: { stateId: state.id, createdAt: { lt: since } },
              select: { id: true, active: true, createdAt: true },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            })
          : null,
        state
          ? tx.metaEffectivenessEvent.findMany({
              where: {
                stateId: state.id,
                createdAt: { gte: since, lt: until },
              },
              select: { id: true, active: true, createdAt: true },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 10001,
            })
          : [],
        state
          ? tx.metaEffectivenessEvent.findMany({
              where: { stateId: state.id, createdAt: { lte: new Date(asOf) } },
              select: { id: true, active: true, createdAt: true },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 10001,
            })
          : [],
      ]);
      demand(
        fullEvents.length <= 10000,
        "El historial supera el límite de 10000 cambios que se pueden consultar a la vez.",
      );
      demand(
        events.length <= 10000,
        "El período tiene demasiados cambios de estado. Elige menos días.",
      );
      const row = sheet.rows.find(
        (r) => r.aliasId === b.aliasId && r.country === b.country,
      );
      demand(row, "Fila de inventario y país no disponible.", 404);
      const serialize = (e: {
        id: string;
        active: boolean;
        createdAt: Date;
      }) => ({ ...e, createdAt: e.createdAt.toISOString() });
      return {
        aliasId: alias.id,
        name: alias.name,
        tableId: alias.tableId,
        tableName: alias.table.name,
        country: b.country,
        currency: row.currency,
        active: row.active,
        activePeriods: activePeriods(fullEvents.map(serialize), asOf),
        asOf,
        days: row.days,
        timeline: aliasStateTimeline(
          b.since,
          b.until,
          prior ? serialize(prior) : null,
          events.map(serialize),
          asOf,
        ),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
