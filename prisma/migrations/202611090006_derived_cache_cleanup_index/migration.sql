-- @online-index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MetaInsightCache_cleanup_idx" ON "MetaInsightCache" ("updatedAt");
