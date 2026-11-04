type TaskRow = {
  active: boolean;
  campaignTask?: "NONE" | "CREATE" | "STOP";
  pendingAssignmentAt?: string;
  advisorId?: string | null;
  currency: string;
};
/** Pending tasks precede normal advisor/category grouping; order within each block is retained. */
export function financialTaskSections<T extends TaskRow>(rows: T[]) {
  const assignment: T[] = [],
    stopping: T[] = [],
    normal: T[] = [];
  for (const row of rows) {
    if (row.campaignTask === "STOP") stopping.push(row);
    else if (
      row.campaignTask === "CREATE" ||
      (row.active &&
        !!row.pendingAssignmentAt &&
        (!row.advisorId || !row.currency))
    )
      assignment.push(row);
    else normal.push(row);
  }
  assignment.sort(
    (a, b) =>
      Number(b.campaignTask === "CREATE") -
        Number(a.campaignTask === "CREATE") ||
      (b.pendingAssignmentAt ?? "").localeCompare(a.pendingAssignmentAt ?? ""),
  );
  return { assignment, stopping, normal };
}
