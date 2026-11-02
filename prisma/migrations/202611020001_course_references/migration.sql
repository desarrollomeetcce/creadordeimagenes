CREATE TABLE "AICourseReference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "AICourse"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "digest" TEXT NOT NULL,
  "characters" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AICourseReference_courseId_digest_key" ON "AICourseReference"("courseId","digest");
CREATE INDEX "AICourseReference_courseId_createdAt_idx" ON "AICourseReference"("courseId","createdAt");
CREATE TABLE "AICourseReferenceChunk" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "referenceId" TEXT NOT NULL REFERENCES "AICourseReference"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL,
  "text" TEXT NOT NULL
);
CREATE UNIQUE INDEX "AICourseReferenceChunk_referenceId_position_key" ON "AICourseReferenceChunk"("referenceId","position");
CREATE INDEX "AICourseReferenceChunk_search_idx" ON "AICourseReferenceChunk" USING GIN (to_tsvector('simple',"text"));
