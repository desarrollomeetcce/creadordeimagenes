ALTER TABLE "GenerationJob" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "heartbeatAt" TIMESTAMP(3);
CREATE INDEX "GenerationJob_heartbeat_idx" ON "GenerationJob" ("status", "heartbeatAt");
