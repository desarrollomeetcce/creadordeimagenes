import { randomUUID } from "node:crypto";
import { db } from "../db";
export async function startMetaSchedule(id: string) {
  const current = await db.metaAdAccount.findUnique({ where: { id }, include: { connection: { select: { verifiedAt: true, disconnectedAt: true } } } });
  if (!current?.enabled || !current.connection.verifiedAt || current.connection.disconnectedAt)
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
    where: { enabled: true, connection: { disconnectedAt: null, verifiedAt: { not: null } } },
    select: { id: true },
    take: 100,
  });
  for (const a of accounts) await startMetaSchedule(a.id);
}
