CREATE TYPE "MetaWorkspacePermission" AS ENUM ('VIEW', 'EDIT');
CREATE TABLE "MetaWorkspaceSharing" ("id" TEXT PRIMARY KEY DEFAULT 'global', "revision" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "MetaWorkspaceGrant" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "grantedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "permission" "MetaWorkspacePermission" NOT NULL,
  "pinnedAccountIds" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL
);
