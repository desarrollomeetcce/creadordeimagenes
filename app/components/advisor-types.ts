import type { AdvisorBaseEstimate } from "../../lib/meta-ads/advisor-base-estimate";
import type { InventoryBaseContext } from "../../lib/meta-ads/inventory-base-context";
import type { absenceSummary } from "../../lib/meta-ads/advisor-absence";
export type AbsenceView = ReturnType<typeof absenceSummary>;
export type Attendance = "PRESENT" | "ABSENT" | "NA" | null;
export type AdvisorDayData = {
  manualBase?: number | null;
  advisorBase?: number | null;
  base?: number | null;
  basePartial?: boolean;
  baseTimeUnavailable?: boolean;
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
  manualBaseBreakdown?: {
    tableId: string;
    tableName: string;
    country: string;
    day: string;
    advisorId: string;
    quantity: number;
  }[];
  advisorBaseBreakdown?: {
    tableId: string;
    tableName: string;
    country: string;
    day: string;
    advisorId: string;
    quantity: number;
  }[];
  baseContext?: InventoryBaseContext;
  assignedBaseEstimate?: AdvisorBaseEstimate;
  assignmentHistory?: {
    id: string;
    alias: string;
    country: string;
    tableName: string;
    effectiveAt: string;
    advisorId: string | null;
    previousAdvisorId: string | null;
    mode: string;
    cutoffSales: number | null;
  }[];
};
