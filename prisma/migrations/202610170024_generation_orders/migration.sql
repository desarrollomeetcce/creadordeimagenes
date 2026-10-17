-- Orders are durable requests, separate from legacy execution batches.
-- One actor can queue several orders; the worker still claims only one image per actor.
CREATE TABLE "GenerationOrder" (
 "id" TEXT PRIMARY KEY,
 "actorId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "jobIds" JSONB NOT NULL CHECK (jsonb_typeof("jobIds") = 'array'),
 "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "runId" TEXT,
 "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "GenerationOrder_requestKey_key" ON "GenerationOrder"("requestKey");
CREATE INDEX "GenerationOrder_actorId_createdAt_idx" ON "GenerationOrder"("actorId","createdAt");
CREATE INDEX "GenerationOrder_status_createdAt_id_idx" ON "GenerationOrder"("status","createdAt","id");
CREATE INDEX "GenerationJob_order_id_idx" ON "GenerationJob"((snapshot->>'orderId')) WHERE snapshot ? 'orderId';
