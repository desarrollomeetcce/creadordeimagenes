CREATE TABLE "AICourseLibrary" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "state" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AICourse_library_group_idx" ON "AICourse" ((COALESCE(settings->>'libraryGroup', CASE WHEN settings->>'audience' IN ('children','adolescents') THEN 'children' WHEN settings->>'audience'='families' THEN 'families' WHEN settings->>'audience'='other' THEN 'other' ELSE 'adults' END)), "updatedAt" DESC, id DESC) WHERE "archivedAt" IS NULL;
