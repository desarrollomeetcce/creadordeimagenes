CREATE TABLE "AICoursePromo" (
 "id" TEXT PRIMARY KEY,"courseId" TEXT NOT NULL REFERENCES "AICourse"("id") ON DELETE CASCADE,"moduleId" TEXT REFERENCES "AICourseModule"("id") ON DELETE CASCADE,
 "actorId" TEXT NOT NULL,"requestId" TEXT NOT NULL UNIQUE,"batchId" TEXT NOT NULL,"scope" TEXT NOT NULL,"title" TEXT NOT NULL,"seconds" INTEGER NOT NULL,"cta" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',"settings" JSONB NOT NULL,"context" JSONB NOT NULL,"credentialRevisions" JSONB NOT NULL,"lesson" JSONB NOT NULL DEFAULT '{}',"revision" INTEGER NOT NULL DEFAULT 1,
 "currentTaskId" TEXT,"error" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AICoursePromo_courseId_status_idx" ON "AICoursePromo"("courseId","status");
CREATE INDEX "AICoursePromo_batchId_idx" ON "AICoursePromo"("batchId");
CREATE TABLE "AICoursePromoAsset" (
 "id" TEXT PRIMARY KEY,"promoId" TEXT NOT NULL REFERENCES "AICoursePromo"("id") ON DELETE CASCADE,"revision" INTEGER NOT NULL,"scene" INTEGER NOT NULL,"kind" TEXT NOT NULL,
 "path" TEXT NOT NULL,"mime" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("promoId","revision","scene","kind")
);
