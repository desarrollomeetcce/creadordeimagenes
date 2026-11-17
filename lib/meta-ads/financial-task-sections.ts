export type TaskRow = {
  active?: boolean;
  campaignTask?: "NONE" | "CREATE" | "STOP" | "FLOW" | "SYNC";
  pendingAssignmentAt?: string;
  advisorId?: string | null;
  currency?: string;
};
export function financialTaskPriority(row: TaskRow) {
  if (row.campaignTask === "SYNC") return 0;
  if (row.campaignTask === "FLOW") return 1;
  if (row.campaignTask === "CREATE") return 2;
  if (row.campaignTask === "STOP") return 3;
  return row.active !== false ? 4 : 5;
}
/** Pending tasks are distinct from activation; explicit row ordering may bypass these bands. */
export function financialTaskSections<T extends TaskRow>(rows: T[]) {
  const sync: T[] = [],
    flow: T[] = [],
    assignment: T[] = [],
    stopping: T[] = [],
    normal: T[] = [];
  for (const row of rows) {
    const priority = financialTaskPriority(row);
    (priority === 0
      ? sync
      : priority === 1
        ? flow
        : priority === 2
          ? assignment
          : priority === 3
            ? stopping
            : normal
    ).push(row);
  }
  return { sync, flow, assignment, stopping, normal };
}
export const financialTaskLabels = [
  "Por sincronizar",
  "Por hacer flujo",
  "Por hacer campaña",
  "Por desactivar",
];
