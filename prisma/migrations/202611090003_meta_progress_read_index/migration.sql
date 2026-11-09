-- @online-index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MetaAdDaily_progress_latest_idx" ON "MetaAdDaily" ("accountId",scope,day,"updatedAt" DESC);
