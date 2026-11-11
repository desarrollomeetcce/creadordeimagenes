-- @online-index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CreativeMetaLaunch_audit_idx" ON "CreativeMetaLaunch" ("status", "updatedAt" DESC);
