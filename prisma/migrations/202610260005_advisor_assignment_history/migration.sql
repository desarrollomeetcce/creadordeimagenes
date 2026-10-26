CREATE TABLE "MetaAdvisorAssignment" (
 id text PRIMARY KEY,
 "aliasId" text NOT NULL REFERENCES "MetaAlias"(id) ON DELETE CASCADE,
 country text NOT NULL,
 "advisorId" text REFERENCES "MetaAdvisor"(id) ON DELETE RESTRICT,
 "previousAdvisorId" text REFERENCES "MetaAdvisor"(id) ON DELETE RESTRICT,
 "effectiveAt" timestamp(3) NOT NULL,
 "cutoffSales" integer CHECK ("cutoffSales" >= 0),
 mode text NOT NULL CHECK (mode IN ('DAY','CLOCK')),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((mode='DAY' AND "cutoffSales" IS NULL) OR (mode='CLOCK' AND "cutoffSales" IS NOT NULL))
);
CREATE UNIQUE INDEX "MetaAdvisorAssignment_aliasId_country_effectiveAt_key" ON "MetaAdvisorAssignment"("aliasId",country,"effectiveAt");
CREATE INDEX "MetaAdvisorAssignment_advisorId_effectiveAt_idx" ON "MetaAdvisorAssignment"("advisorId","effectiveAt");
