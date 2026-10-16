import { sleep, getWorkflowMetadata, FatalError } from "workflow";

async function advanceBatch(batchId: string, runId: string) {
  "use step";
  try {
    const { backgroundTick } = await import("../lib/background");
    return await backgroundTick(batchId, runId);
  } catch {
    throw new FatalError(
      "No se pudo consultar o actualizar el lote. Revisa su estado antes de continuar.",
    );
  }
}
// Provider operations must never be retried automatically by the workflow engine.
advanceBatch.maxRetries = 0;

async function stopBatch(batchId: string, runId: string) {
  "use step";
  try {
    const { db } = await import("../lib/db");
    await db.backgroundBatch.updateMany({
      where: { id: batchId, runId, status: { in: ["ACTIVE", "PAUSING"] } },
      data: {
        status: "NEEDS_REVIEW",
        error:
          "La ejecución se interrumpió o alcanzó su límite de espera. Revisa los trabajos antes de continuar.",
      },
    });
  } catch {
    throw new FatalError(
      "No se pudo registrar la interrupción. Comprueba el ejecutor y los trabajos del lote.",
    );
  }
}
stopBatch.maxRetries = 0;

export async function generateBatchInBackground(batchId: string) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  try {
    for (let count = 0; count < 2000; count++) {
      const result = await advanceBatch(batchId, workflowRunId);
      if (result === "STOP") return;
      if (result === "WAIT") await sleep("15s");
    }
  } catch {
    // Do not serialize an infrastructure exception that might contain sensitive data.
  }
  await stopBatch(batchId, workflowRunId);
}
