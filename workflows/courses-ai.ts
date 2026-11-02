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

async function buildNext(id: string) {
  "use step";
  return (await import("../lib/courses/builds")).nextBuildStep(id);
}
buildNext.maxRetries = 0;
async function buildFinished(id: string, taskId: string) {
  "use step";
  return (await import("../lib/courses/builds")).finishBuildTask(id, taskId);
}
buildFinished.maxRetries = 0;
async function buildInterrupted(id: string) {
  "use step";
  await (await import("../lib/courses/builds")).interruptBuild(id);
}
buildInterrupted.maxRetries = 0;
export async function courseBuildWorkflow(id: string) {
  "use workflow";
  try {
    for (let step = 0; step < 10000; step++) {
      const next = await buildNext(id);
      if (next.state === "DONE") return;
      if (next.state === "NEXT") continue;
      if (next.taskId) {
        let done = false;
        for (let i = 0; i < 360; i++) {
          if ((await advance(next.taskId)) === "DONE") {
            done = true;
            break;
          }
          await sleep("5s");
        }
        if (!done) await interrupted(next.taskId);
        if ((await buildFinished(id, next.taskId)) === false) await sleep("5s");
      }
    }
  } catch {}
  await buildInterrupted(id);
}

async function nextPromo(id: string) {
  "use step";
  return (await import("../lib/courses/promos")).nextPromoTask(id);
}
nextPromo.maxRetries = 0;
async function stopInterruptedPromos(ids: string[]) {
  "use step";
  await (await import("../lib/courses/promos")).interruptPromos(ids);
}
stopInterruptedPromos.maxRetries = 0;
export async function coursePromosWorkflow(ids: string[]) {
  "use workflow";
  try {
    for (const id of ids) {
      let complete = false;
      for (let i = 0; i < 1000; i++) {
        const n = await nextPromo(id);
        if (n.state === "DONE") {
          complete = true;
          break;
        }
        if (n.state === "FAIL") throw Error("Clip incompleto");
        if (n.taskId) await advance(n.taskId);
        await sleep("5s");
      }
      if (!complete) throw Error("Clip sin confirmar");
    }
  } catch {
    await stopInterruptedPromos(ids);
  }
}
