CREATE TABLE "MetaFinancialHistoryImport" (
 "id" TEXT PRIMARY KEY, "digest" TEXT NOT NULL UNIQUE, "actorId" TEXT NOT NULL, "source" JSONB NOT NULL, "payload" JSONB NOT NULL, "before" JSONB NOT NULL, "summary" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MetaHistoricalAdvisorSale" (
 "advisorId" TEXT NOT NULL REFERENCES "MetaAdvisor"("id") ON DELETE RESTRICT,
 "country" TEXT NOT NULL, "day" TEXT NOT NULL, "sales" INTEGER NOT NULL CHECK ("sales">=0), "importId" TEXT NOT NULL REFERENCES "MetaFinancialHistoryImport"("id") ON DELETE RESTRICT,
 PRIMARY KEY ("advisorId","country","day")
);
CREATE INDEX "MetaHistoricalAdvisorSale_day_country_idx" ON "MetaHistoricalAdvisorSale"("day","country");
