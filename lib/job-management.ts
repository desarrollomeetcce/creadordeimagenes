import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { fullProjectFilter, subproductFilter } from "./auth";
import { demand } from "./errors";
import { recordActivity, resolveActivityContexts } from "./activity";
type Actor = { id: string; role: string };
type JobResource = {
  id: string;
  projectId: string;
  subproductId: string | null;
};
const states = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "UNCERTAIN",
  "CANCELLED",
] as const;
const jobSelect = {
  id: true,
  actorId: true,
  status: true,
  error: true,
  subproductId: true,
  projectId: true,
  createdAt: true,
  reservedMicros: true,
  variation: { select: { id: true, expired: true, deletedAt: true } },
} as const;
async function accessibleJobs(
  tx: Prisma.TransactionClient,
  user: Actor,
  jobs: JobResource[],
) {
  const projects = await tx.project.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            jobs.filter((j) => !j.subproductId).map((j) => j.projectId),
          ),
        ],
      },
      ...fullProjectFilter(user),
      deletedAt: null,
    },
    select: { id: true },
  });
  const subs = await tx.subproduct.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            jobs.flatMap((j) => (j.subproductId ? [j.subproductId] : [])),
          ),
        ],
      },
      ...subproductFilter(user),
    },
    select: { id: true },
  });
  const p = new Set(projects.map((x) => x.id)),
    s = new Set(subs.map((x) => x.id));
  return new Set(
    jobs
      .filter((j) =>
        j.projectId === "connection-test"
          ? user.role === "OWNER"
          : j.subproductId
            ? s.has(j.subproductId)
            : p.has(j.projectId),
      )
      .map((j) => j.id),
  );
}
export async function listJobs(user: Actor, params: URLSearchParams) {
  demand(
    user.role !== "OBSERVER",
    "Esta sección no está disponible para Observador.",
    403,
  );
  const b = z
    .object({
      page: z.coerce.number().int().min(1).max(100000),
      status: z.enum([...states, ""]),
      order: z.enum(["newest", "oldest"]),
    })
    .parse({
      page: params.get("page") ?? 1,
      status: params.get("status") ?? "",
      order: params.get("order") ?? "newest",
    });
  const base = user.role === "OWNER" ? {} : { actorId: user.id };
  const where = { ...base, ...(b.status ? { status: b.status } : {}) };
  const [jobs, total, groups] = await db.$transaction(
    [
      db.generationJob.findMany({
        where,
        orderBy: [
          { createdAt: b.order === "newest" ? "desc" : "asc" },
          { id: b.order === "newest" ? "desc" : "asc" },
        ],
        skip: (b.page - 1) * 25,
        take: 25,
        select: jobSelect,
      }),
      db.generationJob.count({ where }),
      db.generationJob.groupBy({ by: ["status"], where: base, _count: true }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const [edited, actors] = await Promise.all([
    db.imageVersion.findMany({
      where: { sourceJobId: { in: jobs.map((j) => j.id) } },
      select: {
        sourceJobId: true,
        variation: { select: { id: true, expired: true, deletedAt: true } },
      },
    }),
    db.user.findMany({
      where: { id: { in: [...new Set(jobs.map((j) => j.actorId))] } },
      select: { id: true, name: true },
    }),
  ]);
  const access = await accessibleJobs(db, user, jobs);
  const contexts = await resolveActivityContexts(
    db,
    jobs.map((j) => ({
      id: j.id,
      actorId: j.actorId,
      action: "TRABAJO_CANCELADO",
      resourceId: j.id,
      detail: {},
    })),
    user,
  );
  const versions = new Map(edited.map((v) => [v.sourceJobId, v.variation])),
    names = new Map(actors.map((a) => [a.id, a.name]));
  return {
    total,
    page: b.page,
    pages: Math.max(1, Math.ceil(total / 25)),
    counts: Object.fromEntries(groups.map((g) => [g.status, g._count])),
    rows: jobs.map((j) => {
      const v = j.variation ?? versions.get(j.id),
        manage =
          (user.role === "OWNER" || j.actorId === user.id) && access.has(j.id);
      return {
        ...j,
        reservedMicros: String(j.reservedMicros),
        actorName: names.get(j.actorId) ?? "Cuenta no disponible",
        contexts: contexts.get(j.id) ?? [],
        canManage: manage,
        variation:
          v && !v.expired && !v.deletedAt && access.has(j.id)
            ? { id: v.id, expired: false }
            : null,
      };
    }),
  };
}
async function releasePending(
  tx: Prisma.TransactionClient,
  user: Actor,
  ids: string[],
  action: string,
  resourceId?: string,
) {
  if (!ids.length) return { cancelled: 0, releasedMicros: "0" };
  const current = await tx.user.findUnique({
    where: { id: user.id },
    select: { role: true, status: true },
  });
  demand(
    current?.status === "APPROVED" &&
      current.role === user.role &&
      user.role !== "OBSERVER",
    "La cuenta o su rol cambió. Vuelve a iniciar sesión.",
    403,
  );
  const jobs = await tx.generationJob.findMany({
    where: {
      id: { in: ids },
      ...(user.role === "OWNER" ? {} : { actorId: user.id }),
    },
    select: {
      id: true,
      actorId: true,
      status: true,
      projectId: true,
      subproductId: true,
      reservedMicros: true,
    },
  });
  demand(
    jobs.length === ids.length,
    "Hay trabajos no disponibles para tu cuenta.",
    404,
  );
  demand(
    jobs.every((j) => j.status === "PENDING"),
    "La selección cambió: solo se cancelan trabajos pendientes. Actualiza el listado antes de intentarlo otra vez.",
    409,
  );
  const access = await accessibleJobs(tx, user, jobs);
  demand(
    jobs.every((j) => access.has(j.id)),
    "Ya no tienes acceso a alguno de los recursos seleccionados.",
    403,
  );
  const ledgers = await tx.usageLedger.count({
    where: { jobId: { in: ids }, status: "RESERVED" },
  });
  demand(
    ledgers === ids.length,
    "Una reserva requiere revisión. No se canceló la selección.",
    409,
  );
  await tx.generationJob.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  await tx.usageLedger.updateMany({
    where: { jobId: { in: ids }, status: "RESERVED" },
    data: { status: "RELEASED" },
  });
  await recordActivity(tx, {
    data: {
      actorId: user.id,
      action,
      resourceId,
      detail: { jobIds: ids, count: ids.length, cancelled: ids.length },
    },
  });
  return {
    cancelled: ids.length,
    releasedMicros: String(jobs.reduce((n, j) => n + j.reservedMicros, 0n)),
  };
}
export async function cancelSelectedJobs(user: Actor, ids: string[]) {
  const unique = [...new Set(ids)];
  demand(
    unique.length > 0 && unique.length <= 200,
    "Selecciona entre 1 y 200 pendientes.",
  );
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      return releasePending(tx, user, unique, "TRABAJOS_CANCELADOS");
    },
    { timeout: 20000 },
  );
}
export async function cancelBatchPending(user: Actor, id: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      await tx.$queryRaw`SELECT id FROM "BackgroundBatch" WHERE id=${id} FOR UPDATE`;
      const batch = await tx.backgroundBatch.findUnique({ where: { id } });
      demand(
        batch && (batch.actorId === user.id || user.role === "OWNER"),
        "Lote no encontrado.",
        404,
      );
      const ids = z.array(z.string()).max(200).parse(batch.jobIds);
      const pending = await tx.generationJob.findMany({
        where: { id: { in: ids }, status: "PENDING" },
        select: { id: true },
      });
      const result = await releasePending(
        tx,
        user,
        pending.map((j) => j.id),
        "LOTE_PENDIENTES_CANCELADOS",
        id,
      );
      const running = await tx.generationJob.count({
        where: { id: { in: ids }, status: "RUNNING" },
      });
      const status = [
        "STARTING",
        "ACTIVE",
        "PAUSING",
        "DISPATCH_UNCERTAIN",
      ].includes(batch.status)
        ? running
          ? "PAUSING"
          : "PAUSED"
        : batch.status;
      await tx.backgroundBatch.update({ where: { id }, data: { status } });
      return { ...result, running, status };
    },
    { timeout: 20000 },
  );
}
