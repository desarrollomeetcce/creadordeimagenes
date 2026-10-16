ALTER TABLE "GenerationJob" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "GenerationJob_archive_idx" ON "GenerationJob"("archivedAt", "createdAt");
