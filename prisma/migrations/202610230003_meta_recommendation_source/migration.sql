CREATE TABLE "MetaRecommendationSource" ("campaignId" TEXT PRIMARY KEY,"accountId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,"revision" INTEGER NOT NULL,"state" JSONB NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "MetaRecommendationSource_accountId_idx" ON "MetaRecommendationSource"("accountId");
