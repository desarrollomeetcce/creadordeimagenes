import { sleep } from "workflow";
async function advance(accountId: string, scheduleToken: string) {
  "use step";
  const { db } = await import("../lib/db");
  const { syncStep } = await import("../lib/meta-ads/service");
  const a = await db.metaAdAccount.findFirst({
    where: {
      id: accountId,
      enabled: true,
      schedulerToken: scheduleToken,
      connection: { disconnectedAt: null },
    },
  });
  if (!a) return { active: false, delay: 0 };
  const delay = Math.max(
    0,
    (a.nextSyncAt?.valueOf() ?? Date.now()) - Date.now(),
  );
  if (delay > 0) return { active: true, delay };
  console.info("meta_sync_step", { accountId });
  await syncStep(accountId,scheduleToken);
  return { active: true, delay: 2000 };
}
export async function metaSyncWorkflow(
  accountId: string,
  scheduleToken: string,
) {
  "use workflow";
  for (let i = 0; i < 10000; i++) {
    const state = await advance(accountId, scheduleToken);
    if (!state.active) return;
    await sleep(Math.max(2000, Math.min(state.delay, 1800000)));
  }
}
