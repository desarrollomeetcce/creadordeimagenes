ALTER TABLE "Project" ADD COLUMN "instructionPolicy" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Category" ADD COLUMN "instructionPolicy" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Category" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Subproduct" ADD COLUMN "instructionPolicy" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "SavedPreset" ADD COLUMN "level" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "SavedPreset" ADD COLUMN "policy" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX "SavedPreset_level_updatedAt_idx" ON "SavedPreset"("level","updatedAt");
CREATE INDEX "Category_projectId_deletedAt_idx" ON "Category"("projectId","deletedAt");
