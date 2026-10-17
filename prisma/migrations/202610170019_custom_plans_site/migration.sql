ALTER TABLE "MembershipPlan" ADD COLUMN "customUserId" TEXT REFERENCES "User"(id), ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_custom_private" CHECK ("customUserId" IS NULL OR "isPublic" = FALSE);
CREATE INDEX "MembershipPlan_customUserId_archivedAt_idx" ON "MembershipPlan"("customUserId","archivedAt");
CREATE TABLE "SiteContent" (
 id TEXT PRIMARY KEY DEFAULT 'public',
 content JSONB NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
