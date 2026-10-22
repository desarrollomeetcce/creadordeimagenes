ALTER TABLE "MetaAdAccount" ADD COLUMN "selectionSince" TIMESTAMPTZ;
ALTER TABLE "MetaAdObject" ADD COLUMN "selectedAt" TIMESTAMPTZ;
CREATE INDEX "MetaAdObject_accountId_selectedAt_level_idx" ON "MetaAdObject"("accountId","selectedAt",level);
CREATE TABLE "MetaAdTotal" (
  "objectId" TEXT PRIMARY KEY REFERENCES "MetaAdObject"(id) ON DELETE CASCADE,
  "accountId" TEXT NOT NULL REFERENCES "MetaAdAccount"(id) ON DELETE CASCADE,
  since TEXT NOT NULL,
  until TEXT NOT NULL,
  scope TEXT NOT NULL,
  spend NUMERIC(18,6) NOT NULL,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  actions JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "MetaAdTotal_accountId_until_idx" ON "MetaAdTotal"("accountId",until);
