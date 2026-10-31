ALTER TABLE "MetaAdvisor" ADD COLUMN "commercialRole" TEXT NOT NULL DEFAULT 'ADVISOR';
ALTER TABLE "MetaEffectivenessRow"
 ADD COLUMN "metaHistoryMode" TEXT NOT NULL DEFAULT 'ALL',
 ADD COLUMN "metaHistorySince" TEXT;
CREATE TABLE "MetaAdvisorSupport" (
 "id" TEXT PRIMARY KEY,
 "aliasId" TEXT NOT NULL REFERENCES "MetaAlias"("id") ON DELETE CASCADE,
 "country" TEXT NOT NULL,
 "advisorId" TEXT NOT NULL REFERENCES "MetaAdvisor"("id") ON DELETE RESTRICT,
 "since" TEXT NOT NULL,
 "until" TEXT NOT NULL,
 "cancelledAt" TIMESTAMP(3),
 "revision" INTEGER NOT NULL DEFAULT 0,
 "actorId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MetaAdvisorSupport_dates_check" CHECK ("since" <= "until")
);
CREATE INDEX "MetaAdvisorSupport_aliasId_country_since_until_idx" ON "MetaAdvisorSupport"("aliasId","country","since","until");
CREATE INDEX "MetaAdvisorSupport_advisorId_since_until_idx" ON "MetaAdvisorSupport"("advisorId","since","until");
