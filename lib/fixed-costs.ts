import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { demand } from "./errors";
import { recordActivity } from "./activity";
type Actor = { id: string; role: string };
type Client = Prisma.TransactionClient;
const text = z.string().trim().max(160);
export const costMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((s) => s >= "2000-01" && s <= "2199-12", "Mes fuera de rango.");
export const costDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Fecha inválida.",
  );
export const costEntrySchema = z
  .object({
    entryType: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
    quantity: z.number().int().min(0).max(1000000).default(1),
    unitPrice: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/)
      .optional(),
    sheetId: z.string().min(1).max(100),
    date: costDate,
    kind: z.enum(["FIXED", "VARIABLE"]),
    concept: text.min(1),
    category: text.default(""),
    country: text.default(""),
    location: text.default(""),
    person: text.default(""),
    amount: z
      .string()
      .regex(
        /^\d{1,12}(\.\d{1,2})?$/,
        "Usa un importe positivo con hasta dos decimales.",
      ),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "Usa el código de moneda, como PEN, COP o USD."),
    paid: z.boolean(),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .transform((b, ctx) => {
    if (b.unitPrice === undefined) return { ...b, unitPrice: b.amount };
    const cents =
      BigInt(b.unitPrice.split(".")[0]) * 100n +
      BigInt((b.unitPrice.split(".")[1] ?? "").padEnd(2, "0"));
    const total = cents * BigInt(b.quantity);
    if (total > 99999999999999n) {
      ctx.addIssue({
        code: "custom",
        message: "El total excede el importe admitido.",
      });
      return z.NEVER;
    }
    return {
      ...b,
      amount:
        String(total / 100n) + "." + String(total % 100n).padStart(2, "0"),
    };
  });
export function previousCostMonth(month: string) {
  costMonth.parse(month);
  const d = new Date(month + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
export function carryCostDate(date: string, month: string) {
  costDate.parse(date);
  costMonth.parse(month);
  const last = new Date(
    Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0),
  ).getUTCDate();
  return (
    month + "-" + String(Math.min(+date.slice(8, 10), last)).padStart(2, "0")
  );
}
function sameCost(
  row: Record<string, any>,
  entry: z.output<typeof costEntrySchema>,
) {
  return Object.entries(entry).every(([key, value]) =>
    ["amount", "unitPrice"].includes(key)
      ? new Prisma.Decimal(row[key] ?? row.amount).equals(String(value))
      : row[key] === value,
  );
}
async function access(
  tx: Client,
  user: Actor,
  mode: "VIEW" | "EDIT" | "OWNER" = "VIEW",
) {
  const rows = await tx.$queryRaw<
    { id: string; role: string; status: string; archivedAt: Date | null }[]
  >`SELECT id,role,status,"archivedAt" FROM "User" WHERE id=${user.id} FOR SHARE`;
  const current = rows[0];
  demand(
    current?.status === "APPROVED" && !current.archivedAt,
    "La cuenta ya no está habilitada.",
    403,
  );
  const grant =
    current.role === "OWNER"
      ? null
      : await tx.fixedCostGrant.findUnique({ where: { userId: user.id } });
  demand(
    current.role === "OWNER" ||
      (mode !== "OWNER" &&
        grant &&
        (mode === "VIEW" ||
          (grant.permission === "EDIT" && current.role !== "OBSERVER"))),
    "No tienes acceso a Costos fijos con este permiso.",
    403,
  );
  return {
    owner: current.role === "OWNER",
    canEdit:
      current.role === "OWNER" ||
      (grant?.permission === "EDIT" && current.role !== "OBSERVER"),
  };
}
export async function fixedCostRoutes(
  req: NextRequest,
  parts: string[],
  user: Actor,
  body: () => Promise<unknown>,
) {
  const p = parts.slice(1),
    method = req.method,
    send = (v: unknown) =>
      NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
  return db.$transaction(
    async (tx) => {
      // All cost writes and revocations serialize before rechecking current permissions.
      if (method !== "GET")
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(961106)`;
      const rights = await access(
        tx,
        user,
        p[0] === "sharing" ? "OWNER" : method === "GET" ? "VIEW" : "EDIT",
      );
      if (p[0] === "sharing") {
        if (method === "GET")
          return send({
            members: await tx.fixedCostGrant.findMany({
              include: {
                user: {
                  select: { name: true, email: true, role: true, status: true },
                },
              },
            }),
          });
        if (method === "POST") {
          const b = z
            .object({
              email: z
                .email()
                .max(200)
                .transform((v) => v.toLowerCase()),
              permission: z.enum(["VIEW", "EDIT"]),
            })
            .strict()
            .parse(await body());
          const target = await tx.user.findFirst({
            where: {
              email: { equals: b.email, mode: "insensitive" },
              status: "APPROVED",
              archivedAt: null,
            },
          });
          demand(target, "No existe una cuenta aprobada con ese correo.", 404);
          demand(
            target.role !== "OWNER",
            "Los OWNER ya tienen acceso completo.",
          );
          demand(
            target.role !== "OBSERVER" || b.permission === "VIEW",
            "Un Observador solo puede consultar.",
          );
          await tx.fixedCostGrant.upsert({
            where: { userId: target.id },
            create: {
              userId: target.id,
              permission: b.permission,
              createdById: user.id,
            },
            update: { permission: b.permission, createdById: user.id },
          });
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action: "COSTOS_ACCESO_GUARDADO",
              resourceId: target.id,
              detail: { permission: b.permission },
            },
          });
          return send({ ok: true });
        }
        if (method === "DELETE" && p[1]) {
          await tx.fixedCostGrant.deleteMany({ where: { userId: p[1] } });
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action: "COSTOS_ACCESO_RETIRADO",
              resourceId: p[1],
            },
          });
          return send({ ok: true });
        }
      }
      if (method === "GET" && !p.length) {
        const q = req.nextUrl.searchParams;
        const month = q.get("month")
          ? costMonth.parse(q.get("month"))
          : undefined;
        const from = q.get("from")
          ? costDate.parse(q.get("from"))
          : month
            ? month + "-01"
            : "";
        const to = q.get("to")
          ? costDate.parse(q.get("to"))
          : month
            ? new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0))
                .toISOString()
                .slice(0, 10)
            : "";
        demand(from && to && from <= to, "Elige un período válido.");
        costMonth.parse(from.slice(0, 7));
        costMonth.parse(to.slice(0, 7));
        demand(
          (Date.parse(to) - Date.parse(from)) / 86400000 <= 365,
          "El período admite hasta366 días.",
        );
        const page = z.coerce
          .number()
          .int()
          .min(1)
          .max(100000)
          .parse(q.get("page") ?? 1);
        const entryType = z
          .enum(["EXPENSE", "INCOME"])
          .parse(q.get("entryType") ?? "EXPENSE");
        const shared: Prisma.FixedCostEntryWhereInput = {
          date: { gte: from, lte: to },
          ...(q.get("sheet") ? { sheetId: q.get("sheet")! } : {}),
          ...(q.get("country") ? { country: q.get("country")! } : {}),
          ...(q.get("category") ? { category: q.get("category")! } : {}),
          ...(q.get("kind")
            ? { kind: z.enum(["FIXED", "VARIABLE"]).parse(q.get("kind")) }
            : {}),
          ...(q.get("paid")
            ? { paid: z.enum(["yes", "no"]).parse(q.get("paid")) === "yes" }
            : {}),
        };
        const where = { ...shared, entryType };
        const [sheets, rows, total, groups, facets, categories] =
          await Promise.all([
            tx.fixedCostSheet.findMany({ orderBy: { createdAt: "asc" } }),
            tx.fixedCostEntry.findMany({
              where,
              orderBy: [
                { country: "asc" },
                { category: "asc" },
                { location: "asc" },
                { date: "desc" },
                { id: "asc" },
              ],
              take: 50,
              skip: (page - 1) * 50,
            }),
            tx.fixedCostEntry.count({ where }),
            tx.fixedCostEntry.groupBy({
              by: ["currency", "entryType", "paid", "kind"],
              where: shared,
              _sum: { amount: true },
              _count: true,
            }),
            tx.fixedCostEntry.findMany({
              where: { date: { gte: from, lte: to } },
              select: { country: true, category: true },
              distinct: ["country", "category"],
              take: 5000,
            }),
            tx.fixedCostCategory.findMany({
              orderBy: { name: "asc" },
              take: 5000,
            }),
          ]);
        return send({
          sheets,
          rows,
          total,
          page,
          groups,
          from,
          to,
          ...rights,
          countries: [
            ...new Set(facets.map((v) => v.country).filter(Boolean)),
          ].sort(),
          categories: [
            ...new Set([
              ...categories.map((v) => v.name),
              ...facets.map((v) => v.category).filter(Boolean),
            ]),
          ].sort(),
        });
      }
      if (p[0] === "categories" && method === "POST" && !p[1]) {
        const b = z
          .object({ name: text.min(1) })
          .strict()
          .parse(await body());
        const existing = await tx.fixedCostCategory.findFirst({
          where: { name: { equals: b.name, mode: "insensitive" } },
        });
        return send(
          existing ?? (await tx.fixedCostCategory.create({ data: b })),
        );
      }
      if (p[0] === "grid" && method === "POST" && !p[1]) {
        const b = z
          .object({
            rows: z
              .array(
                z
                  .object({
                    id: z.string().max(100).optional(),
                    version: z.number().int().positive().optional(),
                    requestId: z.uuid().optional(),
                    entry: costEntrySchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(100),
          })
          .strict()
          .parse(await body());
        const keys = b.rows.map((r) => r.id ?? r.requestId);
        demand(
          keys.every(Boolean) && new Set(keys).size === keys.length,
          "Las filas deben tener identificadores únicos.",
        );
        const sheetIds = [...new Set(b.rows.map((r) => r.entry.sheetId))];
        demand(
          (await tx.fixedCostSheet.count({
            where: { id: { in: sheetIds } },
          })) === sheetIds.length,
          "Una hoja ya no existe.",
          409,
        );
        for (const name of new Set(
          b.rows.map((r) => r.entry.category).filter(Boolean),
        )) {
          if (
            !(await tx.fixedCostCategory.findFirst({
              where: { name: { equals: name, mode: "insensitive" } },
            }))
          )
            await tx.fixedCostCategory.create({ data: { name } });
        }
        const result = [];
        for (const input of b.rows) {
          const entry = input.entry,
            month = costMonth.parse(entry.date.slice(0, 7));
          if (input.id) {
            demand(input.version, "Falta la versión de una fila.");
            const current = await tx.fixedCostEntry.findUnique({
              where: { id: input.id },
            });
            demand(current, "Una fila ya no existe.", 409);
            if (current.version !== input.version) {
              demand(
                sameCost(current, entry),
                "Una fila cambió en otra ventana; no se guardó ninguna de las filas.",
                409,
              );
              result.push(current);
              continue;
            }
            const row = await tx.fixedCostEntry.update({
              where: { id: input.id },
              data: {
                ...entry,
                month,
                updatedById: user.id,
                version: { increment: 1 },
              },
            });
            result.push(row);
            await recordActivity(tx, {
              data: {
                actorId: user.id,
                action: "COSTO_ACTUALIZADO",
                resourceId: row.id,
              },
            });
          } else {
            demand(input.requestId, "Falta el identificador de la nueva fila.");
            const current = await tx.fixedCostEntry.findUnique({
              where: { seriesId_month: { seriesId: input.requestId, month } },
            });
            if (current) {
              demand(
                current.createdById === user.id && sameCost(current, entry),
                "Una fila ya se guardó con otros datos.",
                409,
              );
              result.push(current);
              continue;
            }
            const row = await tx.fixedCostEntry.create({
              data: {
                ...entry,
                month,
                seriesId: input.requestId,
                createdById: user.id,
                updatedById: user.id,
              },
            });
            result.push(row);
            await recordActivity(tx, {
              data: {
                actorId: user.id,
                action:
                  entry.entryType === "INCOME"
                    ? "INGRESO_REGISTRADO"
                    : "COSTO_REGISTRADO",
                resourceId: row.id,
              },
            });
          }
        }
        return send({ rows: result });
      }
      if (p[0] === "sheets") {
        if (method === "POST" && p[1] === "initialize") {
          demand(
            rights.owner,
            "Solo un OWNER prepara las hojas iniciales.",
            403,
          );
          for (const name of [
            "Personal",
            "Propiedades",
            "Tecnología",
            "Personales",
            "Impuestos",
            "Variables",
          ])
            await tx.fixedCostSheet.upsert({
              where: { name },
              create: { name },
              update: {},
            });
          return send({ ok: true });
        }
        if (method === "POST" && !p[1]) {
          const b = z
            .object({ name: text.min(1) })
            .strict()
            .parse(await body());
          return send(await tx.fixedCostSheet.create({ data: b }));
        }
        if (method === "PATCH" && p[1]) {
          const b = z
            .object({ name: text.min(1) })
            .strict()
            .parse(await body());
          return send(
            await tx.fixedCostSheet.update({ where: { id: p[1] }, data: b }),
          );
        }
        if (method === "DELETE" && p[1]) {
          demand(
            (await tx.fixedCostEntry.count({ where: { sheetId: p[1] } })) === 0,
            "La hoja tiene gastos. Trasládalos antes de eliminarla.",
          );
          await tx.fixedCostSheet.delete({ where: { id: p[1] } });
          return send({ ok: true });
        }
      }
      if (p[0] === "carry" && method === "POST") {
        const b = z
            .object({ month: costMonth })
            .strict()
            .parse(await body()),
          source = previousCostMonth(b.month);
        const rows = await tx.fixedCostEntry.findMany({
          where: { month: source, kind: "FIXED", entryType: "EXPENSE" },
          take: 10001,
        });
        demand(
          rows.length <= 10000,
          "Hay demasiados gastos para copiar en una sola operación.",
        );
        let copied = 0;
        for (let start = 0; start < rows.length; start += 500) {
          const data = rows
            .slice(start, start + 500)
            .map(({ id, createdAt, updatedAt, version, ...row }) => ({
              ...row,
              date: carryCostDate(row.date, b.month),
              month: b.month,
              paid: false,
              createdById: user.id,
              updatedById: user.id,
            }));
          copied += (
            await tx.fixedCostEntry.createMany({ data, skipDuplicates: true })
          ).count;
        }
        await recordActivity(tx, {
          data: {
            actorId: user.id,
            action: "COSTOS_FIJOS_TRASLADADOS",
            detail: { source, month: b.month, copied },
          },
        });
        return send({ copied });
      }
      if (p[0] === "entries") {
        if (method === "POST" && !p[1]) {
          const input = z
              .object({ requestId: z.uuid(), entry: costEntrySchema })
              .strict()
              .parse(await body()),
            b = input.entry,
            month = costMonth.parse(b.date.slice(0, 7));
          demand(
            await tx.fixedCostSheet.findUnique({ where: { id: b.sheetId } }),
            "Hoja no encontrada.",
            404,
          );
          const existing = await tx.fixedCostEntry.findUnique({
            where: { seriesId_month: { seriesId: input.requestId, month } },
          });
          if (existing) {
            demand(
              existing.createdById === user.id,
              "Identificador de registro ya utilizado.",
              409,
            );
            demand(
              sameCost(existing, b),
              "La solicitud ya se utilizó con otros datos. Actualiza la vista.",
              409,
            );
            return send(existing);
          }
          const row = await tx.fixedCostEntry.create({
            data: {
              ...b,
              month,
              seriesId: input.requestId,
              createdById: user.id,
              updatedById: user.id,
            },
          });
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action: "COSTO_REGISTRADO",
              resourceId: row.id,
            },
          });
          return send(row);
        }
        if (p[1] && ["PATCH", "DELETE"].includes(method)) {
          const input = z
            .object({
              version: z.number().int().positive(),
              entry: costEntrySchema.optional(),
            })
            .strict()
            .parse(await body());
          if (method === "PATCH")
            demand(input.entry, "Falta el gasto actualizado.");
          const where = { id: p[1], version: input.version };
          const result =
            method === "DELETE"
              ? await tx.fixedCostEntry.deleteMany({ where })
              : await tx.fixedCostEntry.updateMany({
                  where,
                  data: {
                    ...input.entry!,
                    month: costMonth.parse(input.entry!.date.slice(0, 7)),
                    updatedById: user.id,
                    version: { increment: 1 },
                  },
                });
          demand(
            result.count === 1,
            "Este gasto cambió en otra ventana. Actualiza antes de editarlo.",
            409,
          );
          await recordActivity(tx, {
            data: {
              actorId: user.id,
              action:
                method === "DELETE" ? "COSTO_ELIMINADO" : "COSTO_ACTUALIZADO",
              resourceId: p[1],
            },
          });
          return send({ ok: true });
        }
      }
      demand(false, "Operación no encontrada.", 404);
    },
    {
      timeout: 30000,
      isolationLevel:
        method === "GET"
          ? Prisma.TransactionIsolationLevel.RepeatableRead
          : Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}
