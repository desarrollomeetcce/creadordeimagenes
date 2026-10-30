CREATE TABLE "MetaInventoryTrialGroup" (
 "id" TEXT PRIMARY KEY,
 "sheetId" TEXT NOT NULL REFERENCES "MetaEffectivenessSheet"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL,
 "payload" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1,
 "archivedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MetaInventoryTrialGroup_sheetId_archivedAt_createdAt_idx" ON "MetaInventoryTrialGroup"("sheetId","archivedAt","createdAt");
