import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { recordActivity, resolveActivityContexts } from "./activity";
type Actor = { id: string; role: string };
import { dateRange, visibleJobWhere } from "./hierarchy-filters";
import { usdMicros } from "./usage-format";
export function csvCell(value: string) {
  const safe = /^\s*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
const fields = {
  id: true,
  jobId: true,
  actorId: true,
  model: true,
  status: true,
  reservedMicros: true,
  actualMicros: true,
  createdAt: true,
} as const;
async function filters(user: Actor, params: URLSearchParams) {
  demand(
    user.role !== "OBSERVER",
    "Esta sección no está disponible para Observador.",
    403,
  );
  const b = z
    .object({
      days: z.enum(["7", "30", "90", "all"]),
      status: z.enum([
        "",
        "RESERVED",
        "RELEASED",
        "UNCERTAIN",
        "CONSUMED_ESTIMATE",
      ]),
      q: z.string().trim().max(100),
      cost: z.enum(["all", "known", "unknown"]),
      page: z.coerce.number().int().min(1).max(100000),
    })
    .parse({
      days: params.get("days") ?? "30",
      status: params.get("status") ?? "",
      q: params.get("q") ?? "",
      cost: params.get("cost") ?? "all",
      page: params.get("page") ?? 1,
    });
  const range = dateRange(params);
  const scoped = ["project", "product", "subproduct"].some(
    (k) => !!params.get(k),
  );
  const jobIds =
    scoped || user.role !== "OWNER"
      ? await db.generationJob.findMany({
          where: (await visibleJobWhere(user, params)).where,
          select: { id: true },
        })
      : null;
  const end = new Date(),
    local = new Date(end.getTime() - 5 * 3600000),
    start =
      b.days === "all"
        ? null
        : new Date(
            Date.UTC(
              local.getUTCFullYear(),
              local.getUTCMonth(),
              local.getUTCDate() - Number(b.days) + 1,
              5,
            ),
          );
  const where: Prisma.UsageLedgerWhereInput = {
    ...(scoped && jobIds
      ? { jobId: { in: jobIds.map((j) => j.id) } }
      : user.role === "OWNER"
        ? {}
        : {
            OR: [
              { actorId: user.id },
              { jobId: { in: (jobIds ?? []).map((j) => j.id) } },
            ],
          }),
    ...(b.status ? { status: b.status } : {}),
    ...(b.q
      ? {
          model: {
            contains: b.q.replace(/[\\%_]/g, "\\$&"),
            mode: "insensitive",
          },
        }
      : {}),
    ...(b.cost === "known"
      ? { actualMicros: { not: null } }
      : b.cost === "unknown"
        ? { actualMicros: null, status: b.status || { not: "RELEASED" } }
        : {}),
    createdAt: Object.keys(range).length
      ? { ...range, lte: end }
      : { ...(start ? { gte: start } : {}), lte: end },
  };
  if (b.cost === "unknown" && b.status === "RELEASED")
    where.AND = [{ status: { not: "RELEASED" } }];
  return { b, where, start, end };
}
async function rowsWithNames(
  user: Actor,
  rows: Prisma.UsageLedgerGetPayload<{ select: typeof fields }>[],
) {
  const actors = await db.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } },
      select: { id: true, name: true },
    }),
    names = new Map(actors.map((a) => [a.id, a.name]));
  const contexts = await resolveActivityContexts(
    db,
    rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: "TRABAJO_CANCELADO",
      resourceId: r.jobId,
      detail: {},
    })),
    user,
  );
  const confirmations = rows.length
    ? await db.$queryRaw<
        {
          id: string;
          resourceId: string;
          createdAt: Date;
          reference: string | null;
        }[]
      >(Prisma.sql`
    SELECT DISTINCT ON ("resourceId") id,"resourceId","createdAt",detail->>'reference' AS reference FROM "AuditEvent"
    WHERE action='COSTE_IA_CONCILIADO' AND "resourceId" IN (${Prisma.join(rows.map((r) => r.id))})
    ORDER BY "resourceId","createdAt" DESC,id DESC
  `)
    : [];
  const byLedger = new Map(confirmations.map((c) => [c.resourceId, c]));
  return rows.map((r) => ({
    ...r,
    actorName: names.get(r.actorId) ?? "Cuenta no disponible",
    reservedMicros: String(r.reservedMicros),
    actualMicros: r.actualMicros === null ? null : String(r.actualMicros),
    contexts: contexts.get(r.id) ?? [],
    costConfirmation: byLedger.has(r.id)
      ? {
          confirmedAt: byLedger.get(r.id)!.createdAt,
          source: "Confirmación manual del OWNER",
          ...(user.role === "OWNER"
            ? {
                id: byLedger.get(r.id)!.id,
                reference: byLedger.get(r.id)!.reference,
              }
            : {}),
        }
      : null,
  }));
}
export async function usageReport(
  user: Actor,
  params: URLSearchParams,
  summaryOnly = false,
) {
  const { b, where, start, end } = await filters(user, params);
  const [rows, total, unreleased, known, unknown, uncertain] =
    await db.$transaction(
      [
        db.usageLedger.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (b.page - 1) * 50,
          take: summaryOnly ? 0 : 50,
          select: fields,
        }),
        db.usageLedger.count({ where }),
        db.usageLedger.aggregate({
          where: { AND: [where, { status: { not: "RELEASED" } }] },
          _sum: { reservedMicros: true },
        }),
        db.usageLedger.aggregate({
          where: { AND: [where, { actualMicros: { not: null } }] },
          _sum: { actualMicros: true },
          _count: true,
        }),
        db.usageLedger.count({
          where: {
            AND: [where, { actualMicros: null, status: { not: "RELEASED" } }],
          },
        }),
        db.usageLedger.count({
          where: { AND: [where, { status: "UNCERTAIN" }] },
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
  return {
    rows: await rowsWithNames(user, rows),
    total,
    canReconcile: user.role === "OWNER",
    page: b.page,
    pages: Math.max(1, Math.ceil(total / 50)),
    start,
    end,
    summary: {
      reservedMicros: String(unreleased._sum.reservedMicros ?? 0n),
      knownActualMicros: String(known._sum.actualMicros ?? 0n),
      knownCosts: known._count,
      unknownCosts: unknown,
      uncertain,
    },
  };
}
export async function usageCsv(user: Actor, params: URLSearchParams) {
  const { where } = await filters(user, params);
  const rows = await db.usageLedger.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 2001,
    select: fields,
  });
  demand(
    rows.length <= 2000,
    "El informe supera 2000 operaciones. Reduce el período o utiliza los filtros antes de descargarlo.",
    413,
  );
  const data = await rowsWithNames(user, rows),
    labels: Record<string, string> = {
      RESERVED: "Reserva pendiente",
      RELEASED: "Reserva liberada",
      UNCERTAIN: "Cargo incierto",
      CONSUMED_ESTIMATE: "Procesado con reserva estimada",
    };
  const header = [
      "Fecha Lima",
      "Referencia de trabajo",
      "Persona",
      "Proyecto",
      "Producto",
      "Subproducto",
      "Modelo",
      "Estado",
      "Reserva local USD",
      "Coste real informado USD",
      "Origen de confirmación del coste",
      "Fecha de confirmación Lima",
    ],
    lines = [header.map(csvCell).join(",")];
  for (const row of data) {
    const c = row.contexts[0];
    lines.push(
      [
        row.createdAt.toLocaleString("es-PE", { timeZone: "America/Lima" }),
        row.jobId,
        row.actorName,
        c?.projectName ?? "Recurso no disponible",
        c?.productName ?? "",
        c?.subproductName ?? "",
        row.model,
        labels[row.status] ?? row.status,
        usdMicros(row.reservedMicros),
        usdMicros(row.actualMicros),
        row.costConfirmation?.source ??
          (row.actualMicros === null ? "No informado" : "Importe registrado"),
        row.costConfirmation
          ? row.costConfirmation.confirmedAt.toLocaleString("es-PE", {
              timeZone: "America/Lima",
            })
          : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
  demand(
    Buffer.byteLength(csv) <= 4000000,
    "El informe es demasiado grande. Reduce el período o los filtros.",
    413,
  );
  await recordActivity(db, {
    data: {
      actorId: user.id,
      action: "INFORME_CONSUMO_PREPARADO",
      detail: { count: rows.length },
    },
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="consumo-ia.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
