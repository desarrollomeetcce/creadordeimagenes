import { randomUUID } from "node:crypto";
import { db } from "../db";
import { requiresMetaReconnect } from "./graph-error";
export async function startMetaSchedule(id: string) {
  const current = await db.metaAdAccount.findUnique({
    where: { id },
    include: {
      connection: { select: { verifiedAt: true, disconnectedAt: true } },
    },
  });
  if (
    !current?.enabled ||
    !current.connection.verifiedAt ||
    current.connection.disconnectedAt ||
    requiresMetaReconnect(current.syncError)
  )
    return { scheduled: false };
  if (current?.schedulerToken && current.schedulerRunId) {
    try {
      const { getRun } = await import("workflow/api");
      const status = await getRun(current.schedulerRunId).status;
      if (["completed", "failed", "cancelled"].includes(status))
        await db.metaAdAccount.updateMany({
          where: { id, schedulerToken: current.schedulerToken },
          data: { schedulerToken: null, schedulerRunId: null },
        });
    } catch {
      return { scheduled: false };
    }
  }
  const token = randomUUID();
  const claimed = await db.metaAdAccount.updateMany({
    where: { id, enabled: true, schedulerToken: null },
    data: { schedulerToken: token },
  });
  if (!claimed.count) return { scheduled: !!current?.schedulerToken };
  try {
    const { start } = await import("workflow/api");
    const { metaSyncWorkflow } = await import("../../workflows/meta-sync");
    const run = await start(metaSyncWorkflow, [id, token]);
    await db.metaAdAccount.updateMany({
      where: { id, schedulerToken: token },
      data: { schedulerRunId: run.runId },
    });
    return { scheduled: true };
  } catch {
    await db.metaAdAccount.updateMany({
      where: { id, schedulerToken: token },
      data: {
        schedulerToken: null,
        schedulerRunId: null,
        syncError:
          "La sincronización quedó en cola; el programador no confirmó el arranque. Pulsa Sincronizar o comprueba el worker.",
      },
    });
    return { scheduled: false };
  }
}
export async function recoverMetaSchedules() {
  const accounts = await db.metaAdAccount.findMany({
    where: {
      enabled: true,
      connection: { disconnectedAt: null, verifiedAt: { not: null } },
    },
    select: { id: true },
    take: 100,
  });
  for (const a of accounts) await startMetaSchedule(a.id);
}
/** Continue long imports on a fresh durable run without discarding their saved page cursor. */
export async function continueMetaSchedule(
  id: string,
  previousToken: string,
  start: (id: string) => Promise<{ scheduled: boolean }> = startMetaSchedule,
): Promise<"done" | "wait"> {
  const current = await db.metaAdAccount.findFirst({
    where: { id, enabled: true, schedulerToken: previousToken },
    include: {
      connection: { select: { verifiedAt: true, disconnectedAt: true } },
    },
  });
  if (
    !current ||
    requiresMetaReconnect(current.syncError) ||
    !current.connection.verifiedAt ||
    current.connection.disconnectedAt
  )
    return "done";
  if (
    current.syncToken &&
    current.syncLeaseAt &&
    current.syncLeaseAt.valueOf() > Date.now() - 120000
  )
    return "wait";
  const retired = await db.metaAdAccount.updateMany({
    where: { id, enabled: true, schedulerToken: previousToken },
    data: { schedulerToken: null, schedulerRunId: null },
  });
  if (!retired.count) return "done";
  try {
    if (!(await start(id)).scheduled) throw new Error("Schedule not confirmed");
    return "done";
  } catch {
    await db.metaAdAccount.updateMany({
      where: { id, enabled: true, schedulerToken: null },
      data: { schedulerToken: previousToken },
    });
    return "wait";
  }
}
