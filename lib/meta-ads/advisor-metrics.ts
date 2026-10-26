/** Attendance is recorded per person/day, independently of inventory sales. Missing/NA are gaps. */
export function advisorAttendanceValue(
  status: string | null | undefined,
  metric: "attendance" | "absences",
) {
  if (status !== "PRESENT" && status !== "ABSENT") return null;
  return metric === "absences"
    ? status === "ABSENT"
      ? 1
      : 0
    : status === "PRESENT"
      ? 1
      : 0;
}
