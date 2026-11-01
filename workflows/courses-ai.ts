import { sleep } from "workflow";
async function advance(id: string) {
  "use step";
  return (await import("../lib/courses/service")).processCourseTask(id);
}
advance.maxRetries = 0;
async function interrupted(id: string) {
  "use step";
  const { db } = await import("../lib/db");
  await db.aICourseTask.updateMany({
    where: { id, status: { in: ["PENDING", "RUNNING", "RENDERING"] } },
    data: {
      status: "UNCERTAIN",
      error:
        "El trabajo se interrumpió. Revisa el proveedor antes de autorizar otra generación; no se reintentó.",
    },
  });
}
interrupted.maxRetries = 0;
export async function courseWorkflow(id: string) {
  "use workflow";
  try {
    for (let i = 0; i < 360; i++) {
      if ((await advance(id)) === "DONE") return;
      await sleep("5s");
    }
  } catch {}
  await interrupted(id);
}

export async function coursesBatchWorkflow(ids: string[]) {
  "use workflow";
  for (const id of ids) {
    let done = false;
    try {
      for (let i = 0; i < 360; i++) {
        if ((await advance(id)) === "DONE") {
          done = true;
          break;
        }
        await sleep("5s");
      }
    } catch {}
    if (!done) await interrupted(id);
  }
}
