CREATE TABLE "MetaRecommendationRules" (
 "currency" TEXT PRIMARY KEY, "values" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "MetaRecommendationAnalysis" (
 "key" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "parameters" JSONB NOT NULL,
 "payload" JSONB NOT NULL, "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "MetaRecommendationAnalysis_expiresAt_idx" ON "MetaRecommendationAnalysis"("expiresAt");
CREATE INDEX "MetaRecommendationAnalysis_campaignId_idx" ON "MetaRecommendationAnalysis"("campaignId");
