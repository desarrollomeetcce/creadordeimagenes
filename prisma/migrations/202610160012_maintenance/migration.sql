ALTER TABLE "Variation" ADD COLUMN "filesQueuedAt" TIMESTAMP(3);
CREATE INDEX "Variation_expiry_cleanup_idx" ON "Variation" ("permanent", "filesQueuedAt", "expiresAt");
CREATE TABLE "AssetDeletion" (
  "path" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "AssetDeletion_nextAttemptAt_idx" ON "AssetDeletion" ("nextAttemptAt");
CREATE TABLE "MaintenanceRun" (
  "id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "result" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT
);
CREATE INDEX "MaintenanceRun_startedAt_idx" ON "MaintenanceRun" ("startedAt");
