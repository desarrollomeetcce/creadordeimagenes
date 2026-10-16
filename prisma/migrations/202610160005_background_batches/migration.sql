CREATE TABLE "BackgroundBatch" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "jobIds" JSONB NOT NULL CHECK (jsonb_typeof("jobIds") = 'array'),
  "status" TEXT NOT NULL DEFAULT 'STARTING',
  "runId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "BackgroundBatch_requestKey_key" ON "BackgroundBatch"("requestKey");
CREATE INDEX "BackgroundBatch_actorId_createdAt_idx" ON "BackgroundBatch"("actorId", "createdAt");
CREATE UNIQUE INDEX "BackgroundBatch_one_active_per_actor" ON "BackgroundBatch"("actorId")
  WHERE "status" IN ('STARTING', 'ACTIVE', 'PAUSING', 'DISPATCH_UNCERTAIN');
