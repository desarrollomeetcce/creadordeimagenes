export type ConsumptionRow = {
  id: string;
  label: string;
  operations: number;
  reservedMicros: string;
  knownActualMicros: string;
  knownCosts: number;
  unknownCosts: number;
  uncertain: number;
  images: number;
  approved: number;
  pricedImages: number;
  pricedImageMicros: string;
  pricedApproved: number;
  pricedApprovedMicros: string;
};
export type StatisticsReport = {
  generatedAt: string;
  period: { days: number; start: string; end: string; timeZone: string };
  inventory: {
    projects: number;
    trash: number;
    categories: number;
    subproducts: number;
    accounts: number;
    pendingAccounts: number;
  };
  jobs: { status: string; count: number }[];
  total: ConsumptionRow;
  groups: Record<string, { totalGroups: number; rows: ConsumptionRow[] }>;
};
