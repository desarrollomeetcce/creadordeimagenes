ALTER TYPE "Role" ADD VALUE 'OBSERVER';
ALTER TABLE "Category" ADD COLUMN "applyPromptToAll" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Category" ADD COLUMN "applySettingsToAll" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SavedPreset" ADD COLUMN "applyPromptToAll" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SavedPreset" ADD COLUMN "applySettingsToAll" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "PresetShare" (
  "presetId" TEXT NOT NULL REFERENCES "SavedPreset"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  PRIMARY KEY ("presetId", "userId")
);
UPDATE "ProjectMember" SET "permission"='ROLE';
