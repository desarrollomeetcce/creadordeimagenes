import { sleep, getWorkflowMetadata, FatalError } from "workflow";
async function step(id: string, runId: string) {
  "use step";
  try {
    const { orderTick } = await import("../lib/generation-orders");
    return await orderTick(id, runId);
  } catch {
    throw new FatalError(
      "La orden se interrumpió. Revisa su estado antes de continuar.",
    );
  }
}
step.maxRetries = 0;
async function interrupted(id: string, runId: string) {
  "use step";
  const { db } = await import("../lib/db");
  await db.generationOrder.updateMany({
    where: { id, runId, status: "ACTIVE" },
    data: {
      status: "NEEDS_REVIEW",
      error:
        "La ejecución se interrumpió o agotó su espera. Revisa la orden; no se repitió ninguna solicitud de IA.",
    },
  });
}
interrupted.maxRetries = 0;
export async function generateOrder(id: string) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  // The run claims its identity before any provider attempt. Pauses are checked again inside the job claim.
  try {
    for (let i = 0; i < 2000; i++) {
      const result = await step(id, workflowRunId);
      if (result === "STOP" || result === "REVIEW") return;
      if (result === "WAIT") await sleep("15s");
    }
  } catch {}
  await interrupted(id, workflowRunId);
}
