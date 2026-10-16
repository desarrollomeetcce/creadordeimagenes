ALTER TABLE "Variation" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING', ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "ImageVersion" (
  "id" TEXT PRIMARY KEY,
  "variationId" TEXT NOT NULL REFERENCES "Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "number" INTEGER NOT NULL,
  "path" TEXT NOT NULL,
  "backgroundPath" TEXT,
  "document" JSONB,
  "actorId" TEXT NOT NULL,
  "sourceJobId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("variationId", "number")
);
-- Materialize the legacy original so that existing flattened images have a history too.
INSERT INTO "ImageVersion" ("id","variationId","number","path","actorId","sourceJobId")
SELECT 'legacy_' || v."id",v."id",1,v."path",j."actorId",v."jobId" FROM "Variation" v JOIN "GenerationJob" j ON j."id"=v."jobId";
CREATE TABLE "LibraryFolder" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id"),"name" TEXT NOT NULL,"parentId" TEXT REFERENCES "LibraryFolder"("id"),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "LibraryFolder_user_parent_idx" ON "LibraryFolder"("userId","parentId");
CREATE TABLE "LibraryItem" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id"),"variationId" TEXT NOT NULL REFERENCES "Variation"("id"),"folderId" TEXT REFERENCES "LibraryFolder"("id"),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("userId","variationId"));
INSERT INTO "LibraryItem" ("id","userId","variationId") SELECT 'legacy_' || v."id",j."actorId",v."id" FROM "Variation" v JOIN "GenerationJob" j ON j."id"=v."jobId" WHERE v."permanent"=true;
CREATE TABLE "SavedPreset" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id"),"name" TEXT NOT NULL,"prompt" TEXT NOT NULL,"settings" JSONB NOT NULL,"visibility" TEXT NOT NULL DEFAULT 'PERSONAL',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "BudgetLimit" ("id" TEXT PRIMARY KEY,"scope" TEXT NOT NULL,"targetId" TEXT NOT NULL,"monthlyMicros" BIGINT NOT NULL,"dailyMicros" BIGINT NOT NULL,"maxJobsPerDay" INTEGER NOT NULL,UNIQUE("scope","targetId"));
