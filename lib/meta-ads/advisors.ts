import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { accountWhere, type Actor } from "./service";
import { effectiveness, effectivenessLock } from "./effectiveness";

export async function advisors(actor: Actor) {
  return db.metaAdvisor.findMany({
    where:
      actor.role === "OWNER"
        ? {}
        : { objects: { some: { account: accountWhere(actor) } } },
    select: { id: true, name: true, revision: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
}
export async function saveAdvisor(
  actor: Actor,
  b: { id?: string; name: string; revision?: number },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    if (b.id) {
      const old = await tx.metaAdvisor.findUnique({ where: { id: b.id } });
      demand(old, "Asesor no disponible.", 404);
      demand(
        old.revision === b.revision,
        "El asesor cambió. Recarga antes de guardar.",
        409,
      );
    } else
      demand((await tx.metaAdvisor.count()) < 1000, "Máximo 1000 asesores.");
    demand(
      !(await tx.metaAdvisor.findFirst({
        where: {
          name: { equals: b.name, mode: "insensitive" },
          ...(b.id ? { id: { not: b.id } } : {}),
        },
      })),
      "Ya existe ese asesor.",
      409,
    );
    const row = b.id
      ? await tx.metaAdvisor.update({
          where: { id: b.id },
          data: { name: b.name, revision: { increment: 1 } },
        })
      : await tx.metaAdvisor.create({ data: { name: b.name } });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_ASESOR_GUARDADO",
        resourceId: row.id,
      },
    });
    return row;
  });
}
export async function assignRowAdvisor(
  actor: Actor,
  b: {
    aliasId: string;
    country: string;
    advisorId: string | null;
    revision: number;
  },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    const alias = await tx.metaAlias.findUnique({
      where: { id: b.aliasId },
      include: { table: true },
    });
    demand(alias, "Alias no disponible.", 404);
    if (b.advisorId)
      demand(
        await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
        "Asesor no disponible.",
        404,
      );
    const where = {
      aliasId_country_currency: {
        aliasId: b.aliasId,
        country: b.country,
        currency: "",
      },
    };
    const old = await tx.metaEffectivenessRow.findUnique({ where });
    demand(
      !old?.hidden && (old?.revision ?? 0) === b.revision,
      "La fila cambió. Recarga antes de asignar.",
      409,
    );
    const row = await tx.metaEffectivenessRow.upsert({
      where,
      create: {
        aliasId: b.aliasId,
        country: b.country,
        currency: "",
        displayCurrency: alias.table.defaultCurrency,
        advisorId: b.advisorId,
        revision: 1,
      },
      update: { advisorId: b.advisorId, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_EFECTIVIDAD_ASESOR",
        resourceId: row.id,
        detail: {
          advisorId: b.advisorId,
          previousAdvisorId: old?.advisorId ?? null,
          country: b.country,
        },
      },
    });
    return { ok: true };
  });
}
export async function saveAttendance(
  actor: Actor,
  b: {
    advisorId: string;
    day: string;
    status: "PRESENT" | "ABSENT" | "NA" | null;
    revision: number;
  },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaAdvisor.findUnique({ where: { id: b.advisorId } }),
      "Asesor no disponible.",
      404,
    );
    const where = { advisorId_day: { advisorId: b.advisorId, day: b.day } };
    const old = await tx.metaAdvisorAttendance.findUnique({ where });
    demand(
      (old?.revision ?? 0) === b.revision,
      "La asistencia cambió. Recarga antes de guardar.",
      409,
    );
    const row = await tx.metaAdvisorAttendance.upsert({
      where,
      create: { advisorId: b.advisorId, day: b.day, status: b.status },
      update: { status: b.status, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_ASESOR_ASISTENCIA",
        resourceId: b.advisorId,
        detail: { day: b.day, status: b.status },
      },
    });
    return row;
  });
}
/** Sales are the same V used in both views. Attribution follows the explicitly chosen row advisor. */
export async function advisorSheet(
  actor: Actor,
  tableId: string,
  since: string,
  until: string,
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      const [people, attendance, tables] = await Promise.all([
        tx.metaAdvisor.findMany({
          select: { id: true, name: true, revision: true },
          orderBy: { name: "asc" },
        }),
        tx.metaAdvisorAttendance.findMany({
          where: { day: { gte: since, lte: until } },
        }),
        tx.metaAliasTable.findMany({
          where: tableId === "all" ? {} : { id: tableId },
          select: { id: true },
        }),
      ]);
      demand(
        tableId === "all" || tables.length === 1,
        "Tabla no disponible.",
        404,
      );
      const attendanceByDay = new Map(
        attendance.map((a) => [JSON.stringify([a.advisorId, a.day]), a]),
      );
      const totals = new Map<
        string,
        Map<
          string,
          {
            sales: number | null;
            known: number;
            expected: number;
            na: number;
            partial: boolean;
          }
        >
      >();
      for (const table of tables) {
        const sheet = await effectiveness(actor, table.id, since, until, tx);
        for (const row of sheet.rows) {
          if (!row.advisorId) continue;
          if (!totals.has(row.advisorId)) totals.set(row.advisorId, new Map());
          const byDay = totals.get(row.advisorId)!;
          for (
            let d = Date.parse(since);
            d <= Date.parse(until);
            d += 86400000
          ) {
            const day = new Date(d).toISOString().slice(0, 10),
              c = row.days[day];
            const sum = byDay.get(day) ?? {
              sales: null,
              known: 0,
              expected: 0,
              na: 0,
              partial: false,
            };
            sum.expected++;
            if (c?.na.includes("sales")) sum.na++;
            else if (c?.sales !== null && c?.sales !== undefined) {
              sum.sales = (sum.sales ?? 0) + c.sales;
              sum.known++;
              if (c.partialMetrics?.includes("sales")) sum.partial = true;
            }
            byDay.set(day, sum);
          }
        }
      }
      return {
        tableId,
        since,
        until,
        rows: people.map((p) => ({
          ...p,
          days: Object.fromEntries(
            [
              ...Array.from(
                {
                  length:
                    Math.round(
                      (Date.parse(until) - Date.parse(since)) / 86400000,
                    ) + 1,
                },
                (_, i) =>
                  new Date(Date.parse(since) + i * 86400000)
                    .toISOString()
                    .slice(0, 10),
              ),
            ].map((day) => {
              const att = attendanceByDay.get(JSON.stringify([p.id, day])),
                sum = totals.get(p.id)?.get(day);
              return [
                day,
                {
                  status: att?.status ?? null,
                  revision: att?.revision ?? 0,
                  sales: sum?.sales ?? null,
                  partial:
                    !!sum &&
                    (sum.partial ||
                      (sum.known > 0 && sum.known + sum.na < sum.expected)),
                  na: !!sum && sum.na === sum.expected,
                },
              ];
            }),
          ),
        })),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
