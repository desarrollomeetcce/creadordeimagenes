CREATE TABLE "EffectivenessSharing" ("scope" TEXT PRIMARY KEY, "revision" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "EffectivenessGrant" (
  "scope" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "grantedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "permission" "MetaWorkspacePermission" NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("scope", "userId")
);
CREATE INDEX "EffectivenessGrant_userId_idx" ON "EffectivenessGrant"("userId");
