import type { absenceSummary } from "../../lib/meta-ads/advisor-absence";
export type AbsenceView = ReturnType<typeof absenceSummary>;
export type Attendance = "PRESENT" | "ABSENT" | "NA" | null;
export type AdvisorDayData = {
  status: Attendance;
  revision: number;
  sales: number | null;
  partial: boolean;
  na: boolean;
  absence: AbsenceView;
};
export type AdvisorPerson = {
  id: string;
  name: string;
  revision: number;
  days: Record<string, AdvisorDayData>;
};
export type AdvisorTable = {
  id: string;
  name: string;
  aliases?: { id: string; name: string }[];
};
export type AdvisorSource = {
  tableId: string;
  tableName: string;
  aliasId: string;
  alias: string;
  country: string;
  advisorId: string;
  days: Record<string, { sales: number | null; na: boolean; partial: boolean }>;
};
export type AdvisorSheetData = {
  tableId: string;
  since: string;
  until: string;
  aliasId: string;
  country: string;
  rows: AdvisorPerson[];
  breakdown: AdvisorSource[];
};
