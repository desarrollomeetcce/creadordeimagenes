ALTER TABLE "MetaWorkspaceSharing"
  ADD COLUMN "pinnedAccountIds" JSONB,
  ADD COLUMN "primaryAccountIds" JSONB,
  ADD COLUMN "accountPreferencesRevision" INTEGER NOT NULL DEFAULT 0;

-- Recover an existing sharing snapshot; NULL allows one-time import of local preferences.
UPDATE "MetaWorkspaceSharing"
SET "pinnedAccountIds" = (
  SELECT g."pinnedAccountIds" FROM "MetaWorkspaceGrant" g
  WHERE jsonb_typeof(g."pinnedAccountIds") = 'array'
    AND jsonb_array_length(g."pinnedAccountIds") > 0
  ORDER BY g."updatedAt" DESC, g."userId" LIMIT 1
)
WHERE id = 'global';
