CREATE TABLE "MetaPendingSale" (
  "id" TEXT PRIMARY KEY, "aliasId" TEXT NOT NULL, "tableId" TEXT NOT NULL,
  "country" TEXT NOT NULL, "advisorId" TEXT NOT NULL, "customer" TEXT NOT NULL,
  "day" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedBy" TEXT, "approvedAt" TIMESTAMP(3)
);
CREATE INDEX "MetaPendingSale_tableId_day_approvedAt_idx" ON "MetaPendingSale"("tableId","day","approvedAt");

CREATE TABLE "MetaAdvisorPeriodNote" (
  "id" TEXT PRIMARY KEY, "advisorId" TEXT NOT NULL, "aliasId" TEXT NOT NULL, "tableId" TEXT NOT NULL,
  "country" TEXT NOT NULL, "day" TEXT NOT NULL, "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MetaAdvisorPeriodNote_advisorId_day_createdAt_idx" ON "MetaAdvisorPeriodNote"("advisorId","day","createdAt");
