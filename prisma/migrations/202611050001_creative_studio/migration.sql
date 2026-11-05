ALTER TABLE "Project" ADD COLUMN "studio" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Category" ADD COLUMN "studio" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Subproduct" ADD COLUMN "studio" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "CreativeMetaLaunch" (
 "id" TEXT PRIMARY KEY,"actorId" TEXT NOT NULL,"projectId" TEXT NOT NULL,"categoryId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL UNIQUE,"accountId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,"connectionRevision" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT',"revision" INTEGER NOT NULL DEFAULT 1,"config" JSONB NOT NULL,"campaigns" JSONB NOT NULL,
 "steps" JSONB NOT NULL DEFAULT '[]',"error" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "CreativeMetaLaunch_actorId_createdAt_idx" ON "CreativeMetaLaunch"("actorId","createdAt");
CREATE INDEX "CreativeMetaLaunch_categoryId_createdAt_idx" ON "CreativeMetaLaunch"("categoryId","createdAt");

CREATE TABLE "CreativeInventorySelection" ("id" TEXT PRIMARY KEY,"actorId" TEXT NOT NULL,"listId" TEXT NOT NULL,"country" TEXT NOT NULL,"itemIds" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "CreativeInventorySelection_actorId_createdAt_idx" ON "CreativeInventorySelection"("actorId","createdAt");
